import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, query, where, limit } from 'firebase/firestore';
import { processMaturedReferrals } from '@/lib/points-system';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';

async function creditPointsForCompletedOrder(orderId: string, orderData: any) {
  const updates: any = {};
  const nowIso = new Date().toISOString();
  updates.deliveredAt = orderData.deliveredAt || nowIso;

  // 1. Purchasing Points: 10 points for each ₱100 spending on purchased items
  if (!orderData.purchasingPointsCredited) {
    const itemsSubtotal = Number(orderData.subTotal || 0);
    const earnedPoints = Math.floor(itemsSubtotal / 100) * 10;
    if (earnedPoints > 0) {
      const custId = orderData.customerId || orderData.tgUserId;
      let userDocRef: any = null;
      if (custId) {
        const uSnap = await getDoc(doc(db, 'users', custId));
        if (uSnap.exists()) {
          userDocRef = uSnap.ref;
          const uData = uSnap.data();
          const currentPts = Number(uData.purchasingPoints || 0);
          const lifetimePts = Number(uData.lifetimePurchasingPoints || 0);
          await updateDoc(userDocRef, {
            purchasingPoints: currentPts + earnedPoints,
            lifetimePurchasingPoints: lifetimePts + earnedPoints,
            firstCompletedOrderDate: uData.firstCompletedOrderDate || updates.deliveredAt,
            updatedAt: nowIso
          });
        }
      }

      if (userDocRef) {
        const txId = `tx-pts-${orderId}-${Date.now()}`;
        await setDoc(doc(db, 'point_transactions', txId), {
          userId: custId,
          type: 'purchasing',
          amount: earnedPoints,
          orderId,
          orderNumber: orderData.orderNumber || orderId,
          description: `Earned ${earnedPoints} Purchasing Points for Order #${orderData.orderNumber || orderId} (₱${itemsSubtotal.toLocaleString()} item spend)`,
          createdAt: nowIso
        });

        updates.purchasingPointsCredited = true;
        updates.purchasingPointsAmount = earnedPoints;
      }
    }
  }

  // 2. Referral Points: 50 Referral Points credited 30 minutes after order Delivered/Completed
  const hasReferrer = orderData.referredByMemberId || orderData.referredByUserId;
  if (hasReferrer && orderData.referralPointsStatus === 'pending') {
    const creditAfter = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    updates.referralPointsCreditAfter = creditAfter;
    updates.referralPointsStatus = 'pending_30m';
  }

  // Also trigger check for matured referrals
  processMaturedReferrals().catch(() => {});

  return updates;
}

function cleanTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const copy: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') {
      copy[key] = (value as any).toDate().toISOString();
    } else if (value && typeof value === 'object') {
      copy[key] = cleanTimestamps(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

function cleanForFirestore<T>(data: T): T {
  if (data === undefined) return null as any;
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(item => cleanForFirestore(item)) as any;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      result[key] = cleanForFirestore(value);
    }
  }
  return result as T;
}

const CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cacheStore.adminOrders && (now - cacheStore.lastAdminOrdersFetchTime < CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.adminOrders);
    }

    const ordersCol = collection(db, 'orders');
    const qOrders = query(ordersCol, limit(150));
    const snap = await getDocs(qOrders);
    const orders = snap.docs.map(d => ({
      id: d.id,
      ...cleanTimestamps(d.data())
    }));

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    cacheStore.adminOrders = orders;
    cacheStore.lastAdminOrdersFetchTime = now;

    return NextResponse.json(orders);
  } catch (error: any) {
    if (cacheStore.adminOrders) {
      return NextResponse.json(cacheStore.adminOrders);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Bulk status update support: { ids: string[], status: string }
    if (Array.isArray(body.ids) && body.ids.length > 0 && body.status) {
      const { ids, status } = body;
      const results: string[] = [];
      for (const orderId of ids) {
        try {
          const oRef = doc(db, 'orders', orderId);
          const oSnap = await getDoc(oRef);
          let extraUpdates = {};
          if (oSnap.exists() && (status === 'Delivered' || status === 'Completed')) {
            extraUpdates = await creditPointsForCompletedOrder(orderId, { ...oSnap.data(), status });
          }
          await updateDoc(oRef, {
            status,
            ...extraUpdates,
            updatedAt: new Date().toISOString()
          });
          results.push(orderId);
        } catch (err) {
          console.warn(`Failed to update order ${orderId}:`, err);
        }
      }
      cacheStore.invalidateOrders();
      return NextResponse.json({ success: true, updatedCount: results.length, ids: results });
    }

    const { 
      id, 
      status, 
      notes, 
      internalNotes,
      paymentStatus, 
      trackingUrl,
      items, 
      subTotal, 
      appliedCharges, 
      deliveryFee, 
      isDeliveryFeeFree,
      deliveryFeePaymentMethod,
      totalAmount, 
      payableNow, 
      payableOnDelivery,
      modificationHistory,
      adjustStock = true
    } = body;

    if (!id) return NextResponse.json({ error: 'Order ID or ids array is required' }, { status: 400 });

    const orderRef = doc(db, 'orders', id);
    const existingSnap = await getDoc(orderRef);
    if (!existingSnap.exists()) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const oldOrder = cleanTimestamps(existingSnap.data());

    const updateData: any = { updatedAt: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (internalNotes !== undefined) updateData.internalNotes = internalNotes;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (trackingUrl !== undefined) updateData.trackingUrl = trackingUrl;

    // Items modification
    if (items !== undefined && Array.isArray(items)) {
      updateData.items = items.map((it: any) => {
        const rawPrice = Number(it.price);
        const price = Number.isFinite(rawPrice) ? Math.max(0, rawPrice) : 0;
        const isFree = Boolean(it.isFree || price === 0);
        return {
          id: String(it.id || ''),
          productId: it.productId ? String(it.productId) : (String(it.id || '').includes('_') ? String(it.id).split('_')[0] : String(it.id || '')),
          variantId: it.variantId && it.variantId !== 'default' ? String(it.variantId) : (String(it.id || '').includes('_') ? String(it.id).split('_')[1] : null),
          name: String(it.name || 'Product'),
          price: isFree ? 0 : price,
          originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : (price || 0),
          isFree,
          quantity: Math.max(1, parseInt(String(it.quantity || 1), 10)),
          imageUrl: it.imageUrl || ''
        };
      });

      const calcSubtotal = updateData.items.reduce((s: number, it: any) => s + (Number(it.price) * Number(it.quantity)), 0);
      updateData.subTotal = subTotal !== undefined ? Number(subTotal) : calcSubtotal;
    }

    // Applied Charges modification
    if (appliedCharges !== undefined && Array.isArray(appliedCharges)) {
      updateData.appliedCharges = appliedCharges.map((ch: any) => {
        const rawAmount = Number(ch.amount);
        const amount = Number.isFinite(rawAmount) ? Math.max(0, rawAmount) : 0;
        const isFree = Boolean(ch.isFree || amount === 0);
        return {
          id: String(ch.id || `charge-${Date.now()}`),
          name: String(ch.name || 'Charge'),
          amount: isFree ? 0 : amount,
          originalAmount: ch.originalAmount !== undefined ? Number(ch.originalAmount) : amount,
          type: ch.type === 'percentage' ? 'percentage' : 'fixed',
          rate: ch.rate !== undefined && Number.isFinite(Number(ch.rate)) ? Number(ch.rate) : null,
          isFree
        };
      });
    }

    // Delivery Fee modification
    if (deliveryFee !== undefined) {
      const rawFee = Number(deliveryFee);
      const isFree = Boolean(isDeliveryFeeFree || rawFee === 0);
      updateData.deliveryFee = isFree ? 0 : (Number.isFinite(rawFee) ? Math.max(0, rawFee) : 0);
      updateData.isDeliveryFeeFree = isFree;
    } else if (isDeliveryFeeFree !== undefined) {
      updateData.isDeliveryFeeFree = Boolean(isDeliveryFeeFree);
      if (isDeliveryFeeFree) {
        updateData.deliveryFee = 0;
      }
    }

    if (deliveryFeePaymentMethod !== undefined) {
      updateData.deliveryFeePaymentMethod = deliveryFeePaymentMethod;
    }

    // Financial totals recalculation
    if (totalAmount !== undefined) {
      updateData.totalAmount = Math.max(0, Number(totalAmount));
    } else if (updateData.items !== undefined || updateData.appliedCharges !== undefined || updateData.deliveryFee !== undefined) {
      const activeSubtotal = updateData.subTotal !== undefined ? updateData.subTotal : Number(oldOrder.subTotal || 0);
      const activeCharges = updateData.appliedCharges !== undefined ? updateData.appliedCharges : (Array.isArray(oldOrder.appliedCharges) ? oldOrder.appliedCharges : []);
      const chargesSum = activeCharges.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
      const activeDeliveryFee = updateData.deliveryFee !== undefined ? updateData.deliveryFee : Number(oldOrder.deliveryFee || 0);
      const activeDeliveryMethod = updateData.deliveryFeePaymentMethod || oldOrder.deliveryFeePaymentMethod || 'upon_checkout';

      const computedTotal = activeSubtotal + chargesSum + (activeDeliveryMethod === 'upon_checkout' ? activeDeliveryFee : 0);
      updateData.totalAmount = Math.max(0, computedTotal);
    }

    // Payable Now & On Delivery
    const finalDeliveryMethod = updateData.deliveryFeePaymentMethod || oldOrder.deliveryFeePaymentMethod || 'upon_checkout';
    const finalDeliveryFee = updateData.deliveryFee !== undefined ? updateData.deliveryFee : Number(oldOrder.deliveryFee || 0);

    if (payableNow !== undefined) {
      updateData.payableNow = Math.max(0, Number(payableNow));
    } else if (updateData.totalAmount !== undefined) {
      updateData.payableNow = updateData.totalAmount;
    }

    if (payableOnDelivery !== undefined) {
      updateData.payableOnDelivery = Math.max(0, Number(payableOnDelivery));
    } else if (finalDeliveryMethod === 'upon_delivery') {
      updateData.payableOnDelivery = finalDeliveryFee;
    } else {
      updateData.payableOnDelivery = 0;
    }

    // Modification Audit History
    if (modificationHistory !== undefined) {
      updateData.modificationHistory = modificationHistory;
    } else if (items !== undefined || appliedCharges !== undefined || deliveryFee !== undefined) {
      const existingHistory = Array.isArray(oldOrder.modificationHistory) ? oldOrder.modificationHistory : [];
      updateData.modificationHistory = [
        ...existingHistory,
        {
          modifiedAt: new Date().toISOString(),
          adminUser: 'Admin',
          previousTotal: Number(oldOrder.totalAmount) || 0,
          newTotal: updateData.totalAmount !== undefined ? updateData.totalAmount : Number(oldOrder.totalAmount || 0),
          itemCount: updateData.items ? updateData.items.length : (oldOrder.items?.length || 0),
          notes: notes || 'Admin modified items, pricing, or charges'
        }
      ];
    }

    // Stock Reconciliation
    if (adjustStock && items !== undefined && Array.isArray(items)) {
      try {
        const oldItems: any[] = Array.isArray(oldOrder.items) ? oldOrder.items : [];
        const newItems: any[] = updateData.items;

        const resolveBasePid = (it: any): string => {
          if (it.productId) return String(it.productId);
          const raw = String(it.id || '');
          return raw.includes('_') ? raw.split('_')[0] : raw;
        };

        const resolveVid = (it: any): string | null => {
          if (it.variantId && it.variantId !== 'default') return String(it.variantId);
          const raw = String(it.id || '');
          return raw.includes('_') ? raw.split('_')[1] : null;
        };

        const oldQtyMap = new Map<string, { pid: string; vid: string | null; qty: number }>();
        for (const it of oldItems) {
          const pid = resolveBasePid(it);
          const vid = resolveVid(it);
          const key = `${pid}::${vid || 'base'}`;
          const cur = oldQtyMap.get(key) || { pid, vid, qty: 0 };
          cur.qty += Number(it.quantity) || 1;
          oldQtyMap.set(key, cur);
        }

        const newQtyMap = new Map<string, { pid: string; vid: string | null; qty: number }>();
        for (const it of newItems) {
          const pid = resolveBasePid(it);
          const vid = resolveVid(it);
          const key = `${pid}::${vid || 'base'}`;
          const cur = newQtyMap.get(key) || { pid, vid, qty: 0 };
          cur.qty += Number(it.quantity) || 1;
          newQtyMap.set(key, cur);
        }

        const allKeysList = Array.from(new Set([...Array.from(oldQtyMap.keys()), ...Array.from(newQtyMap.keys())]));
        for (let i = 0; i < allKeysList.length; i++) {
          const key = allKeysList[i];
          const oldEntry = oldQtyMap.get(key);
          const newEntry = newQtyMap.get(key);
          const oldQty = oldEntry ? oldEntry.qty : 0;
          const newQty = newEntry ? newEntry.qty : 0;
          const delta = newQty - oldQty;

          if (delta !== 0) {
            const target = newEntry || oldEntry;
            if (target && target.pid) {
              const pid = target.pid;
              const vid = target.vid;
              const pRef = doc(db, 'products', pid);
              const pSnap = await getDoc(pRef);
              if (pSnap.exists()) {
                const pData = pSnap.data();
                const currentStock = Number(pData.stock) || 0;
                const updatedStock = Math.max(0, currentStock - delta);
                const pUpdate: any = { stock: updatedStock, updatedAt: new Date().toISOString() };

                if (vid && Array.isArray(pData.variants)) {
                  const variants = [...pData.variants];
                  const vIdx = variants.findIndex((v: any) => String(v.id) === vid);
                  if (vIdx >= 0 && typeof variants[vIdx].stock === 'number') {
                    variants[vIdx].stock = Math.max(0, variants[vIdx].stock - delta);
                    pUpdate.variants = variants;
                  }
                }
                await updateDoc(pRef, pUpdate);
              }
            }
          }
        }
      } catch (stockErr) {
        console.warn("Stock adjustment warning during order modification:", stockErr);
      }
    }

    const finalStatus = updateData.status !== undefined ? updateData.status : oldOrder.status;
    if (finalStatus === 'Delivered' || finalStatus === 'Completed') {
      const ptUpdates = await creditPointsForCompletedOrder(id, { ...oldOrder, ...updateData, status: finalStatus });
      Object.assign(updateData, ptUpdates);
    }

    const cleanedData = cleanForFirestore(updateData);
    await updateDoc(orderRef, cleanedData);
    cacheStore.invalidateOrders();

    return NextResponse.json({ 
      success: true, 
      order: { id, ...oldOrder, ...cleanedData } 
    });
  } catch (error: any) {
    console.error("Modify Order error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const orderRef = doc(db, 'orders', id);
    await deleteDoc(orderRef);
    cacheStore.invalidateOrders();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
