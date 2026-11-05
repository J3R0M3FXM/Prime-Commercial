import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, orders } from '../schema.js';
import { requestOrderCancellation } from '../lib/order-cancellation.js';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

export default async function (input = {}, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]{1,24}$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const orderId = clean(input?.orderId, 100);
  if (!orderId) throw new EndpointError('Order ID is required.', { code: 'INVALID_INPUT' });
  const [customer, order] = await Promise.all([
    db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get(),
    db.select().from(orders).where(eq(orders.id, orderId)).get(),
  ]);
  if (!order || (String(order.tgUserId || '') !== telegramId && String(order.customerId || '') !== String(customer?.id || ''))) {
    throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  }
  const action = clean(input?.action, 40);
  if (action === 'cancel') return requestOrderCancellation(order, 'cancel');
  if (action !== 'edit') throw new EndpointError('Unsupported order action.', { code: 'INVALID_ACTION' });
  if (String(order.status || '').toLowerCase() !== 'pending' || String(order.paymentStatus || '').toLowerCase() === 'paid') {
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
  const saved = await db.run(
    `UPDATE orders SET delivery_address = :address, customer_name = :receiver_name,
      customer_phone = :receiver_phone, staff_edit_version = :next_version, updated_at = unixepoch()
     WHERE id = :order_id AND (tg_user_id = :telegram_id OR customer_id = :customer_id)
       AND lower(status) = 'pending' AND lower(coalesce(payment_status, '')) <> 'paid'
       AND coalesce(staff_edit_version, 0) = :expected_version RETURNING id`,
    { ':address': JSON.stringify(address), ':receiver_name': receiverName, ':receiver_phone': receiverPhone,
      ':next_version': version + 1, ':order_id': orderId, ':telegram_id': telegramId,
      ':customer_id': String(customer?.id || ''), ':expected_version': version },
  );
  if (!Number(saved?.rowsAffected)) throw new EndpointError('The order changed. Refresh it before editing.', { code: 'ORDER_CHANGED' });
  return { success: true, orderId, staffEditVersion: version + 1, deliveryAddress: address };
}
