import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { calculateCustomerTier } from '@/lib/points-system';
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

const CUSTOMERS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');

    // 1. Single Customer Profile
    if (customerId) {
      let userRef = doc(db, 'users', customerId);
      let userSnap = await getDoc(userRef);
      let targetId = customerId;

      if (!userSnap.exists()) {
        const usersCol = collection(db, 'users');
        const qPrime = query(usersCol, where('primeMemberId', '==', customerId), limit(1));
        const primeSnap = await getDocs(qPrime);
        if (!primeSnap.empty) {
          userSnap = primeSnap.docs[0];
          targetId = userSnap.id;
        } else {
          const qTg = query(usersCol, where('tgUserId', '==', customerId), limit(1));
          const tgSnap = await getDocs(qTg);
          if (!tgSnap.empty) {
            userSnap = tgSnap.docs[0];
            targetId = userSnap.id;
          }
        }
      }

      if (!userSnap.exists()) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }

      const userData = cleanTimestamps(userSnap.data());

      // Fetch recorded sessions for this customer
      let fingerprints: any[] = [];
      try {
        const fpCol = collection(db, 'users', targetId, 'fingerprints');
        const fpQ = query(fpCol, limit(15));
        const fpSnap = await getDocs(fpQ);
        fingerprints = fpSnap.docs.map(d => ({
          id: d.id,
          ...cleanTimestamps(d.data())
        }));
        fingerprints.sort((a, b) => {
          const tA = new Date(a.createdAt || a.lastSeen || 0).getTime();
          const tB = new Date(b.createdAt || b.lastSeen || 0).getTime();
          return tB - tA;
        });
      } catch (err) {
        console.warn(`Failed to fetch sessions for customer ${targetId}:`, err);
      }

      const currentDeviceId = userData.deviceId || userData.latestFingerprint?.deviceId || fingerprints[0]?.deviceId || "";
      const currentHardwareId = userData.hardwareId || userData.latestFingerprint?.hardwareId || fingerprints[0]?.hardwareId || "";

      // Promo Fraud Detection: Check if other accounts share this Device ID with targeted limit query
      let sharedAccounts: any[] = [];
      try {
        if (currentDeviceId) {
          const qDev = query(collection(db, 'users'), where('deviceId', '==', currentDeviceId), limit(10));
          const devSnap = await getDocs(qDev);
          devSnap.docs.forEach(uDoc => {
            if (uDoc.id !== customerId && uDoc.id !== targetId) {
              const uData = uDoc.data();
              sharedAccounts.push({
                id: uDoc.id,
                name: uData.tgName || `User ${uDoc.id}`,
                username: uData.tgUsername || "",
                memberId: uData.primeMemberId || "",
                lastSeen: uData.lastSeen || uData.createdAt || ""
              });
            }
          });
        }
      } catch (err) {
        console.warn("Fraud check error:", err);
      }

      // Fetch order history for this customer with targeted queries (NOT unbounded getDocs)
      let orders: any[] = [];
      try {
        const ordersCol = collection(db, 'orders');
        const qOrders = query(ordersCol, where('customerId', '==', targetId), limit(50));
        const ordersSnap = await getDocs(qOrders);
        const map = new Map<string, any>();
        ordersSnap.docs.forEach(d => {
          map.set(d.id, { id: d.id, ...cleanTimestamps(d.data()) });
        });

        if (userData.primeMemberId) {
          const qMem = query(ordersCol, where('primeMemberId', '==', userData.primeMemberId), limit(50));
          const memSnap = await getDocs(qMem);
          memSnap.docs.forEach(d => {
            map.set(d.id, { id: d.id, ...cleanTimestamps(d.data()) });
          });
        }

        orders = Array.from(map.values());
        orders.sort((a, b) => {
          const tA = new Date(a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt || 0).getTime();
          return tB - tA;
        });
      } catch (ordErr) {
        console.warn(`Failed to fetch orders for customer ${customerId}:`, ordErr);
      }

      // Compute dynamic 30-day tier information
      const completedOrders = orders.filter((o: any) => {
        const st = String(o.status || '').toLowerCase();
        return st === 'delivered' || st === 'completed';
      });
      const tierInfo = calculateCustomerTier(completedOrders);

      return NextResponse.json({
        customer: {
          id: userSnap.id,
          ...userData,
          tier: tierInfo.tier,
          tierInfo,
          purchasingPoints: Number(userData.purchasingPoints || 0),
          referralPoints: Number(userData.referralPoints || 0),
          pendingReferralPoints: Number(userData.pendingReferralPoints || 0),
          storeCredits: Number(userData.storeCredits || 0),
          deviceId: currentDeviceId,
          hardwareId: currentHardwareId,
          appId: userData.appId || fingerprints[0]?.appId || "PRIME_SHOP_APP",
          latestFingerprint: userData.latestFingerprint || (fingerprints.length > 0 ? fingerprints[0] : null),
          sharedAccounts,
          isPromoFraudRisk: sharedAccounts.length > 0
        },
        fingerprints,
        orders
      });
    }

    // 2. All Customers Compact List
    const now = Date.now();
    if (cacheStore.customers && (now - cacheStore.lastCustomersFetchTime < CUSTOMERS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.customers);
    }

    const usersCol = collection(db, 'users');
    const userSnap = await getDocs(usersCol);

    // Also fetch recent orders count/totals for all customers
    let allOrders: any[] = [];
    try {
      const ordersCol = collection(db, 'orders');
      const qOrders = query(ordersCol, limit(200));
      const ordersSnap = await getDocs(qOrders);
      allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
    } catch {
      allOrders = [];
    }

    // Pre-build device sharing map for fraud detection
    const deviceToUsersMap = new Map<string, string[]>();
    const hardwareToUsersMap = new Map<string, string[]>();

    userSnap.docs.forEach(doc => {
      const data = doc.data();
      const devId = data.deviceId || data.latestFingerprint?.deviceId;
      const hwId = data.hardwareId || data.latestFingerprint?.hardwareId;
      if (devId) {
        const arr = deviceToUsersMap.get(devId) || [];
        arr.push(doc.id);
        deviceToUsersMap.set(devId, arr);
      }
      if (hwId) {
        const arr = hardwareToUsersMap.get(hwId) || [];
        arr.push(doc.id);
        hardwareToUsersMap.set(hwId, arr);
      }
    });
    
    const users = userSnap.docs.map((userDoc) => {
      const userData = cleanTimestamps(userDoc.data());
      
      const latestFingerprint = userData.latestFingerprint || null;

      // Check device sharing for promo fraud detection
      const userDevId = userData.deviceId || latestFingerprint?.deviceId;
      const userHwId = userData.hardwareId || latestFingerprint?.hardwareId;
      const devMatches = userDevId ? (deviceToUsersMap.get(userDevId) || []).filter(id => id !== userDoc.id) : [];
      const hwMatches = userHwId ? (hardwareToUsersMap.get(userHwId) || []).filter(id => id !== userDoc.id) : [];
      const totalSharedOthers = Array.from(new Set([...devMatches, ...hwMatches])).length;

      // Customer orders count & sum
      const customerOrders = allOrders.filter((ord: any) => 
        ord.customerId === userDoc.id || 
        ord.tgUserId === userDoc.id ||
        (userData.primeMemberId && ord.primeMemberId === userData.primeMemberId)
      );
      const totalSpent = customerOrders.reduce((sum: number, o: any) => sum + (Number(o.totalAmount) || 0), 0);
      const completedCustOrders = customerOrders.filter((o: any) => {
        const st = String(o.status || '').toLowerCase();
        return st === 'delivered' || st === 'completed';
      });
      const compactTier = calculateCustomerTier(completedCustOrders).tier;

      return { 
        id: userDoc.id, 
        ...userData,
        tier: compactTier,
        storeCredits: Number(userData.storeCredits || 0),
        purchasingPoints: Number(userData.purchasingPoints || 0),
        referralPoints: Number(userData.referralPoints || 0),
        deviceId: userDevId || "",
        hardwareId: userHwId || "",
        appId: userData.appId || latestFingerprint?.appId || "PRIME_SHOP_APP",
        latestFingerprint,
        snapshotCount: latestFingerprint ? 1 : 0,
        orderCount: customerOrders.length,
        totalSpent,
        isPromoFraudRisk: totalSharedOthers > 0,
        sharedAccountCount: totalSharedOthers
      };
    });

    cacheStore.customers = users;
    cacheStore.lastCustomersFetchTime = now;

    return NextResponse.json(users);
  } catch (error: any) {
    if (cacheStore.customers) {
      return NextResponse.json(cacheStore.customers);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
