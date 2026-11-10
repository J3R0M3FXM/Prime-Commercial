import { db, EndpointError } from 'sdk';
import { requireAdmin } from '../lib/auth.js';
import { dispatchOrderNotificationRetries, ensureNotificationOutbox } from '../lib/order-notifications.js';

export default async function (input, ctx) {
  await requireAdmin(ctx);
  await ensureNotificationOutbox();
  const action = String(input?.action || 'list');
  if (action === 'list') return { notifications: await db.all(`SELECT id,event_key AS eventKey,chat_id AS chatId,
    message_text AS messageText,order_number AS orderNumber,button_label AS buttonLabel,status,
    attempt_count AS attemptCount,next_attempt_at*1000 AS nextAttemptAt,sent_at*1000 AS sentAt,
    last_error AS lastError,created_at*1000 AS createdAt
    FROM telegram_notification_outbox ORDER BY created_at DESC,id DESC LIMIT 100`) };
  const id = String(input?.id || '');
  if (action === 'retry') {
    const row = await db.get('SELECT last_error AS lastError FROM telegram_notification_outbox WHERE id=:id',{ ':id':id });
    if (row?.lastError === 'superseded_status_or_template') throw new EndpointError('This message is obsolete. The current order status determines its notification.',{ code:'NOTIFICATION_SUPERSEDED' });
    const updated = await db.run(`UPDATE telegram_notification_outbox SET status='retry',attempt_count=0,next_attempt_at=unixepoch(),
      last_error=NULL,lease_token=NULL,lease_until=NULL WHERE id=:id AND status IN ('failed','retry') RETURNING id`,{ ':id':id });
    if (!Number(updated?.rowsAffected)) throw new EndpointError('This message is already sent, in progress, or unavailable.',{ code:'NOTIFICATION_CHANGED' });
    return { success:true, ...await dispatchOrderNotificationRetries(20) };
  }
  if (action === 'delete') {
    await db.run("DELETE FROM telegram_notification_outbox WHERE id=:id AND status IN ('sent','failed')",{ ':id':id });
    return { success:true };
  }
  if (action === 'cleanup') {
    const deleted = await db.run("DELETE FROM telegram_notification_outbox WHERE status IN ('sent','failed') AND created_at<unixepoch()-2592000");
    return { deletedCount:Number(deleted?.rowsAffected)||0 };
  }
  throw new EndpointError('Unsupported notification action.',{ code:'INVALID_ACTION' });
}
