import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { configuredAdminIds } from './auth.js';
import { customerNotificationContent, customerNotificationKeyboard } from './customer-order-notifications.js';

export async function ensureNotificationOutbox() {
  const exists = () => db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='telegram_notification_outbox'");
  if (await exists()) return;
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS telegram_notification_outbox (
      id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,chat_id TEXT NOT NULL,
      message_text TEXT NOT NULL,order_number TEXT NOT NULL,button_label TEXT NOT NULL,
      status TEXT NOT NULL,attempt_count INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL,
      lease_token TEXT,lease_until INTEGER,created_at INTEGER NOT NULL,sent_at INTEGER,last_error TEXT)`);
  } catch (error) { if (!await exists()) throw error; }
}

export async function getAdminNotificationRecipients() {
  const setting = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, 'admin_telegram_user_id')).get();
  return [...configuredAdminIds(setting?.value)];
}

function randomToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function hashEventKey(value) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function money(value) {
  const amount = Number(value);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatMessage(sections) {
  return sections.map((section) => String(section || '').trim()).filter(Boolean).join('\n\n');
}

function formatDeadline(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(date);
}

let botUsername = '';
export async function orderKeyboard(orderNumber, label) {
  if (!botUsername) {
    const bot = await api.getMe();
    botUsername = String(bot?.username || '').trim();
  }
  if (!botUsername) throw new Error('Telegram bot username is unavailable.');
  if (label !== 'Open Admin Order') {
    const saved = label === 'TRACK DELIVERY' ? await db.get(
      'SELECT tracking_url AS trackingUrl, status FROM orders WHERE order_number=:number',
      { ':number': String(orderNumber) }) : null;
    return customerNotificationKeyboard(botUsername, orderNumber, label,
      String(saved?.status || '').toLowerCase() === 'dispatched' ? String(saved?.trackingUrl || '') : '');
  }
  const prefix = 'admin_order_';
  const startParam = encodeURIComponent(prefix + String(orderNumber || ''));
  return { inline_keyboard: [[{
    text: label,
    url: 'https://t.me/' + botUsername + '?startapp=' + startParam,
  }]] };
}

async function send(chatId, text, orderNumber, buttonLabel, eventKey) {
  if (!chatId || !orderNumber) return false;
  let leaseToken = '';
  let privateEventKey = '';
  let ownsOutboxRow = false;
  let outboxAvailable = false;
  try {
    await ensureNotificationOutbox();
    leaseToken = randomToken();
    privateEventKey = await hashEventKey(eventKey);
    await db.run(
      `INSERT OR IGNORE INTO telegram_notification_outbox
         (id, event_key, chat_id, message_text, order_number, button_label, status,
          attempt_count, next_attempt_at, lease_token, lease_until, created_at)
       VALUES (:id, :event_key, :chat_id, :message_text, :order_number, :button_label,
          'inline', 0, unixepoch(), :lease_token, unixepoch() + 180, unixepoch())`,
      { ':id': leaseToken, ':event_key': privateEventKey, ':chat_id': String(chatId), ':message_text': text,
        ':order_number': String(orderNumber), ':button_label': buttonLabel, ':lease_token': leaseToken },
    );
    outboxAvailable = true;
    const row = await db.get(
      `SELECT status, lease_token AS leaseToken FROM telegram_notification_outbox WHERE event_key = :event_key`,
      { ':event_key': privateEventKey },
    );
    if (!row) throw new Error('Notification outbox insert was not persisted.');
    if (row.status === 'sent') return true;
    if (row.leaseToken !== leaseToken) return false;
    ownsOutboxRow = true;
  } catch (error) {
    // Keep the existing inline path working until the additive table is migrated.
    console.warn('[order-notification] outbox unavailable; using inline delivery.');
    if (outboxAvailable) return false;
  }

  try {
    await api.sendMessage({
      chat_id: String(chatId), text, parse_mode: 'HTML', disable_web_page_preview: true,
      reply_markup: await orderKeyboard(orderNumber, buttonLabel),
    });
    if (ownsOutboxRow) {
      try {
        await db.run(
          `UPDATE telegram_notification_outbox SET status = 'sent', sent_at = unixepoch(),
                  chat_id = '', message_text = '', order_number = '', button_label = '',
                  lease_token = NULL, lease_until = NULL, last_error = NULL
            WHERE event_key = :event_key AND lease_token = :lease_token`,
          { ':event_key': privateEventKey, ':lease_token': leaseToken },
        );
      } catch {
        console.warn('[order-notification] delivered message could not be marked sent.');
      }
    }
    return true;
  } catch (error) {
    console.warn('[order-notification] Telegram delivery failed:', String(error?.message || error).slice(0, 200));
    if (ownsOutboxRow && outboxAvailable) {
      try {
        await db.run(
          `UPDATE telegram_notification_outbox SET status = 'retry', attempt_count = attempt_count + 1,
                  next_attempt_at = unixepoch() + 60, last_error = 'inline_send_failed',
                  lease_token = NULL, lease_until = NULL
            WHERE event_key = :event_key AND lease_token = :lease_token`,
          { ':event_key': privateEventKey, ':lease_token': leaseToken },
        );
      } catch {
        console.warn('[order-notification] retry state could not be saved.');
      }
    }
    return false;
  }
}

export async function notifyOrderCreated(order) {
  return notifyCustomerOrder({ ...order, status: 'Pending' }, 'order-created:' + String(order.orderNumber));
}

/** Notify the configured Admin independently of the customer delivery result. */
export async function notifyAdminOrderCreated(order) {
  const number = String(order?.orderNumber || '').trim();
  if (!number) return false;
  try {
    const recipients = await getAdminNotificationRecipients();
    if (!recipients.length) {
      console.warn('[order-notification] Admin Telegram recipient is not configured.');
      return false;
    }
    // This marks when Admin alerts became active, so a later maintenance run
    // never sends an unexpected backlog from before this feature was enabled.
    await db.run(`INSERT OR IGNORE INTO system_settings (key, value, updated_at)
      VALUES ('admin_order_alert_start_at', unixepoch(), unixepoch())`);
    const message = formatMessage([
      '<b>PRIME™ NEW ORDER</b>',
      `Order No.: <code>${escapeHtml(number)}</code>`,
      `Source: ${escapeHtml(order?.source === 'pos' ? 'POS' : 'Shopfront')}`,
      `Customer: ${escapeHtml(order?.customerName || 'Customer')}`,
      `Total: <b>${money(order?.totalAmount)}</b>`,
      `Payment: ${escapeHtml(order?.paymentStatus || 'Unpaid')}`,
      'Open Order Management to review this order.',
    ]);
    const results = await Promise.all(recipients.map(async (chatId) => {
      try {
        return await send(chatId, message, number, 'Open Admin Order',
          'admin-order-created:' + number + ':' + chatId);
      } catch {
        return false;
      }
    }));
    return results.every(Boolean);
  } catch (error) {
    console.warn('[order-notification] Admin order alert could not be queued:', String(error?.message || error).slice(0, 120));
    return false;
  }
}

/** Resolve stored status before composing a customer message. */
async function notificationOrder(input) {
  const stored = await db.get(`
    SELECT order_number AS orderNumber, tg_user_id AS chatId, status,
      payment_status AS paymentStatus, control_state AS controlState,
      review_status AS reviewStatus, tracking_url AS trackingUrl,
      payment_proof_image AS paymentProofImage, id
    FROM orders WHERE order_number=:number`, { ':number': String(input.orderNumber || '') });
  const order = { ...input, ...(stored || {}) };
  if (String(order.controlState || '').toLowerCase() === 'held') {
    const deadline = await db.get(`SELECT d.expires_at AS expiresAt FROM order_receipt_deadlines d
      JOIN order_workflow w ON w.order_id=d.order_id
      WHERE d.order_id=:id AND w.resubmission_requested=1`, { ':id': String(order.id || '') });
    order.resubmitExpiresAt = deadline ? Number(deadline.expiresAt) * 1000 : null;
  }
  return order;
}

async function notifyCustomerOrder(input, eventKey = '') {
  const order = await notificationOrder(input);
  const content = customerNotificationContent(order);
  if (!content) return false;
  return send(order.chatId, content.text, order.orderNumber, content.buttonLabel,
    eventKey || 'order-status:' + String(order.orderNumber) + ':' + content.kind +
      (content.kind === 'hold' ? ':' + String(order.resubmitExpiresAt) : '') +
      (order.controlEventId ? ':' + String(order.controlEventId) : ''));
}

export async function notifyPosOrderCreated(order) {
  return notifyCustomerOrder({ ...order, status: order.status || 'Processing', paymentStatus: 'Paid' },
    'pos-created:' + String(order.orderNumber));
}

export async function notifyOrderStatusChanged(order) { return notifyCustomerOrder(order); }

export async function notifyPaymentUpdated(order) { return notifyCustomerOrder(order); }

export async function notifyPaymentProofSubmitted(input) {
  const order = await notificationOrder(input);
  return notifyCustomerOrder(order, 'receipt-review:' + String(order.orderNumber) + ':' + String(order.paymentProofImage || ''));
}

export async function notifyOrderExpired(order) {
  return notifyCustomerOrder({ ...order, status: 'Expired', cancellationReason: 'non-payment' });
}

/** The existing owner scheduler and staff retry UI share this bounded, leased dispatcher. */
export async function dispatchOrderNotificationRetries(limit = 20) {
  await ensureNotificationOutbox();
  const rows = await db.all(`SELECT id,chat_id AS chatId,message_text AS messageText,
    order_number AS orderNumber,button_label AS buttonLabel,attempt_count AS attemptCount
    FROM telegram_notification_outbox WHERE attempt_count<8 AND
      ((status='retry' AND next_attempt_at<=unixepoch()) OR
       (status IN ('inline','sending') AND coalesce(lease_until,0)<=unixepoch()))
    ORDER BY next_attempt_at,id LIMIT :limit`, { ':limit': Math.max(1,Math.min(20,Number(limit)||20)) });
  const result = { sent: 0, deferred: 0, superseded: 0 };
  for (const row of rows) {
    const token = randomToken();
    const claimed = await db.run(`UPDATE telegram_notification_outbox
      SET status='sending',lease_token=:token,lease_until=unixepoch()+180
      WHERE id=:id AND attempt_count<8 AND
        ((status='retry' AND next_attempt_at<=unixepoch()) OR
         (status IN ('inline','sending') AND coalesce(lease_until,0)<=unixepoch())) RETURNING id`,
    { ':id': row.id, ':token': token });
    if (!Number(claimed?.rowsAffected)) continue;
    const params = { ':id': row.id, ':token': token };
    try {
      if (row.buttonLabel !== 'Open Admin Order') {
        const content = customerNotificationContent(await notificationOrder({ orderNumber: row.orderNumber }));
        if (!content || content.text !== row.messageText || content.buttonLabel !== row.buttonLabel) {
          await db.run(`UPDATE telegram_notification_outbox SET status='failed',last_error='superseded_status_or_template',
            lease_token=NULL,lease_until=NULL WHERE id=:id AND lease_token=:token`, params);
          result.superseded++; continue;
        }
      }
      await api.sendMessage({ chat_id: String(row.chatId), text: row.messageText,
        parse_mode: 'HTML', disable_web_page_preview: true,
        reply_markup: await orderKeyboard(row.orderNumber,row.buttonLabel) });
      await db.run(`UPDATE telegram_notification_outbox SET status='sent',sent_at=unixepoch(),
        chat_id='',message_text='',order_number='',button_label='',lease_token=NULL,lease_until=NULL,last_error=NULL
        WHERE id=:id AND lease_token=:token`, params);
      result.sent++;
    } catch {
      const attempts = Number(row.attemptCount || 0) + 1;
      await db.run(`UPDATE telegram_notification_outbox SET status=:status,attempt_count=:attempts,
        next_attempt_at=unixepoch()+:delay,last_error='telegram_delivery_failed',lease_token=NULL,lease_until=NULL
        WHERE id=:id AND lease_token=:token`, { ...params, ':status': attempts >= 8 ? 'failed' : 'retry',
        ':attempts': attempts, ':delay': Math.min(3600,60 * 2 ** attempts) });
      result.deferred++;
    }
  }
  return result;
}
