export function calculateCustomerTier(completedOrders, now = new Date()) {
  if (!Array.isArray(completedOrders) || completedOrders.length === 0) {
    return {
      tier: 'Silver', currentSpending: 0, cycleStartDate: now.toISOString(),
      cycleEndDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemainingInCycle: 30, nextTier: 'Bronze', amountNeededForNextTier: 10000,
      firstCompletedOrderDate: null, progressPercent: 0,
    };
  }
  const sorted = [...completedOrders].sort((a, b) =>
    new Date(a.deliveredAt || a.createdAt || 0).getTime() -
    new Date(b.deliveredAt || b.createdAt || 0).getTime()
  );
  const firstDate = new Date(sorted[0].deliveredAt || sorted[0].createdAt || now);
  const cycleMs = 30 * 24 * 60 * 60 * 1000;
  const cycleIndex = Math.floor(Math.max(0, now.getTime() - firstDate.getTime()) / cycleMs);
  const cycleStart = new Date(firstDate.getTime() + cycleIndex * cycleMs);
  const cycleEnd = new Date(cycleStart.getTime() + cycleMs);
  const daysRemaining = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  let spending = 0;
  for (const order of completedOrders) {
    const at = new Date(order.deliveredAt || order.createdAt || 0).getTime();
    if (at >= cycleStart.getTime() && at < cycleEnd.getTime()) {
      spending += Math.max(0, Number(order.subTotal ?? order.subtotal ?? 0));
    }
  }
  let tier = 'Silver';
  let nextTier = 'Bronze';
  let amountNeeded = 10000 - spending;
  let progress = Math.min(100, Math.max(0, spending / 10000 * 100));
  if (spending >= 25000) {
    tier = 'Titanium'; nextTier = null; amountNeeded = 0; progress = 100;
  } else if (spending >= 20000) {
    tier = 'Platinum'; nextTier = 'Titanium'; amountNeeded = 25000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 20000) / 5000 * 100));
  } else if (spending >= 15000) {
    tier = 'Gold'; nextTier = 'Platinum'; amountNeeded = 20000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 15000) / 5000 * 100));
  } else if (spending >= 10000) {
    tier = 'Bronze'; nextTier = 'Gold'; amountNeeded = 15000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 10000) / 5000 * 100));
  }
  return {
    tier, currentSpending: spending, cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString(), daysRemainingInCycle: daysRemaining,
    nextTier, amountNeededForNextTier: Math.max(0, amountNeeded),
    firstCompletedOrderDate: firstDate.toISOString(), progressPercent: Math.round(progress),
  };
}

const TIER_POINTS_PER_200 = Object.freeze({ Silver: 10, Bronze: 11, Gold: 12, Platinum: 13, Titanium: 14 });

/** Whole points only. Two complete ₱100 blocks earn the exact half-percent tiers. */
export function calculateOrderRewardPoints(itemsSubtotal, tier, promoCashbackPoints = 0, itemDiscount = 0, creditsUsed = 0) {
  const subtotal = Number(itemsSubtotal);
  const discount = Number(itemDiscount);
  const credits = Number(creditsUsed);
  const promoPoints = Number(promoCashbackPoints);
  if (![subtotal, discount, credits, promoPoints].every(Number.isFinite)) return 0;
  const eligibleSpend = Math.max(0, subtotal - Math.max(0, discount) - Math.max(0, credits));
  const blocks = Math.floor(eligibleSpend / 100);
  const pointsPer200 = TIER_POINTS_PER_200[tier] || TIER_POINTS_PER_200.Silver;
  const tierPoints = Math.floor(blocks * pointsPer200 / 2);
  // The richer of a voucher or tier reward is credited once through the purchasing ledger.
  return Math.max(tierPoints, Math.max(0, Math.floor(promoPoints)));
}
