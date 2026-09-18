import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  runTransaction,
  writeBatch
} from 'firebase/firestore';

export interface CustomerTierInfo {
  tier: 'Titanium' | 'Platinum' | 'Gold' | 'Bronze' | 'Silver' | 'Member';
  currentSpending: number; // In current 30-day cycle, items only
  cycleStartDate: string;
  cycleEndDate: string;
  daysRemainingInCycle: number;
  nextTier: string | null;
  amountNeededForNextTier: number;
  firstCompletedOrderDate: string | null;
  progressPercent: number;
}

export interface PointTransactionRecord {
  id?: string;
  userId: string;
  type: 
    | 'purchasing' 
    | 'referral' 
    | 'conversion_purchasing' 
    | 'conversion_referral' 
    | 'store_credit_usage' 
    | 'transfer_out' 
    | 'transfer_in';
  amount: number;
  orderId?: string;
  orderNumber?: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

/**
 * Calculates purchasing points: 10 points for each ₱100 spending on purchased items
 */
export function calculatePurchasingPoints(itemsSubtotal: number): number {
  const safeItems = Math.max(0, Number(itemsSubtotal) || 0);
  return Math.floor(safeItems / 100) * 10;
}

/**
 * Calculates member tier according to the rolling 30-day window based on
 * the customer's very first Delivered/Completed order.
 */
export function calculateCustomerTier(
  completedOrders: Array<{ subTotal?: number; totalAmount?: number; createdAt?: string; deliveredAt?: string }>,
  now: Date = new Date()
): CustomerTierInfo {
  if (!completedOrders || completedOrders.length === 0) {
    return {
      tier: 'Member',
      currentSpending: 0,
      cycleStartDate: now.toISOString(),
      cycleEndDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemainingInCycle: 30,
      nextTier: 'Silver',
      amountNeededForNextTier: 5000,
      firstCompletedOrderDate: null,
      progressPercent: 0
    };
  }

  // Find the date of the very first completed order
  const sorted = [...completedOrders].sort((a, b) => {
    const tA = new Date(a.deliveredAt || a.createdAt || 0).getTime();
    const tB = new Date(b.deliveredAt || b.createdAt || 0).getTime();
    return tA - tB;
  });

  const firstDate = new Date(sorted[0].deliveredAt || sorted[0].createdAt || now);
  const firstTimestamp = firstDate.getTime();
  const currentTimestamp = now.getTime();

  const diffMs = Math.max(0, currentTimestamp - firstTimestamp);
  const cycleMs = 30 * 24 * 60 * 60 * 1000;
  const cycleIndex = Math.floor(diffMs / cycleMs);

  const cycleStart = new Date(firstTimestamp + cycleIndex * cycleMs);
  const cycleEnd = new Date(cycleStart.getTime() + cycleMs);
  const daysRemaining = Math.max(0, Math.ceil((cycleEnd.getTime() - currentTimestamp) / (24 * 60 * 60 * 1000)));

  // Calculate items purchased amount (subTotal) strictly in current cycle
  let cycleItemsSpend = 0;
  for (const ord of completedOrders) {
    const ordDate = new Date(ord.deliveredAt || ord.createdAt || 0).getTime();
    if (ordDate >= cycleStart.getTime() && ordDate <= cycleEnd.getTime()) {
      cycleItemsSpend += Math.max(0, Number(ord.subTotal || 0));
    }
  }

  // Tiers threshold
  // Titanium: >= ₱25,000
  // Platinum: >= ₱20,000
  // Gold:     >= ₱15,000
  // Bronze:   >= ₱10,000
  // Silver:   >= ₱5,000
  let tier: CustomerTierInfo['tier'] = 'Member';
  let nextTier: string | null = 'Silver';
  let amountNeeded = 5000 - cycleItemsSpend;
  let progress = Math.min(100, Math.max(0, (cycleItemsSpend / 5000) * 100));

  if (cycleItemsSpend >= 25000) {
    tier = 'Titanium';
    nextTier = null;
    amountNeeded = 0;
    progress = 100;
  } else if (cycleItemsSpend >= 20000) {
    tier = 'Platinum';
    nextTier = 'Titanium';
    amountNeeded = 25000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 20000) / 5000) * 100));
  } else if (cycleItemsSpend >= 15000) {
    tier = 'Gold';
    nextTier = 'Platinum';
    amountNeeded = 20000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 15000) / 5000) * 100));
  } else if (cycleItemsSpend >= 10000) {
    tier = 'Bronze';
    nextTier = 'Gold';
    amountNeeded = 15000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 10000) / 5000) * 100));
  } else if (cycleItemsSpend >= 5000) {
    tier = 'Silver';
    nextTier = 'Bronze';
    amountNeeded = 10000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 5000) / 5000) * 100));
  }

  return {
    tier,
    currentSpending: cycleItemsSpend,
    cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString(),
    daysRemainingInCycle: daysRemaining,
    nextTier,
    amountNeededForNextTier: Math.max(0, amountNeeded),
    firstCompletedOrderDate: firstDate.toISOString(),
    progressPercent: Math.round(progress)
  };
}

/**
 * Checks and credits any matured referral points (30 minutes after order Delivered/Completed).
 * Safe to call idempotently.
 */
export async function processMaturedReferrals(): Promise<number> {
  try {
    const ordersCol = collection(db, 'orders');
    const q = query(ordersCol, where('referralPointsStatus', '==', 'pending_30m'));
    const snap = await getDocs(q);

    if (snap.empty) return 0;

    const nowIso = new Date().toISOString();
    let processedCount = 0;

    for (const ordDoc of snap.docs) {
      const ordData = ordDoc.data();
      const creditAfter = ordData.referralPointsCreditAfter;

      if (creditAfter && creditAfter <= nowIso) {
        const refereeId = ordData.referredByUserId;
        const refereeMemberId = ordData.referredByMemberId;

        // Locate referee user doc
        let refereeUserDocId: string | null = refereeId || null;
        if (!refereeUserDocId && refereeMemberId) {
          const userQ = query(collection(db, 'users'), where('primeMemberId', '==', refereeMemberId));
          const uSnap = await getDocs(userQ);
          if (!uSnap.empty) {
            refereeUserDocId = uSnap.docs[0].id;
          }
        }

        if (refereeUserDocId) {
          const targetRef = refereeUserDocId;
          await runTransaction(db, async (txn) => {
            const uRef = doc(db, 'users', targetRef);
            const uSnap = await txn.get(uRef);
            if (uSnap.exists()) {
              const uData = uSnap.data();
              const currentRefPts = Number(uData.referralPoints || 0);
              const lifetimeRefPts = Number(uData.lifetimeReferralPoints || 0);
              const newRefPts = currentRefPts + 50;

              txn.update(uRef, {
                referralPoints: newRefPts,
                lifetimeReferralPoints: lifetimeRefPts + 50,
                updatedAt: new Date().toISOString()
              });

              const txId = `tx-ref-${ordDoc.id}-${Date.now()}`;
              const txRef = doc(db, 'point_transactions', txId);
              txn.set(txRef, {
                userId: targetRef,
                type: 'referral',
                amount: 50,
                orderId: ordDoc.id,
                orderNumber: ordData.orderNumber || ordDoc.id,
                description: `50 Referral Points for Order #${ordData.orderNumber || ordDoc.id} by ${ordData.customerName || 'Referred Friend'}`,
                referredCustomerId: ordData.customerId || ordData.tgUserId || '',
                referredCustomerName: ordData.customerName || 'Friend',
                createdAt: new Date().toISOString()
              });

              txn.update(ordDoc.ref, {
                referralPointsStatus: 'credited',
                referralPointsCreditedAt: new Date().toISOString(),
                referralPointsAmount: 50
              });
            }
          });
          processedCount++;
        }
      }
    }

    return processedCount;
  } catch (err) {
    console.error('Error processing matured referrals:', err);
    return 0;
  }
}
