import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  updateDoc 
} from 'firebase/firestore';
import { calculateCustomerTier, processMaturedReferrals } from '@/lib/points-system';

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || searchParams.get('id') || '';
    const primeMemberId = searchParams.get('primeMemberId') || '';

    if (!customerId && !primeMemberId) {
      return NextResponse.json({ error: 'Customer identifier is required.' }, { status: 400 });
    }

    // Run background check for matured referrals (30 min after delivery)
    await processMaturedReferrals().catch(() => {});

    // 1. Find User Document
    let userDoc: any = null;
    let targetDocId = customerId;

    if (customerId) {
      const uRef = doc(db, 'users', customerId);
      const uSnap = await getDoc(uRef);
      if (uSnap.exists()) {
        userDoc = uSnap;
      }
    }

    if (!userDoc && (primeMemberId || customerId)) {
      const idToSearch = primeMemberId || customerId;
      const q = query(collection(db, 'users'), where('primeMemberId', '==', idToSearch), limit(1));
      const snap = await getDocs(q);
      if (!snap.empty) {
        userDoc = snap.docs[0];
        targetDocId = userDoc.id;
      } else if (customerId) {
        const qTg = query(collection(db, 'users'), where('tgUserId', '==', customerId), limit(1));
        const tgSnap = await getDocs(qTg);
        if (!tgSnap.empty) {
          userDoc = tgSnap.docs[0];
          targetDocId = userDoc.id;
        }
      }
    }

    if (!userDoc) {
      return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 });
    }

    const userData = cleanTimestamps(userDoc.data());
    const finalMemberId = userData.primeMemberId || primeMemberId || '';
    const userId = userDoc.id;

    // 2. Fetch all orders for this customer
    const ordersCol = collection(db, 'orders');
    const allOrdersSnap = await getDocs(ordersCol);
    const userOrders: any[] = [];

    allOrdersSnap.docs.forEach((ordDoc) => {
      const o = cleanTimestamps(ordDoc.data());
      const oId = ordDoc.id;
      const matches = 
        o.customerId === userId || 
        o.tgUserId === userId || 
        (finalMemberId && o.primeMemberId === finalMemberId) ||
        (customerId && (o.customerId === customerId || o.tgUserId === customerId));
      if (matches) {
        userOrders.push({ id: oId, ...o });
      }
    });

    userOrders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    // Completed/Delivered orders for tier calculation & points
    const completedOrders = userOrders.filter((o) => {
      const st = String(o.status || '').toLowerCase();
      return st === 'delivered' || st === 'completed';
    });

    // Tier calculation on rolling 30-day window
    const tierInfo = calculateCustomerTier(completedOrders);

    // Lifetime Stats
    const lifetimeOrderCount = userOrders.length;
    const lifetimeSuccessfulOrders = completedOrders.length;
    const lifetimeItemSpending = completedOrders.reduce((sum, o) => sum + (Number(o.subTotal) || 0), 0);
    const lifetimeTotalSpending = completedOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    
    // Calculate lifetime discounts (promo discounts + applied store credits)
    const lifetimeDiscounts = userOrders.reduce((sum, o) => {
      const pDisc = Number(o.promoDiscount || 0);
      const cDisc = Number(o.storeCreditsUsed || 0);
      return sum + pDisc + cDisc;
    }, 0);

    const firstOrderDate = userOrders.length > 0 ? userOrders[userOrders.length - 1].createdAt : null;
    const latestOrderDate = userOrders.length > 0 ? userOrders[0].createdAt : null;
    const latestVisitDate = userData.lastSeen || userData.updatedAt || new Date().toISOString();

    // 3. Referrals: Find who referred this customer
    let refereeInfo: { name: string; username?: string; memberId?: string } | null = null;
    if (userData.referredByMemberId || userData.referredByUserId) {
      if (userData.referredByName) {
        refereeInfo = {
          name: userData.referredByName,
          username: userData.referredByUsername || '',
          memberId: userData.referredByMemberId || ''
        };
      } else if (userData.referredByMemberId) {
        const refQ = query(collection(db, 'users'), where('primeMemberId', '==', userData.referredByMemberId), limit(1));
        const refSnap = await getDocs(refQ);
        if (!refSnap.empty) {
          const rData = refSnap.docs[0].data();
          refereeInfo = {
            name: rData.tgName || 'Member',
            username: rData.tgUsername || '',
            memberId: rData.primeMemberId || userData.referredByMemberId
          };
        }
      }
    }

    // 4. Referrals: Find all customers referred by this customer
    const referralsList: any[] = [];
    if (finalMemberId) {
      const refUsersQ = query(collection(db, 'users'), where('referredByMemberId', '==', finalMemberId));
      const refUsersSnap = await getDocs(refUsersQ);
      
      refUsersSnap.docs.forEach((d) => {
        if (d.id !== userId) {
          const rData = cleanTimestamps(d.data());
          // Check if this referred customer has placed a completed order
          const hasCompleted = allOrdersSnap.docs.some((od) => {
            const odData = od.data();
            const st = String(odData.status || '').toLowerCase();
            const isComp = st === 'delivered' || st === 'completed';
            const isCustomer = odData.customerId === d.id || odData.tgUserId === d.id || odData.primeMemberId === rData.primeMemberId;
            return isComp && isCustomer;
          });

          referralsList.push({
            id: d.id,
            name: rData.tgName || 'Member',
            username: rData.tgUsername || '',
            primeMemberId: rData.primeMemberId || '',
            enrolledAt: rData.createdAt || '',
            hasDeliveredOrder: hasCompleted,
            rewardStatus: hasCompleted ? 'Earned 50 Pts' : 'Pending Order'
          });
        }
      });
    }

    // 5. Point Transactions & History
    let pointTransactions: any[] = [];
    try {
      const txQ = query(collection(db, 'point_transactions'), where('userId', '==', userId));
      const txSnap = await getDocs(txQ);
      pointTransactions = txSnap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
      pointTransactions.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } catch {
      pointTransactions = [];
    }

    // 6. Calculate Pending Referral Points
    // (Orders by referrals that are completed but still within 30 min window, or pending delivery)
    let pendingReferralPoints = 0;
    if (finalMemberId) {
      allOrdersSnap.docs.forEach((od) => {
        const odData = od.data();
        if (odData.referredByMemberId === finalMemberId && odData.referralPointsStatus === 'pending_30m') {
          pendingReferralPoints += 50;
        }
      });
    }

    // Current Points Balances
    const purchasingPoints = Number(userData.purchasingPoints || 0);
    const referralPoints = Number(userData.referralPoints || 0);
    const storeCredits = Number(userData.storeCredits || 0);

    return NextResponse.json({
      customer: {
        id: userId,
        tgUserId: userData.tgUserId || userId,
        tgName: userData.tgName || 'Valued Member',
        tgUsername: userData.tgUsername || '',
        primeMemberId: finalMemberId,
        phone: userData.phone || userData.phoneNumber || 'Not linked',
        photoUrl: userData.photoUrl || '',
        hasCustomPhoto: Boolean(userData.hasCustomPhoto),
        enrollmentDate: userData.createdAt || new Date().toISOString(),
        firstOrderDate,
        latestOrderDate,
        latestVisitDate,
        lifetimeOrderCount,
        lifetimeSuccessfulOrders,
        lifetimeItemSpending,
        lifetimeTotalSpending,
        lifetimeDiscounts,
        tierInfo,
        referredBy: refereeInfo ? refereeInfo.name : 'N/A',
        referredByUsername: refereeInfo?.username || '',
        referredByMemberId: refereeInfo?.memberId || '',
        referralCount: referralsList.length,
        referrals: referralsList,
        purchasingPoints,
        referralPoints,
        pendingReferralPoints,
        storeCredits
      },
      recentOrders: userOrders.slice(0, 5),
      allOrders: userOrders,
      pointTransactions
    });
  } catch (err: any) {
    console.error('Error fetching account profile:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, photoUrl } = body;

    if (!customerId) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }
    if (!photoUrl) {
      return NextResponse.json({ error: 'Photo URL or Base64 data is required' }, { status: 400 });
    }

    const uRef = doc(db, 'users', customerId);
    const snap = await getDoc(uRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 });
    }

    // Once customer updates their photo in-app, hasCustomPhoto is set to true
    // so future Telegram auth validations will NOT overwrite it
    await updateDoc(uRef, {
      photoUrl,
      hasCustomPhoto: true,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true, photoUrl });
  } catch (err: any) {
    console.error('Error updating profile photo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
