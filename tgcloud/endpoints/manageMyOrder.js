import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, orders } from '../schema.js';
import { applyWorkflowAction,ensureOrderWorkflow } from '../lib/order-workflow.js';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

export default async function (input = {}, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]{1,24}$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const orderId = clean(input?.orderId, 100);
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
  await ensureOrderWorkflow();
  const [customer, order] = await Promise.all([
    db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get(),
    db.select().from(orders).where(eq(orders.id, orderId)).get(),
  ]);
  if (!order || (String(order.tgUserId || '') !== telegramId && String(order.customerId || '') !== String(customer?.id || ''))) {
    throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  }
  const action = clean(input?.action, 40);
  if (action === 'cancel') return applyWorkflowAction(order, 'requestCancel');
  if (action !== 'edit') throw new EndpointError('Unsupported order action.', { code: 'INVALID_ACTION' });
  if (!['pending','confirmed'].includes(String(order.status || '').toLowerCase())) {
    throw new EndpointError('This order can no longer be edited after payment approval.', { code: 'ORDER_NOT_EDITABLE' });
  }
  const version = Number(order.staffEditVersion || 0);
  if (!Number.isSafeInteger(Number(input?.expectedVersion)) || Number(input.expectedVersion) !== version) {
    throw new EndpointError('The order changed. Refresh it before editing.', { code: 'ORDER_CHANGED' });
  }
  const oldAddress = order.deliveryAddress && typeof order.deliveryAddress === 'object' && !Array.isArray(order.deliveryAddress) ? order.deliveryAddress : {};
  const receiverName = clean(input?.receiverName, 100);
  const receiverPhone = clean(input?.receiverPhone, 32);
  const unitDetails = clean(input?.unitDetails, 160);
  const deliveryNotes = clean(input?.deliveryNotes, 500);
  if (receiverName.length < 2 || !/^[+0-9()\s-]{7,32}$/.test(receiverPhone)) {
    throw new EndpointError('Enter a valid receiver name and phone number.', { code: 'INVALID_RECEIVER' });
  }
  const address = { ...oldAddress, receiverName, receiverPhone, unitDetails, deliveryNotes };
  return applyWorkflowAction(order,'requestEdit',{expectedVersion:version,edit:{deliveryAddress:address,receiverName,receiverPhone,expectedVersion:version}});
}
