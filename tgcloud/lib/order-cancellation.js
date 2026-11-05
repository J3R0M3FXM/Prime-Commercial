import { db, EndpointError } from 'sdk';
import { notifyOrderStatusChanged } from './order-notifications.js';
import { releaseInventoryReservations } from './inventory.js';
import { queueOrderCreditRefund } from './order-credit-refunds.js';

async function cancelUnpaidOrder(order, decision) {
  const id = String(order?.id || '');
  const changed = await db.run(
    `UPDATE orders SET status = 'Cancelled', review_status = :review_status, updated_at = unixepoch()
     WHERE id = :order_id AND lower(status) = 'pending'
       AND lower(coalesce(payment_status, '')) = 'unpaid'
       AND trim(coalesce(payment_proof_image, '')) = ''
     RETURNING id`,
    { ':order_id': id, ':review_status': decision === 'reject' ? 'Rejected before payment' : 'Cancelled before payment' },
  );
  if (!Number(changed?.rowsAffected)) return { expired: false };
  await releaseInventoryReservations(id);
  await releaseCancellationClaims(id);
  await notifyOrderStatusChanged({ chatId: order.tgUserId, orderNumber: order.orderNumber || id,
    status: 'Cancelled', paymentStatus: order.paymentStatus,
    totalAmount: Number(order.totalAmount) || 0, payableNow: Number(order.payableNow) || 0 });
  return { expired: true, status: 'Cancelled', cleanupPending: false };
}

async function releaseCancellationClaims(orderId) {
  await db.run(`UPDATE promo_claims SET status='released', updated_at=unixepoch()
    WHERE order_id=:order_id AND status IN ('held','redeemed')`, { ':order_id': String(orderId) });
  await db.run(`UPDATE orders SET referral_points_status=CASE
      WHEN referral_points_status IN ('pending_delivery','pending_30m') THEN 'cancelled'
      ELSE referral_points_status END, updated_at=unixepoch() WHERE id=:order_id`, { ':order_id': String(orderId) });
}

/** Cancel before Ready. Proven unpaid orders close now; payment evidence requires refund review. */
export async function requestOrderCancellation(order, decision = 'cancel', options = {}) {
  const id = String(order?.id || '');
  if (!id) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
  const status = String(order.status || '').toLowerCase();
  const staffOverride = options?.staffOverride === true;
  if (status === 'cancellation requested') return { success: true, orderId: id, status: 'Cancellation Requested', refundReviewRequired: true };
  if (staffOverride && ['dispatched', 'completed', 'delivered', 'expired', 'cancelled', 'rejected'].includes(status)) {
    throw new EndpointError('Dispatched or completed orders cannot be cancelled.', { code: 'ORDER_NOT_CANCELLABLE' });
  }
  if (staffOverride && ['ready', 'packed'].includes(status)) {
    const changed = await db.run(
      `UPDATE orders SET status = 'Cancelled', review_status = :review_status,
         updated_at = unixepoch()
       WHERE id = :order_id AND lower(status) IN ('ready', 'packed')
       RETURNING id`,
      { ':order_id': id, ':review_status': 'Staff cancellation override — Store Credit refund review' },
    );
    if (!Number(changed?.rowsAffected)) throw new EndpointError('The order changed. Refresh and try again.', { code: 'ORDER_CHANGED' });
    await releaseInventoryReservations(id);
    await releaseCancellationClaims(id);
    const refund = String(order.paymentStatus || '').toLowerCase() === 'paid'
      ? await queueOrderCreditRefund({ orderId: id, customerId: order.customerId, amount: order.totalAmount, reason: 'Store Credit refund after staff cancellation' }) : { completed: true };
    await notifyOrderStatusChanged({ chatId: order.tgUserId, orderNumber: order.orderNumber || id,
      status: 'Cancelled', paymentStatus: order.paymentStatus,
      totalAmount: Number(order.totalAmount) || 0, payableNow: Number(order.payableNow) || 0 });
    return { success: true, orderId: id, status: 'Cancelled', refundReviewRequired: !refund.completed, staffOverride: true };
  }
  if (staffOverride && ['pending', 'approved', 'processing'].includes(status) && String(order.paymentStatus || '').toLowerCase() === 'paid') {
    const changed = await db.run(
      `UPDATE orders SET status = 'Cancelled', review_status = :review_status,
         updated_at = unixepoch()
       WHERE id = :order_id AND lower(status) = :expected_status
         AND lower(coalesce(payment_status, '')) = 'paid'
       RETURNING id`,
      { ':order_id': id, ':expected_status': status, ':review_status': 'Staff cancellation override — Store Credit refund review' },
    );
    if (!Number(changed?.rowsAffected)) throw new EndpointError('The order changed. Refresh and try again.', { code: 'ORDER_CHANGED' });
    await releaseInventoryReservations(id);
    await releaseCancellationClaims(id);
    const refund = await queueOrderCreditRefund({ orderId: id, customerId: order.customerId, amount: order.totalAmount, reason: 'Store Credit refund after staff cancellation' });
    await notifyOrderStatusChanged({ chatId: order.tgUserId, orderNumber: order.orderNumber || id,
      status: 'Cancelled', paymentStatus: order.paymentStatus,
      totalAmount: Number(order.totalAmount) || 0, payableNow: Number(order.payableNow) || 0 });
    return { success: true, orderId: id, status: 'Cancelled', refundReviewRequired: !refund.completed, staffOverride: true };
  }
  if (!['pending', 'approved', 'processing'].includes(status)) throw new EndpointError('Cancellation is available only before the order is Ready.', { code: 'ORDER_NOT_CANCELLABLE' });
  if (status === 'pending' && String(order.paymentStatus || '').toLowerCase() === 'unpaid' && !String(order.paymentProofImage || '').trim()) {
    const result = await cancelUnpaidOrder(order, decision);
    if (!result.expired) throw new EndpointError('The order changed. Refresh and try again.', { code: 'ORDER_CHANGED' });
    return { success: true, orderId: id, status: result.status, cleanupPending: result.cleanupPending === true, refundReviewRequired: false };
  }
  const changed = await db.run(
    `UPDATE orders SET status = 'Cancellation Requested',
       review_status = :review_status, updated_at = unixepoch()
     WHERE id = :order_id AND lower(status) IN ('pending', 'approved', 'processing')
       AND (lower(status) = :expected_status)
       AND lower(coalesce(payment_status, '')) = :expected_payment
     RETURNING id`,
    { ':order_id': id, ':expected_status': status, ':expected_payment': String(order.paymentStatus || '').toLowerCase(),
      ':review_status': decision === 'reject' ? 'Rejected — payment/refund review required' : 'Cancellation — payment/refund review required' },
  );
  if (!Number(changed?.rowsAffected)) throw new EndpointError('The order changed. Refresh and try again.', { code: 'ORDER_CHANGED' });
  await notifyOrderStatusChanged({ chatId: order.tgUserId, orderNumber: order.orderNumber || id,
    status: 'Cancellation Requested', paymentStatus: order.paymentStatus,
    totalAmount: Number(order.totalAmount) || 0, payableNow: Number(order.payableNow) || 0 });
  return { success: true, orderId: id, status: 'Cancellation Requested', refundReviewRequired: true };
}
