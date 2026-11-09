import { db, EndpointError } from 'sdk';
import { desc, eq, or } from 'sdk/db';
import { customers, orders, pointTransactions } from '../schema.js';
import { calculateCustomerTier } from '../lib/loyalty.js';
import { reconcileOrderMilestones } from '../lib/order-lifecycle.js';
import { requireAdmin } from '../lib/auth.js';

function iso(value) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(typeof value === 'number' && value < 1e12 ? value * 1000 : value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function num(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export default async function (input = {}, ctx) {
  const actorId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(actorId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const targetId = typeof input?.customerId === 'string' ? input.customerId.trim() : '';
  if (targetId) await requireAdmin(ctx);
  let customer = await db.select().from(customers).where(targetId ? eq(customers.id, targetId) : eq(customers.tgUserId, actorId)).get();
  if (!customer) throw new EndpointError('Your PRIME account could not be found.', { code: 'ACCOUNT_NOT_FOUND' });
  if (!targetId) {
    await reconcileOrderMilestones({ customerId: customer.id, memberId: customer.primeMemberId, limit: 20 });
    customer = await db.select().from(customers).where(eq(customers.tgUserId, actorId)).get();
  }
  const telegramId = customer.tgUserId ? String(customer.tgUserId) : '__no_telegram_account__';
  const ownership = [eq(orders.tgUserId, telegramId), eq(orders.customerId, customer.id)];
  if (customer.primeMemberId) ownership.push(eq(orders.primeMemberId, customer.primeMemberId));
  const [rows, tierOrders, lifetimeActivity] = await Promise.all([
    db.select().from(orders).where(or(...ownership)).orderBy(desc(orders.createdAt)).limit(100).all(),
    db.select().from(orders).where(eq(orders.customerId, customer.id)).orderBy(desc(orders.createdAt)).limit(1000).all(),
    db.get(`SELECT count(*) AS orderCount,
      sum(CASE WHEN lower(status) IN ('completed', 'delivered') THEN 1 ELSE 0 END) AS successfulOrders,
      min(CASE WHEN lower(status) IN ('completed', 'delivered') THEN created_at ELSE NULL END) AS firstCompletedAt,
      max(created_at) AS latestOrderAt,
      sum(CASE WHEN lower(status) IN ('completed', 'delivered') THEN coalesce(subtotal, 0) ELSE 0 END) AS itemSpending,
      sum(CASE WHEN lower(status) IN ('completed', 'delivered') THEN coalesce(total_amount, 0) ELSE 0 END) AS totalSpending,
      sum(CASE WHEN lower(status) IN ('completed', 'delivered') THEN
        coalesce(discount_amount, 0) + coalesce(points_discount, 0) +
        coalesce(staff_discount_amount, 0) + coalesce(promo_shipping_subsidy, 0)
        ELSE 0 END) AS totalDiscounts
      FROM orders WHERE customer_id = :customer_id OR tg_user_id = :telegram_id
        OR (:member_id <> '' AND prime_member_id = :member_id)`,
      { ':customer_id': String(customer.id), ':telegram_id': telegramId,
        ':member_id': String(customer.primeMemberId || '') }),
  ]);
  const completed = tierOrders.filter(order => ['completed', 'delivered'].includes(String(order.status || '').toLowerCase()));
  const referrals = customer.primeMemberId
    ? await db.select().from(customers).where(eq(customers.referredByMemberId, customer.primeMemberId)).orderBy(desc(customers.createdAt)).limit(200).all()
    : [];
  const referralOrders = customer.primeMemberId
    ? await db.select().from(orders).where(eq(orders.referredByMemberId, customer.primeMemberId)).orderBy(desc(orders.createdAt)).limit(1000).all()
    : [];
  const transactions = await db.select().from(pointTransactions).where(eq(pointTransactions.userId, customer.id)).orderBy(desc(pointTransactions.createdAt)).limit(100).all();
  const lastFingerprint = (Array.isArray(customer.fingerprints) ? customer.fingerprints : [])
    .map(item => iso(item?.lastSeen || item?.last_seen || item?.createdAt || item?.created_at))
    .filter(Boolean).sort().at(-1) || null;
  const referralList = referrals.map(ref => {
    const delivered = referralOrders.some(order => (String(order.customerId || '') === String(ref.id) || String(order.tgUserId || '') === String(ref.tgUserId || '')) && ['completed', 'delivered'].includes(String(order.status || '').toLowerCase()));
    const ownDelivered = num(lifetimeActivity?.successfulOrders) > 0;
    return { id: ref.id, name: ref.tgName || 'PRIME Member', username: ref.tgUsername || '', memberId: ref.primeMemberId || '', enrolledAt: iso(ref.createdAt), hasDeliveredOrder: delivered, rewardStatus: !delivered ? 'Pending delivery' : !ownDelivered ? 'On hold: your completed order required' : 'Delivered' };
  });
  const recentOrders = rows.slice(0, 5).map(order => ({
    id: order.id, orderNumber: order.orderNumber, createdAt: iso(order.createdAt), status: order.status,
    items: Array.isArray(order.items) ? order.items : [], subTotal: num(order.subtotal), totalAmount: num(order.totalAmount),
    promoDiscount: num(order.discountAmount), paymentStatus: order.paymentStatus,
  }));
  const allOrders = rows.map(order => ({ id: order.id, createdAt: iso(order.createdAt), status: order.status, subTotal: num(order.subtotal), deliveredAt: iso(order.deliveredAt) }));
  const referralsPending = referralOrders.reduce((sum, order) =>
    sum + (String(order.referredByUserId || '') === String(customer.id) && String(order.referralPointsStatus || '').startsWith('pending') ? num(order.referralPointsAmount) : 0), 0);
  const customerData = {
    id: customer.id, tgUserId: customer.tgUserId || '', tgName: customer.tgName || '', tgUsername: customer.tgUsername || '',
    primeMemberId: customer.primeMemberId || '', phone: customer.phoneNumber || '', photoUrl: customer.photoUrl || '', telegramPhotoUrl: customer.telegramPhotoUrl || '', hasCustomPhoto: customer.hasCustomPhoto === true || customer.hasCustomPhoto === 1,
    enrollmentDate: iso(customer.createdAt), firstOrderDate: iso(lifetimeActivity?.firstCompletedAt),
    latestOrderDate: iso(lifetimeActivity?.latestOrderAt), latestVisitDate: lastFingerprint,
    lifetimeOrderCount: num(lifetimeActivity?.orderCount), lifetimeSuccessfulOrders: num(lifetimeActivity?.successfulOrders),
    lifetimeItemSpending: num(lifetimeActivity?.itemSpending),
    lifetimeTotalSpending: num(lifetimeActivity?.totalSpending),
    // Store Credits pay part of an order; they are not a discount.
    lifetimeDiscounts: num(lifetimeActivity?.totalDiscounts),
    tierInfo: calculateCustomerTier(completed), referredBy: customer.referredByMemberId || customer.referredBy || '',
    referredByUsername: '', referredByMemberId: customer.referredByMemberId || '', referralCount: referrals.filter(ref => String(ref.id) !== String(customer.id)).length,
    referrals: referralList, purchasingPoints: num(customer.points), referralPoints: num(customer.referralPoints),
    pendingReferralPoints: referralsPending, storeCredits: num(customer.storeCredits),
    receivedTransferBalance: num(customer.receivedTransferBalance),
    transferableCredits: Math.max(0, num(customer.storeCredits) - num(customer.receivedTransferBalance)),
  };
  return {
    customer: customerData,
    recentOrders,
    allOrders,
    pointTransactions: transactions.map(tx => ({ id: tx.id, type: tx.type, amount: num(tx.amount), description: tx.description || '', createdAt: iso(tx.createdAt), orderId: tx.orderId || '' })),
  };
}
