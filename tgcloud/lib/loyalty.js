export function calculateCustomerTier(completedOrders, now = new Date()) {
  if (!Array.isArray(completedOrders) || completedOrders.length === 0) {
    return {
      tier: 'Silver', currentSpending: 0, cycleStartDate: now.toISOString(),
      cycleEndDate: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      daysRemainingInCycle: 30, nextTier: 'Bronze', amountNeededForNextTier: 5000,
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
  let amountNeeded = 5000 - spending;
  let progress = Math.min(100, Math.max(0, spending / 5000 * 100));
  if (spending >= 20000) {
    tier = 'Titanium'; nextTier = null; amountNeeded = 0; progress = 100;
  } else if (spending >= 15000) {
    tier = 'Platinum'; nextTier = 'Titanium'; amountNeeded = 20000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 15000) / 5000 * 100));
  } else if (spending >= 10000) {
    tier = 'Gold'; nextTier = 'Platinum'; amountNeeded = 15000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 10000) / 5000 * 100));
  } else if (spending >= 5000) {
    tier = 'Bronze'; nextTier = 'Gold'; amountNeeded = 10000 - spending;
    progress = Math.min(100, Math.max(0, (spending - 5000) / 5000 * 100));
  }
  return {
    tier, currentSpending: spending, cycleStartDate: cycleStart.toISOString(),
    cycleEndDate: cycleEnd.toISOString(), daysRemainingInCycle: daysRemaining,
    nextTier, amountNeededForNextTier: Math.max(0, amountNeeded),
    firstCompletedOrderDate: firstDate.toISOString(), progressPercent: Math.round(progress),
  };
}
