import { db, EndpointError } from 'sdk';
import { asc, desc, eq, or } from 'sdk/db';
import { customers, orders } from '../schema.js';

export default async function (_input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) {
    throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  }

  const customer = await db.select({
    id: customers.id,
    primeMemberId: customers.primeMemberId,
  }).from(customers).where(eq(customers.tgUserId, telegramId)).get();

  const ownership = [eq(orders.tgUserId, telegramId)];
  if (customer?.id) ownership.push(eq(orders.customerId, customer.id));
  if (customer?.primeMemberId) ownership.push(eq(orders.primeMemberId, customer.primeMemberId));

  const rows = await db.select().from(orders)
    .where(ownership.length === 1 ? ownership[0] : or(...ownership))
    .orderBy(desc(orders.createdAt))
    .limit(100)
    .all();

  return rows.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: Number(order.totalAmount || 0),
    subTotal: Number(order.subtotal || 0),
    promoDiscount: Number(order.discountAmount || order.promoDiscount || 0),
    storeCreditsUsed: Number(order.storeCreditsUsed || 0),
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
    referredByUserId: order.referredByUserId,
    referredByMemberId: order.referredByMemberId,
    referralPointsStatus: order.referralPointsStatus,
    customerName: order.customerName,
  }));
}
