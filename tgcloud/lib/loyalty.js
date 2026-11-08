const orderDate = (value) => new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);

export function calculateCustomerTier(completedOrders, now = new Date()) {
  completedOrders = Array.isArray(completedOrders) ? completedOrders.filter((order) =>
    (!order.status || ['completed', 'delivered'].includes(String(order.status).toLowerCase())) &&
    Number.isFinite(orderDate(order.deliveredAt || order.createdAt).getTime())) : [];
  if (!Array.isArray(completedOrders) || completedOrders.length === 0) {
    return {
      tier: 'Member', currentSpending: 0, cycleStartDate: now.toISOString(),
      cycleEndDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemainingInCycle: 30, nextTier: 'Silver', amountNeededForNextTier: 10000,
      firstCompletedOrderDate: null, progressPercent: 0,
    };
  }
  const sorted = [...completedOrders].sort((a, b) =>
    orderDate(a.deliveredAt || a.createdAt || 0).getTime() -
    orderDate(b.deliveredAt || b.createdAt || 0).getTime()
  );
  const firstDate = orderDate(sorted[0].deliveredAt || sorted[0].createdAt || now);
  const cycleMs = 30 * 24 * 60 * 60 * 1000;
  const cycleIndex = Math.floor(Math.max(0, now.getTime() - firstDate.getTime()) / cycleMs);
  const cycleStart = new Date(firstDate.getTime() + cycleIndex * cycleMs);
  const cycleEnd = new Date(cycleStart.getTime() + cycleMs);
  const daysRemaining = Math.max(0, Math.ceil((cycleEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  let spending = 0;
  for (const order of completedOrders) {
    const at = orderDate(order.deliveredAt || order.createdAt || 0).getTime();
    if (at >= cycleStart.getTime() && at < cycleEnd.getTime()) {
      const amount = Number(order.subTotal ?? order.subtotal ?? 0);
      spending += Number.isFinite(amount) ? Math.max(0, amount) : 0;
    }
  }
  let tier = 'Member';
  let nextTier = 'Silver';
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
    tier = 'Silver'; nextTier = 'Gold'; amountNeeded = 15000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 10000) / 5000 * 100));
  }
  return {
    tier, currentSpending: spending, cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString(), daysRemainingInCycle: daysRemaining,
    nextTier, amountNeededForNextTier: Math.max(0, amountNeeded),
    firstCompletedOrderDate: firstDate.toISOString(), progressPercent: Math.round(progress),
  };
}

const TIER_POINTS_PER_200 = Object.freeze({ Member: 0, Silver: 11, Gold: 12, Platinum: 13, Titanium: 14 });

/** Apply the tier rate to eligible pesos, then floor to whole points once. */
export function calculateOrderRewardPoints(itemsSubtotal, tier, promoCashbackPoints = 0, itemDiscount = 0, creditsUsed = 0) {
  const subtotal = Number(itemsSubtotal);
  const discount = Number(itemDiscount);
  const credits = Number(creditsUsed);
  const promoPoints = Number(promoCashbackPoints);
  if (![subtotal, discount, credits, promoPoints].every(Number.isFinite)) return 0;
  const eligibleSpend = Math.max(0, subtotal - Math.max(0, discount) - Math.max(0, credits));
  const pointsPer200 = TIER_POINTS_PER_200[tier] ?? TIER_POINTS_PER_200.Member;
  const tierPoints = Math.floor(eligibleSpend * pointsPer200 / 200);
  // The richer of a voucher or tier reward is credited once through the purchasing ledger.
  return Math.max(tierPoints, Math.max(0, Math.floor(promoPoints)));
}
