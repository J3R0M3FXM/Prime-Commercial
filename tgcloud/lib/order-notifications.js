import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { systemSettings } from '../schema.js';
import { configuredAdminIds } from './auth.js';

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
async function orderKeyboard(orderNumber, label) {
  if (!botUsername) {
    const bot = await api.getMe();
    botUsername = String(bot?.username || '').trim();
  }
  if (!botUsername) throw new Error('Telegram bot username is unavailable.');
  const prefix = label === 'Open Admin Order' ? 'admin_order_' : 'order_';
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

function paymentProofButton(order) {
  return String(order?.status || '').toLowerCase() === 'pending' &&
    String(order?.paymentStatus || '').toLowerCase() === 'unpaid'
    ? 'Upload Payment Proof'
    : 'View Order Details';
}

export async function notifyOrderCreated(order) {
  const items = Array.isArray(order.items) ? order.items.slice(0, 10).map((item) => {
    const quantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;
    return `- ${escapeHtml(item?.name || 'Item')} x ${quantity}`;
  }).join('\n') : '';
  const deadline = formatDeadline(order.paymentDeadlineAt);
  const message = formatMessage([
    '<b>PRIME™ ORDER MANAGEMENT</b>',
    [
      `Order No.: <code>${escapeHtml(order.orderNumber)}</code>`,
      `Status: ${String(order.paymentStatus || '').toLowerCase() === 'unpaid' ? 'Awaiting Payment' : escapeHtml(order.status)}`,
      deadline ? `Payment deadline: ${escapeHtml(deadline)}` : '',
    ].filter(Boolean).join('\n'),
    `Hi, ${escapeHtml(order.customerName || 'there')}!`,
    `We have received your order. Total payable: <b>${money(order.payableNow ?? order.totalAmount)}</b>.`,
    deadline ? 'Please settle the amount and upload your proof of payment before the deadline above to avoid automatic cancellation.' : 'We will notify you when your order status changes.',
    items ? `<b>Order items</b>\n${items}` : '',
    'Thank you for choosing PRIME™ Sourcing &amp; Distribution Network!',
  ]);
  return send(order.chatId, message, order.orderNumber, 'Upload Payment Proof', 'order-created:' + String(order.orderNumber));
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

/** Notify the recipient of a POS order whose payment was already collected. */
export async function notifyPosOrderCreated(order) {
  const items = Array.isArray(order.items) ? order.items.slice(0, 10).map((item) => {
    const quantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;
    return `- ${escapeHtml(item?.name || 'Item')} x ${quantity}`;
  }).join('\n') : '';
  const message = formatMessage([
    '<b>PRIME™ ORDER MANAGEMENT</b>',
    [
      `Order No.: <code>${escapeHtml(order.orderNumber)}</code>`,
      `Status: ${escapeHtml(order.status || 'Processing')}`,
      `Payment: Received by ${escapeHtml(order.paymentMethodName || 'staff')}`,
      `Total: <b>${money(order.totalAmount)}</b>`,
    ].join('\n'),
    `Hi, ${escapeHtml(order.customerName || 'there')}!`,
    'Your order has been recorded by PRIME staff and payment is confirmed.',
    items ? `<b>Order items</b>\n${items}` : '',
    'We will send another message when your order status changes.',
    'Thank you for choosing PRIME™ Sourcing &amp; Distribution Network!',
  ]);
  return send(order.chatId, message, order.orderNumber, 'View Order Details', 'pos-created:' + String(order.orderNumber));
}

export async function notifyOrderStatusChanged(order) {
  const status = String(order.status || 'Updated');
  const expired = status.toLowerCase() === 'expired';
  const message = formatMessage([
    '<b>PRIME™ ORDER MANAGEMENT</b>',
    [
      `Order No.: <code>${escapeHtml(order.orderNumber)}</code>`,
      `Status: ${escapeHtml(status)}`,
      order.courierName ? `Courier: ${escapeHtml(order.courierName)}` : '',
      order.trackingNumber ? `Tracking number: <code>${escapeHtml(order.trackingNumber)}</code>` : '',
      order.totalAmount !== undefined ? `Total amount: ${money(order.totalAmount)}` : '',
    ].filter(Boolean).join('\n'),
    expired ? 'Your order expired because payment proof was not received within the one-hour submission window. The order has been cancelled.' : order.trackingOverridden ? 'Your order has been dispatched. A tracking link is not available yet; contact PRIME Commercial support if you need delivery details.' : 'Your order status has been updated.',
    'If you need assistance, please contact PRIME™ Commercial support.',
  ]);
  return send(order.chatId, message, order.orderNumber, paymentProofButton(order),
    'order-status:' + String(order.orderNumber) + ':' + status.toLowerCase() + (order.controlEventId ? ':' + String(order.controlEventId) : ''));
}

export async function notifyPaymentUpdated(order) {
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid';
  const message = formatMessage([
    '<b>PRIME™ ORDER MANAGEMENT</b>',
    [
      `Order No.: <code>${escapeHtml(order.orderNumber)}</code>`,
      `Status: ${escapeHtml(order.status || 'Pending')}`,
      `Payment status: ${escapeHtml(order.paymentStatus || 'Pending Review')}`,
      order.totalAmount !== undefined ? `Total amount: ${money(order.totalAmount)}` : '',
    ].filter(Boolean).join('\n'),
    paid ? 'Your payment has been reviewed and the order payment is confirmed.' : 'We have received your payment proof. It is awaiting staff review. We will notify you when the review is complete.',
  ]);
  return send(order.chatId, message, order.orderNumber, 'View Order Details',
    'payment-status:' + String(order.orderNumber) + ':' + String(order.paymentStatus || '').toLowerCase());
}

export async function notifyPaymentProofSubmitted(order) {
  return notifyPaymentUpdated({ ...order, paymentStatus: 'Pending Review' });
}

export async function notifyOrderExpired(order) {
  return notifyOrderStatusChanged({ ...order, status: 'Expired', paymentStatus: 'Unpaid' });
}
