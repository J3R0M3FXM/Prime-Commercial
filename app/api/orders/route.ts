import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, getDoc, doc, runTransaction, updateDoc, query, where, setDoc, limit, orderBy } from 'firebase/firestore';
import { calculatePromoDiscount, type PromoConfig } from '@/lib/promos';
import { cacheStore } from '@/lib/cache';

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
      promoCode,
      referralCode,
      appliedStoreCredits,
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
    const rawDevLat = Number(deviceSnapshot?.location?.lat ?? deviceSnapshot?.location?.latitude);
    const rawDevLon = Number(deviceSnapshot?.location?.lon ?? deviceSnapshot?.location?.longitude);
    const hasValidDeviceCoords = Number.isFinite(rawDevLat) && Number.isFinite(rawDevLon) && (rawDevLat !== 0 || rawDevLon !== 0);

    if (hasValidDeviceCoords) {
      try {
        const geoKey = process.env.GEOAPIFY_API_KEY;
        if (geoKey) {
          const geoUrl = `https://api.geoapify.com/v1/geocode/reverse?lat=${rawDevLat}&lon=${rawDevLon}&format=json&apiKey=${geoKey}`;
          const gRes = await fetch(geoUrl, { signal: AbortSignal.timeout(3000) });
          if (gRes.ok) {
            const gData = await gRes.json();
            gpsStreetAddress = gData.results?.[0]?.formatted || '';
          }
        }
        if (!gpsStreetAddress) {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${rawDevLat}&lon=${rawDevLon}&zoom=18&addressdetails=1`;
          const nomRes = await fetch(nomUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrimeStoreFront/1.0' },
            signal: AbortSignal.timeout(3000)
          });
          if (nomRes.ok) {
            const nomData = await nomRes.json();
            gpsStreetAddress = nomData.display_name || '';
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
          let safeDeliveryFee = Number(deliveryFee) || 0;
          const isDeliveryUponDelivery = String(deliveryFeePaymentMethod || '').toLowerCase() === 'upon_delivery';

          // 4a. Process Promo Code (Marketplace Rules Enforced)
          let promoDiscount = 0;
          let promoTitle = '';
          let promoIdApplied = '';
          let isFreeShipping = false;
          let promoCashbackPoints = 0;

          const rawPromo = String(promoCode || '').trim().toUpperCase();
          const cleanDevId = String(deviceSnapshot?.deviceId || deviceSnapshot?.device_id || body.deviceId || '').trim();
          const cleanHwId = String(deviceSnapshot?.hardwareId || '').trim();

          if (rawPromo) {
            try {
              const promoQ = query(collection(db, 'promos'), where('code', '==', rawPromo));
              const promoSnap = await getDocs(promoQ);
              if (!promoSnap.empty) {
                const promoDoc = promoSnap.docs[0];
                const pData = promoDoc.data() as PromoConfig;
                const nowIso = new Date().toISOString();

                const isDateValid = (!pData.startDate || pData.startDate <= nowIso) && (!pData.endDate || pData.endDate >= nowIso);
                const isMinSpendValid = !pData.minSpend || itemsSubtotal >= pData.minSpend;
                const totalItemQty = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
                const isMinQtyValid = !pData.minItemQuantity || totalItemQty >= pData.minItemQuantity;
                const isQuotaValid = !pData.totalUsageLimit || (pData.usageCount || 0) < pData.totalUsageLimit;
                const isActive = pData.isActive !== false;

                // Philippine Schedule check
                const now = new Date();
                const phtDateObj = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
                const phtDay = phtDateObj.getDay();
                const phtDate = phtDateObj.getDate();
                const phtHour = phtDateObj.getHours();

                let isScheduleValid = true;
                if (Array.isArray(pData.activeDaysOfWeek) && pData.activeDaysOfWeek.length > 0 && pData.activeDaysOfWeek.length < 7) {
                  if (!pData.activeDaysOfWeek.includes(phtDay)) isScheduleValid = false;
                }
                if (pData.isPaydayOnly) {
                  const isPayday = (phtDate >= 14 && phtDate <= 16) || phtDate >= 28;
                  if (!isPayday) isScheduleValid = false;
                }
                if (pData.flashHourStart !== undefined && pData.flashHourStart !== null && 
                    pData.flashHourEnd !== undefined && pData.flashHourEnd !== null) {
                  if (phtHour < Number(pData.flashHourStart) || phtHour >= Number(pData.flashHourEnd)) {
                    isScheduleValid = false;
                  }
                }

                // Payment and courier restrictions
                let isChannelValid = true;
                const currentPm = isDeliveryUponDelivery ? 'upon_delivery' : (deliveryFeePaymentMethod || 'upon_checkout');
                if (Array.isArray(pData.allowedPaymentMethods) && pData.allowedPaymentMethods.length > 0 && !pData.allowedPaymentMethods.includes('all')) {
                  if (!pData.allowedPaymentMethods.includes(currentPm.toLowerCase())) {
                    isChannelValid = false;
                  }
                }
                if (courier?.id && Array.isArray(pData.allowedCourierIds) && pData.allowedCourierIds.length > 0 && !pData.allowedCourierIds.includes('all')) {
                  if (!pData.allowedCourierIds.includes(courier.id)) {
                    isChannelValid = false;
                  }
                }

                // Device Fingerprinting Check
                let isFraud = false;
                if (cleanDevId || cleanHwId) {
                  const redQ = query(collection(db, 'promo_redemptions'), where('promoCode', '==', rawPromo));
                  const redSnap = await getDocs(redQ);
                  const devMatches = redSnap.docs.filter(rd => {
                    const r = rd.data();
                    const dMatch = cleanDevId && r.deviceId && String(r.deviceId).trim() === cleanDevId;
                    const hMatch = cleanHwId && r.hardwareId && String(r.hardwareId).trim() === cleanHwId;
                    const isOther = (customerId && r.customerId !== customerId) || (finalMemberId && r.primeMemberId !== finalMemberId);
                    return (dMatch || hMatch) && isOther;
                  });
                  if (devMatches.length > 0) {
                    isFraud = true;
                  }
                }

                if (isActive && isDateValid && isMinSpendValid && isMinQtyValid && isQuotaValid && isScheduleValid && isChannelValid && !isFraud) {
                  const discResult = calculatePromoDiscount(pData, itemsSubtotal, safeDeliveryFee);
                  promoDiscount = discResult.discount;
                  isFreeShipping = discResult.isFreeShipping;
                  promoCashbackPoints = discResult.cashbackPoints;
                  promoTitle = pData.title || pData.code;
                  promoIdApplied = promoDoc.id;

                  if (discResult.shippingSubsidy > 0) {
                    safeDeliveryFee = Math.max(0, safeDeliveryFee - discResult.shippingSubsidy);
                  }

                  // Update usage count
                  transaction.update(promoDoc.ref, {
                    usageCount: (pData.usageCount || 0) + 1,
                    updatedAt: nowIso
                  });

                  // Log redemption for fraud tracking
                  const redId = `red_${orderNumber}_${Date.now()}`;
                  const redRef = doc(db, 'promo_redemptions', redId);
                  transaction.set(redRef, {
                    promoCode: rawPromo,
                    promoId: promoDoc.id,
                    customerId: customerId || '',
                    primeMemberId: finalMemberId || '',
                    orderId: orderNumber,
                    deviceId: cleanDevId,
                    hardwareId: cleanHwId,
                    discountAmount: promoDiscount,
                    shippingSubsidy: discResult.shippingSubsidy,
                    cashbackPoints: discResult.cashbackPoints,
                    usedAt: nowIso
                  });
                }
              }
            } catch (pErr) {
              console.warn("Promo evaluation failed:", pErr);
            }
          }

          if (isFreeShipping) {
            safeDeliveryFee = 0;
          }

          // 4b. Process Referral Code
          let orderReferredByMemberId = '';
          let orderReferredByName = '';
          let orderReferredByUserId = '';
          let orderReferralPointsStatus: string | null = null;

          const rawReferral = String(referralCode || '').trim().toUpperCase();
          if (rawReferral && rawReferral !== finalMemberId) {
            try {
              const refQ = query(collection(db, 'users'), where('primeMemberId', '==', rawReferral));
              const refSnap = await getDocs(refQ);
              if (!refSnap.empty) {
                const refUserDoc = refSnap.docs[0];
                if (refUserDoc.id !== customerId) {
                  const refUserData = refUserDoc.data();
                  orderReferredByMemberId = rawReferral;
                  orderReferredByName = refUserData.tgName || 'Member';
                  orderReferredByUserId = refUserDoc.id;
                  orderReferralPointsStatus = 'pending';

                  // Tag customer user doc with referrer if not already tagged
                  if (customerId) {
                    const custUserRef = doc(db, 'users', customerId);
                    transaction.set(custUserRef, {
                      referredByMemberId: rawReferral,
                      referredByName: refUserData.tgName || 'Member',
                      referredByUserId: refUserDoc.id,
                      referredAt: new Date().toISOString()
                    }, { merge: true });
                  }
                }
              }
            } catch (rErr) {
              console.warn("Referral evaluation failed:", rErr);
            }
          }

          // 4c. Process Store Credits
          let safeStoreCreditsUsed = 0;
          const requestedCredits = Math.max(0, Math.floor(Number(appliedStoreCredits) || 0));
          const intermediateSubtotal = Math.max(0, itemsSubtotal - promoDiscount);
          const maxPayableBeforeCredits = intermediateSubtotal + chargesTotal + (isDeliveryUponDelivery ? 0 : safeDeliveryFee);

          if (requestedCredits > 0 && customerId) {
            const custUserRef = doc(db, 'users', customerId);
            const custUserSnap = await transaction.get(custUserRef);
            if (custUserSnap.exists()) {
              const custData = custUserSnap.data();
              const availableCredits = Number(custData.storeCredits || 0);
              safeStoreCreditsUsed = Math.min(requestedCredits, availableCredits, maxPayableBeforeCredits);

              if (safeStoreCreditsUsed > 0) {
                // Deduct store credits atomically
                transaction.update(custUserRef, {
                  storeCredits: availableCredits - safeStoreCreditsUsed,
                  updatedAt: new Date().toISOString()
                });

                // Record point transaction
                const creditTxId = `tx-use-${orderNumber}-${Date.now()}`;
                const creditTxRef = doc(db, 'point_transactions', creditTxId);
                transaction.set(creditTxRef, {
                  userId: customerId,
                  type: 'store_credit_usage',
                  amount: -safeStoreCreditsUsed,
                  orderId: orderNumber,
                  description: `Applied ₱${safeStoreCreditsUsed.toLocaleString()} Store Credits to Order #${orderNumber}`,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }

          // 4d. Final recalculation of Total Amount payable on server level
          const calculatedTotal = Math.max(
            0,
            intermediateSubtotal + chargesTotal + (isDeliveryUponDelivery ? 0 : safeDeliveryFee) - safeStoreCreditsUsed
          );
          
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
            deliveryFeePaymentMethod: isDeliveryUponDelivery ? 'upon_delivery' : 'upon_checkout',
            receiverName: receiverName || '',
            receiverPhone: receiverPhone || '',
            deliveryAddress: deliveryAddress || null,
            courier: courier || null,
            promoCode: (promoDiscount > 0 || isFreeShipping || promoCashbackPoints > 0) ? rawPromo : null,
            promoDiscount,
            promoTitle: (promoDiscount > 0 || isFreeShipping || promoCashbackPoints > 0) ? promoTitle : null,
            promoId: (promoDiscount > 0 || isFreeShipping || promoCashbackPoints > 0) ? promoIdApplied : null,
            isFreeShipping,
            promoCashbackPoints: promoCashbackPoints || 0,
            storeCreditsUsed: safeStoreCreditsUsed,
            referralCode: orderReferredByMemberId || null,
            referredByMemberId: orderReferredByMemberId || null,
            referredByName: orderReferredByName || null,
            referredByUserId: orderReferredByUserId || null,
            referralPointsStatus: orderReferralPointsStatus || null,
            totalAmount: calculatedTotal,
            payableNow: calculatedTotal,
            payableOnDelivery: isDeliveryUponDelivery ? safeDeliveryFee : 0,
            status: 'Pending',
            notes: notes || '',
            ip: clientIp || deviceSnapshot?.ip || '',
            deviceId: deviceSnapshot?.deviceId || deviceSnapshot?.device_id || body.deviceId || '',
            sessionToken: body.sessionToken || deviceSnapshot?.sessionToken || '',
            coordinates: hasValidDeviceCoords ? `${rawDevLat}, ${rawDevLon}` : '',
            gpsStreetAddress: hasValidDeviceCoords ? (gpsStreetAddress || `${rawDevLat.toFixed(5)}, ${rawDevLon.toFixed(5)}`) : '',
            deviceSnapshot: deviceSnapshot ? {
              ...deviceSnapshot,
              deviceId: deviceSnapshot.deviceId || body.deviceId || '',
              sessionToken: deviceSnapshot.sessionToken || body.sessionToken || '',
              ip: clientIp || deviceSnapshot.ip || '',
              location: hasValidDeviceCoords ? {
                ...deviceSnapshot.location,
                lat: rawDevLat,
                lon: rawDevLon,
                latitude: rawDevLat,
                longitude: rawDevLon,
                formattedStreetAddress: gpsStreetAddress || '',
                streetAddress: gpsStreetAddress || ''
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

    cacheStore.invalidateOrders();

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

const PUBLIC_ORDERS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || searchParams.get('id');
    const orderNumber = searchParams.get('orderNumber');
    const customerId = searchParams.get('customerId');

    // 1. High-Efficiency Single Order Lookup by ID (1 Read only!)
    if (orderId) {
      const orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        return NextResponse.json({ id: snap.id, ...cleanTimestamps(snap.data()) });
      }
      // If not found by doc id, try querying by orderNumber
      const qNum = query(collection(db, 'orders'), where('orderNumber', '==', orderId), limit(1));
      const snapNum = await getDocs(qNum);
      if (!snapNum.empty) {
        const foundDoc = snapNum.docs[0];
        return NextResponse.json({ id: foundDoc.id, ...cleanTimestamps(foundDoc.data()) });
      }
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 2. High-Efficiency Single Order Lookup by Order Number (1 Read only!)
    if (orderNumber) {
      const q = query(collection(db, 'orders'), where('orderNumber', '==', orderNumber), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const foundDoc = snap.docs[0];
        return NextResponse.json({ id: foundDoc.id, ...cleanTimestamps(foundDoc.data()) });
      }
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 3. Customer-Targeted Orders Query (bounded to 50 items max)
    if (customerId) {
      const qCust = query(
        collection(db, 'orders'),
        where('customerId', '==', customerId),
        limit(50)
      );
      const snapCust = await getDocs(qCust);
      const orders = snapCust.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
      orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      return NextResponse.json(orders);
    }

    // 4. Cached General Order List (strictly capped & cached for 60s)
    const now = Date.now();
    let allOrders = cacheStore.orders;
    if (!allOrders || (now - cacheStore.lastOrdersFetchTime > PUBLIC_ORDERS_CACHE_TTL_MS)) {
      const ordersCol = collection(db, 'orders');
      const qRecent = query(ordersCol, limit(100));
      const snap = await getDocs(qRecent);
      allOrders = snap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
      allOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      cacheStore.orders = allOrders;
      cacheStore.lastOrdersFetchTime = now;
    }

    return NextResponse.json(allOrders);
  } catch (error: any) {
    if (cacheStore.orders) {
      return NextResponse.json(cacheStore.orders);
    }
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

    cacheStore.invalidateOrders();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating order payment proof:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
