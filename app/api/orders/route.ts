import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, runTransaction, updateDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

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

/**
 * Recursively strips `undefined` fields or normalizes them so Firestore never
 * throws "Unsupported field value: undefined" error.
 */
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

function getOrderNumber(): string {
  const d = new Date();
  // Adjust to Philippine Time (UTC + 8)
  const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const DD = pad(pht.getUTCDate());
  const MM = pad(pht.getUTCMonth() + 1);
  const YY = pht.getUTCFullYear().toString().slice(-2);
  const HH = pad(pht.getUTCHours());
  const MIN = pad(pht.getUTCMinutes());
  const SS = pad(pht.getUTCSeconds());
  return `${DD}${MM}${YY}${HH}${MIN}${SS}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      items, 
      customerId, 
      customerName, 
      customerUsername, 
      primeMemberId, 
      subTotal,
      appliedCharges,
      totalAmount, 
      receiverName,
      receiverPhone,
      deliveryAddress,
      courier,
      deliveryFee,
      deliveryFeePaymentMethod,
      payableNow,
      payableOnDelivery,
      deviceSnapshot,
      notes 
    } = body;

    if (!items || !items.length) {
      return NextResponse.json({ error: 'Cart items are required' }, { status: 400 });
    }

    let finalMemberId = primeMemberId || '';
    if (!finalMemberId && customerId) {
      try {
        const uSnap = await getDoc(doc(db, 'users', customerId));
        if (uSnap.exists()) {
          finalMemberId = uSnap.data().primeMemberId || '';
        }
      } catch (e) {
        console.warn("Could not query user for memberId:", e);
      }
    }

    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const clientIp = forwarded ? forwarded.split(",")[0].trim() : (realIp || "");

    let gpsStreetAddress = '';
    if (deviceSnapshot?.location?.lat && deviceSnapshot?.location?.lon) {
      try {
        const geoKey = process.env.GEOAPIFY_API_KEY;
        if (geoKey) {
          const geoUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${deviceSnapshot.location.lat}&lon=${deviceSnapshot.location.lon}&format=json&apiKey=${geoKey}`;
          const gRes = await fetch(geoUrl, { signal: AbortSignal.timeout(2000) });
          if (gRes.ok) {
            const gData = await gRes.json();
            gpsStreetAddress = gData.results?.[0]?.formatted || '';
          }
        }
      } catch (e) {
        console.warn("Could not reverse geocode order GPS:", e);
      }
    }

    const MAX_RETRIES = 5;
    let orderCreated = false;
    let finalOrderData: any = null;
    
    let orderNumber = getOrderNumber();
    let orderDocRef = doc(db, 'orders', orderNumber);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await runTransaction(db, async (transaction) => {
          // 1. Check if order number already exists (collision)
          const orderSnap = await transaction.get(orderDocRef);
          if (orderSnap.exists()) {
            throw new Error("ORDER_NUMBER_COLLISION");
          }

          // 2. Pull real-time stock levels and prepare updates
          // Extract base product ID and variant ID correctly for both simple and variant items
          const resolvePid = (it: any): string => {
            if (it.productId) return String(it.productId);
            const raw = String(it.id || '');
            return raw.includes('_') ? raw.split('_')[0] : raw;
          };

          const resolveVid = (it: any): string | null => {
            if (it.variantId && it.variantId !== 'default') return String(it.variantId);
            const raw = String(it.id || '');
            return raw.includes('_') ? raw.split('_')[1] : null;
          };

          // 2a. Gather all unique candidate product IDs
          const candidateProductIds = Array.from(new Set([
            ...items.map((it: any) => resolvePid(it)),
            ...items.map((it: any) => String(it.id || ''))
          ].filter(Boolean)));

          const productDocs = await Promise.all(
            candidateProductIds.map(pid => transaction.get(doc(db, 'products', pid)))
          );

          const productDocMap = new Map<string, { ref: any; data: any; exists: boolean }>();
          candidateProductIds.forEach((pid, idx) => {
            const pDoc = productDocs[idx];
            productDocMap.set(pid, {
              ref: pDoc.ref,
              data: pDoc.exists() ? pDoc.data() : null,
              exists: pDoc.exists()
            });
          });

          // 2b. Validate stock per item and group updates by product document
          const stockUpdatesByDocId = new Map<string, {
            ref: any;
            newStock: number;
            variants?: any[];
          }>();

          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const pid = resolvePid(it);
            const rawId = String(it.id || '');

            let pEntry = productDocMap.get(pid);
            if (!pEntry?.exists && rawId && productDocMap.get(rawId)?.exists) {
              pEntry = productDocMap.get(rawId);
            }

            if (!pEntry || !pEntry.exists) {
              throw new Error(`Product "${it.name || 'Item'}" not found`);
            }

            const pData = pEntry.data;
            const docId = pEntry.ref.id;
            const requestedQty = Number(it.quantity) || 1;

            const currentRecord = stockUpdatesByDocId.get(docId) || {
              ref: pEntry.ref,
              newStock: typeof pData.stock === 'number' ? pData.stock : 0,
              variants: Array.isArray(pData.variants) ? JSON.parse(JSON.stringify(pData.variants)) : undefined
            };

            // Deduct variant stock if item has variant specified
            const variantId = resolveVid(it);
            if (currentRecord.variants && variantId) {
              const vIdx = currentRecord.variants.findIndex((v: any) => String(v.id) === String(variantId));
              if (vIdx >= 0) {
                const vStock = typeof currentRecord.variants[vIdx].stock === 'number'
                  ? currentRecord.variants[vIdx].stock
                  : currentRecord.newStock;
                if (vStock < requestedQty) {
                  throw new Error(`Insufficient stock for "${it.name}". Available: ${vStock}`);
                }
                currentRecord.variants[vIdx].stock = Math.max(0, vStock - requestedQty);
              }
            }

            // Deduct overall product stock
            if (currentRecord.newStock < requestedQty) {
              throw new Error(`Insufficient stock for "${it.name}". Available: ${currentRecord.newStock}`);
            }

            currentRecord.newStock = Math.max(0, currentRecord.newStock - requestedQty);
            stockUpdatesByDocId.set(docId, currentRecord);
          }

          // 3. Update stock levels in Firestore
          stockUpdatesByDocId.forEach((update) => {
            const updatePayload: any = {
              stock: update.newStock,
              updatedAt: new Date().toISOString()
            };
            if (update.variants) {
              updatePayload.variants = update.variants;
            }
            transaction.update(update.ref, updatePayload);
          });

          // 4. Create the order with accurate financial snapshotting
          const itemsSubtotal = Number(subTotal) || items.reduce((sum: number, it: any) => {
            const isFree = Boolean(it.isFree || Number(it.price) === 0);
            return sum + (isFree ? 0 : (Number(it.price) || 0)) * (Number(it.quantity) || 1);
          }, 0);
          const sanitizedCharges = Array.isArray(appliedCharges) ? appliedCharges.map((ch: any) => {
            const entry: Record<string, any> = {
              id: String(ch.id || ''),
              name: String(ch.name || 'Charge'),
              amount: Number(ch.amount) || 0,
              type: ch.type === 'percentage' ? 'percentage' : 'fixed'
            };
            if (ch.rate !== undefined && ch.rate !== null && Number.isFinite(Number(ch.rate))) {
              entry.rate = Number(ch.rate);
            }
            return entry;
          }) : [];
          const chargesTotal = sanitizedCharges.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
          const safeDeliveryFee = Number(deliveryFee) || 0;
          const calculatedTotal = totalAmount !== undefined 
            ? Number(totalAmount) 
            : (itemsSubtotal + chargesTotal + (deliveryFeePaymentMethod === 'upon_checkout' ? safeDeliveryFee : 0));
          
          finalOrderData = {
            orderNumber,
            customerId: customerId || '',
            tgUserId: customerId || '',
            customerName: customerName || 'Customer',
            customerUsername: customerUsername || '',
            primeMemberId: finalMemberId || '',
            items: items.map((it: any) => {
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
            }),
            subTotal: itemsSubtotal,
            appliedCharges: sanitizedCharges,
            deliveryFee: safeDeliveryFee,
            deliveryFeePaymentMethod: deliveryFeePaymentMethod || 'upon_checkout',
            receiverName: receiverName || '',
            receiverPhone: receiverPhone || '',
            deliveryAddress: deliveryAddress || null,
            courier: courier || null,
            totalAmount: calculatedTotal,
            payableNow: payableNow !== undefined ? Number(payableNow) : calculatedTotal,
            payableOnDelivery: payableOnDelivery !== undefined ? Number(payableOnDelivery) : 0,
            status: 'Pending',
            notes: notes || '',
            ip: clientIp || deviceSnapshot?.ip || '',
            deviceId: deviceSnapshot?.deviceId || deviceSnapshot?.device_id || body.deviceId || '',
            sessionToken: body.sessionToken || deviceSnapshot?.sessionToken || '',
            coordinates: body.coordinates || (deviceSnapshot?.location?.lat && deviceSnapshot?.location?.lon ? `${deviceSnapshot.location.lat}, ${deviceSnapshot.location.lon}` : ''),
            gpsStreetAddress: gpsStreetAddress || '',
            deviceSnapshot: deviceSnapshot ? {
              ...deviceSnapshot,
              deviceId: deviceSnapshot.deviceId || body.deviceId || '',
              sessionToken: deviceSnapshot.sessionToken || body.sessionToken || '',
              ip: clientIp || deviceSnapshot.ip || '',
              location: deviceSnapshot.location ? {
                ...deviceSnapshot.location,
                formattedStreetAddress: gpsStreetAddress || '',
                streetAddress: gpsStreetAddress || deviceSnapshot.location.streetAddress || ''
              } : null
            } : (clientIp ? { ip: clientIp, deviceId: body.deviceId || '', sessionToken: body.sessionToken || '' } : null),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const safeOrderData = cleanForFirestore(finalOrderData);
          transaction.set(orderDocRef, safeOrderData);
          finalOrderData = safeOrderData;
        });
        
        orderCreated = true;
        break; // Transaction successful
      } catch (e: any) {
        if (e.message === "ORDER_NUMBER_COLLISION") {
          // Wait exactly 1 second to shift to the next second slot
          await new Promise(resolve => setTimeout(resolve, 1000));
          orderNumber = getOrderNumber();
          orderDocRef = doc(db, 'orders', orderNumber);
        } else {
          // Throw stock or other errors immediately to client
          throw e; 
        }
      }
    }

    if (!orderCreated) {
       throw new Error("System is processing high volume of transactions. Please try again.");
    }

    return NextResponse.json({ 
      success: true, 
      id: orderNumber, 
      ...finalOrderData 
    });
  } catch (error: any) {
    console.error('Error creating order:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    const ordersCol = collection(db, 'orders');
    const snap = await getDocs(ordersCol);
    let orders = snap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));

    if (customerId) {
      orders = orders.filter((o: any) => o.customerId === customerId || o.tgUserId === customerId);
    }

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return NextResponse.json(orders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const {
      orderId,
      paymentMethodId,
      paymentMethodName,
      paymentProofImage
    } = data;

    if (!orderId) {
      return NextResponse.json({ error: "Missing order ID" }, { status: 400 });
    }

    const orderDocRef = doc(db, 'orders', orderId);
    await updateDoc(orderDocRef, {
      paymentMethodId: paymentMethodId || '',
      paymentMethodName: paymentMethodName || '',
      paymentProofImage: paymentProofImage || '',
      paymentStatus: 'Pending Review',
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating order payment proof:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
