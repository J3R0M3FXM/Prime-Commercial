import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export interface CustomerTierInfo {
  tier: 'Titanium' | 'Platinum' | 'Gold' | 'Bronze' | 'Silver';
  currentSpending: number;
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

export function calculatePurchasingPoints(itemsSubtotal: number): number {
  const safeItems = Math.max(0, Number(itemsSubtotal) || 0);
  return Math.floor(safeItems / 100) * 5;
}

export function calculateCustomerTier(
  completedOrders: Array<{ subTotal?: number; subtotal?: number; totalAmount?: number; createdAt?: string; deliveredAt?: string }>,
  now: Date = new Date()
): CustomerTierInfo {
  if (!completedOrders || completedOrders.length === 0) {
    return {
      tier: 'Silver',
      currentSpending: 0,
      cycleStartDate: now.toISOString(),
      cycleEndDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemainingInCycle: 30,
      nextTier: 'Bronze',
      amountNeededForNextTier: 5000,
      firstCompletedOrderDate: null,
      progressPercent: 0
    };
  }

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

  let cycleItemsSpend = 0;
  for (const ord of completedOrders) {
    const ordDate = new Date(ord.deliveredAt || ord.createdAt || 0).getTime();
    if (ordDate >= cycleStart.getTime() && ordDate < cycleEnd.getTime()) {
      cycleItemsSpend += Math.max(0, Number(ord.subTotal ?? ord.subtotal ?? 0));
    }
  }

  let tier: CustomerTierInfo['tier'] = 'Silver';
  let nextTier: string | null = 'Bronze';
  let amountNeeded = 5000 - cycleItemsSpend;
  let progress = Math.min(100, Math.max(0, (cycleItemsSpend / 5000) * 100));

  if (cycleItemsSpend >= 20000) {
    tier = 'Titanium';
    nextTier = null;
    amountNeeded = 0;
    progress = 100;
  } else if (cycleItemsSpend >= 15000) {
    tier = 'Platinum';
    nextTier = 'Titanium';
    amountNeeded = 20000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 15000) / 5000) * 100));
  } else if (cycleItemsSpend >= 10000) {
    tier = 'Gold';
    nextTier = 'Platinum';
    amountNeeded = 15000 - cycleItemsSpend;
    progress = Math.min(100, Math.max(0, ((cycleItemsSpend - 10000) / 5000) * 100));
  } else if (cycleItemsSpend >= 5000) {
    tier = 'Bronze';
    nextTier = 'Gold';
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

export async function processMaturedReferrals(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = getSupabaseAdmin()!;
  try {
    const { data, error } = await supabase.rpc('process_matured_referrals');
    if (error) {
      console.error('Error processing matured referrals:', error);
      return 0;
    }
    return Number(data?.processed || 0);
  } catch (err) {
    console.error('Error processing matured referrals:', err);
    return 0;
  }
}
