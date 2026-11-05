import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { orderControlEvents, orders } from '../schema.js';

// The event and order transition commit in one SQLite INSERT statement.
// A failed predicate aborts the event as well as the status change.
const ENSURE_CONTROL_TRIGGER = `
  CREATE TRIGGER IF NOT EXISTS trg_order_control_event_v1
  AFTER INSERT ON order_control_events
  BEGIN
    SELECT CASE WHEN NEW.action NOT IN ('hold', 'resubmit', 'dispatch_override')
      OR length(trim(NEW.reason)) < 8
      THEN RAISE(ABORT, 'A valid order control and reason are required') END;
    SELECT CASE WHEN NOT EXISTS (
      SELECT 1 FROM orders o WHERE o.id = NEW.order_id
        AND coalesce(o.control_version, 0) = NEW.version_before
        AND lower(coalesce(o.status, '')) = lower(NEW.status_before)
        AND lower(coalesce(o.payment_status, '')) = lower(NEW.payment_before)
        AND ((NEW.action = 'hold' AND lower(o.status) = 'pending'
          AND lower(coalesce(o.control_state, 'normal')) IN ('normal', 'resubmitted'))
          OR (NEW.action = 'resubmit' AND lower(o.status) = 'pending'
            AND lower(coalesce(o.control_state, 'normal')) = 'held')
          OR (NEW.action = 'dispatch_override' AND lower(o.status) IN ('ready', 'packed')
            AND lower(o.payment_status) IN ('paid', 'completed')
            AND (coalesce(o.adjustment_due, 0) <= 0 OR lower(coalesce(o.adjustment_status, '')) = 'paid')))
    ) THEN RAISE(ABORT, 'Order state changed or control is unavailable') END;
    UPDATE orders SET
      control_state = CASE NEW.action WHEN 'hold' THEN 'held' WHEN 'resubmit' THEN 'resubmitted' ELSE control_state END,
      control_version = coalesce(control_version, 0) + 1,
      status = CASE WHEN NEW.action = 'dispatch_override' THEN 'Dispatched' ELSE status END,
      tracking_url = CASE WHEN NEW.action = 'dispatch_override' THEN '' ELSE tracking_url END,
      tracking_override_reason = CASE WHEN NEW.action = 'dispatch_override' THEN NEW.reason ELSE tracking_override_reason END,
      tracking_override_by = CASE WHEN NEW.action = 'dispatch_override' THEN NEW.actor_telegram_id ELSE tracking_override_by END,
      dispatched_at = CASE WHEN NEW.action = 'dispatch_override' THEN unixepoch() ELSE dispatched_at END,
      delivery_fallback_at = CASE WHEN NEW.action = 'dispatch_override' THEN unixepoch() + 21600 ELSE delivery_fallback_at END,
      updated_at = unixepoch()
      WHERE id = NEW.order_id AND coalesce(control_version, 0) = NEW.version_before;
    SELECT CASE WHEN changes() <> 1 THEN RAISE(ABORT, 'Order control was not saved') END;
  END;
`;

export async function applyOrderControl({ orderId, actorTelegramId, action, reason, operationId }) {
  const id = String(orderId || '').trim();
  const actor = String(actorTelegramId || '').trim();
  const cleanReason = String(reason || '').trim().slice(0, 500);
  const operation = String(operationId || '').trim().toLowerCase();
  if (!id || !/^[0-9]+$/.test(actor)) throw new EndpointError('Order and verified staff identity are required.', { code: 'AUTH_REQUIRED' });
  if (!['hold', 'resubmit', 'dispatch_override'].includes(action)) throw new EndpointError('Unsupported order control.', { code: 'INVALID_ACTION' });
  if (cleanReason.length < 8) throw new EndpointError('Enter a reason of at least 8 characters.', { code: 'REASON_REQUIRED' });
  if (!/^[a-f0-9]{32}$/.test(operation)) throw new EndpointError('A valid action request ID is required.', { code: 'INVALID_OPERATION_ID' });
  const eventId = `order-control-${id}-${operation}`;
  await db.run(ENSURE_CONTROL_TRIGGER);
  let event = await db.select().from(orderControlEvents).where(eq(orderControlEvents.id, eventId)).get();
  if (!event) {
    const order = await db.select().from(orders).where(eq(orders.id, id)).get();
    if (!order) throw new EndpointError('Order not found.', { code: 'NOT_FOUND' });
    try {
      await db.run(
        `INSERT INTO order_control_events (id, order_id, actor_telegram_id, action, reason,
           version_before, status_before, payment_before, created_at)
         VALUES (:id, :order_id, :actor, :action, :reason, :version, :status, :payment, unixepoch())`,
        { ':id': eventId, ':order_id': id, ':actor': actor, ':action': action, ':reason': cleanReason,
          ':version': Number(order.controlVersion) || 0, ':status': String(order.status || ''),
          ':payment': String(order.paymentStatus || '') },
      );
    } catch (error) {
      event = await db.select().from(orderControlEvents).where(eq(orderControlEvents.id, eventId)).get();
      if (!event) throw new EndpointError('The order changed or this control is unavailable. Refresh and try again.', { code: 'ORDER_CONTROL_CONFLICT' });
    }
  }
  event = event || await db.select().from(orderControlEvents).where(eq(orderControlEvents.id, eventId)).get();
  if (!event || String(event.orderId) !== id || String(event.actorTelegramId) !== actor ||
      String(event.action) !== action || String(event.reason) !== cleanReason) {
    throw new EndpointError('This action request ID was already used for another change.', { code: 'ORDER_CONTROL_ID_CONFLICT' });
  }
  const current = await db.select().from(orders).where(eq(orders.id, id)).get();
  return { success: true, orderId: id, eventId, status: String(current?.status || ''),
    controlState: String(current?.controlState || 'normal'), controlVersion: Number(current?.controlVersion) || 0,
    trackingOverrideReason: action === 'dispatch_override' ? cleanReason : undefined };
}
