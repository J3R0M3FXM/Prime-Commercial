import { db, EndpointError } from 'sdk';
import { customers, orders } from '../schema.js';
import { eq } from 'sdk/db';
import { markOrderCompleted, reconcileOrderMilestones } from '../lib/order-lifecycle.js';

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) throw new EndpointError('A verified Telegram customer is required.', { code: 'AUTH_REQUIRED' });
  const orderId = String(input?.orderId || '').trim();
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
  const customer = await db.select({ id: customers.id, primeMemberId: customers.primeMemberId })
    .from(customers).where(eq(customers.tgUserId, telegramId)).get();
  const order = await db.select().from(orders).where(eq(orders.id, orderId)).get();
  if (!customer || !order || String(order.customerId || '') !== String(customer.id)) {
    throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  }

  await reconcileOrderMilestones({ customerId: customer.id, memberId: customer.primeMemberId, limit: 10 });
  const result = await markOrderCompleted(orderId);
  if (!result.completed) throw new EndpointError('Only a dispatched order can be marked received.', { code: 'ORDER_NOT_DISPATCHED' });
  return { success: true, orderId, status: 'Completed', alreadyCompleted: result.alreadyCompleted };
}
