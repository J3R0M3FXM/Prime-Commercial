import { db, EndpointError } from 'sdk';
import { desc, eq } from 'sdk/db';
import { customers, orders } from '../schema.js';
import { calculateCustomerTier } from '../lib/loyalty.js';

/** Read-only, self-scoped tier lookup for the checkout identity card. */
export default async function (_input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) {
    throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  }

  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) throw new EndpointError('Your PRIME account could not be found.', { code: 'ACCOUNT_NOT_FOUND' });

  const rows = await db.select().from(orders)
    .where(eq(orders.customerId, customer.id))
    .orderBy(desc(orders.createdAt))
    .limit(1000)
    .all();
  const completedOrders = rows
    .filter((order) => ['completed', 'delivered'].includes(String(order.status || '').toLowerCase()))
    .map((order) => ({ subTotal: Number(order.subtotal) || 0, createdAt: order.createdAt, deliveredAt: order.deliveredAt }));

  return { tier: calculateCustomerTier(completedOrders).tier };
}
