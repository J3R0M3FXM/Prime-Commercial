const TELEGRAM_API_BASE = 'https://api.telegram.org';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount);
}

function getStatusIcon(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('deliver')) return '🚚';
  if (normalized.includes('ship') || normalized.includes('dispatch')) return '📦';
  if (normalized.includes('process')) return '⚙️';
  if (normalized.includes('confirm') || normalized.includes('approved')) return '✅';
  if (normalized.includes('cancel') || normalized.includes('reject') || normalized.includes('expired')) return '❌';
  if (normalized.includes('pending')) return '⏳';
  return '🔔';
}

let cachedBotUsername: string | null = null;

async function getBotUsername(): Promise<string> {
  if (cachedBotUsername) return cachedBotUsername;

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');

  const response = await fetch(TELEGRAM_API_BASE + '/bot' + token + '/getMe', {
    method: 'GET',
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  const username = String(result?.result?.username || '').trim();

  if (!response.ok || !result?.ok || !username) {
    throw new Error(result?.description || 'Telegram bot username could not be resolved.');
  }

  cachedBotUsername = username;
  return username;
}

async function getOrderDetailsUrl(orderNumber: string): Promise<string> {
  const botUsername = await getBotUsername();
  const startParam = encodeURIComponent('order_' + orderNumber);
  return 'https://t.me/' + botUsername + '?startapp=' + startParam;
}

async function buildOrderInlineKeyboard(orderNumber: string, label: string) {
  return {
    inline_keyboard: [[
      {
        text: label,
        url: await getOrderDetailsUrl(orderNumber),
      },
    ]],
  };
}

function formatPaymentDeadline(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

async function sendTelegramMessage(
  chatId: string | number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) {
    console.warn('Telegram notification skipped: missing TELEGRAM_BOT_TOKEN or chat ID');
    return false;
  }

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: String(chatId),
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        }),
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error('Telegram notification failed:', response.status, detail);
      return false;
    }

    const result = await response.json();
    if (!result.ok) {
      console.error('Telegram notification rejected:', result.description);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram notification error:', error);
    return false;
  }
}

export type OrderNotification = {
  chatId?: string | number | null;
  orderNumber: string;
  status: string;
  customerName?: string | null;
  totalAmount?: number | null;
  payableNow?: number | null;
  paymentStatus?: string | null;
  paymentDeadlineAt?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  items?: Array<{ name?: string; quantity?: number; qty?: number; price?: number }> | null;
  event?: 'created' | 'status' | 'payment';
};

export async function notifyOrderCreated(order: OrderNotification): Promise<boolean> {
  if (!order.chatId) return false;

  const items = Array.isArray(order.items)
    ? order.items
        .slice(0, 10)
        .map((item) => {
          const quantity = Number(item.quantity ?? item.qty ?? 1);
          return `• ${escapeHtml(item.name || 'Item')} × ${quantity}`;
        })
        .join('\n')
    : '';

  const message = [
    '🛍️ <b>ORDER RECEIVED</b>',
    '',
    `Hello ${escapeHtml(order.customerName || 'Customer')}!`,
    'Your order has been received and is now being processed.',
    '',
    `🧾 <b>Order:</b> <code>${escapeHtml(order.orderNumber)}</code>`,
    `📌 <b>Status:</b> ${escapeHtml(order.status)}`,
    order.totalAmount !== undefined ? `💰 <b>Total:</b> ${money(order.totalAmount)}` : '',
    order.payableNow !== undefined ? `💳 <b>Payable now:</b> ${money(order.payableNow)}` : '',
    order.paymentDeadlineAt ? `⏳ <b>Payment proof deadline:</b> ${escapeHtml(formatPaymentDeadline(order.paymentDeadlineAt))}` : '',
    items ? `\n<b>Items</b>\n${items}` : '',
    '',
    'Please submit your payment proof before the deadline so your reserved stock is not released.',
    'We will send you another Telegram notification whenever your order status changes.',
  ].filter(Boolean).join('\n');

  return sendTelegramMessage(
    order.chatId,
    message,
    await buildOrderInlineKeyboard(order.orderNumber, '💳 Open Order & Upload Payment Proof')
  );
}

export async function notifyOrderStatusChanged(order: OrderNotification): Promise<boolean> {
  if (!order.chatId) return false;

  const message = [
    `${getStatusIcon(order.status)} <b>ORDER UPDATE</b>`,
    '',
    `🧾 <b>Order:</b> <code>${escapeHtml(order.orderNumber)}</code>`,
    `📌 <b>New status:</b> ${escapeHtml(order.status)}`,
    order.courierName ? `🚚 <b>Courier:</b> ${escapeHtml(order.courierName)}` : '',
    order.trackingNumber ? `🔎 <b>Tracking:</b> <code>${escapeHtml(order.trackingNumber)}</code>` : '',
    order.totalAmount !== undefined ? `💰 <b>Total:</b> ${money(order.totalAmount)}` : '',
    order.status.toLowerCase() === 'expired'
      ? '⚠️ Your one-hour payment proof window ended without a submitted receipt. The order has expired.'
      : '',
    '',
    'Your order record has been updated. We will keep you informed of the next step.',
  ].filter(Boolean).join('\n');

  return sendTelegramMessage(
    order.chatId,
    message,
    await buildOrderInlineKeyboard(
      order.orderNumber,
      order.status.toLowerCase() === 'pending' && String(order.paymentStatus || '').toLowerCase() === 'unpaid'
        ? '💳 Open Order & Upload Payment Proof'
        : '📄 View Order Details'
    )
  );
}

export async function notifyPaymentUpdated(order: OrderNotification): Promise<boolean> {
  if (!order.chatId) return false;

  const message = [
    '💳 <b>PAYMENT UPDATE</b>',
    '',
    `🧾 <b>Order:</b> <code>${escapeHtml(order.orderNumber)}</code>`,
    `📌 <b>Order status:</b> ${escapeHtml(order.status)}`,
    `💰 <b>Total:</b> ${money(order.totalAmount)}`,
    `💳 <b>Payment status:</b> ${escapeHtml(order.paymentStatus || 'Updated')}`,
    '',
    'Your payment information has been received and is being reviewed.',
  ].join('\n');

  return sendTelegramMessage(
    order.chatId,
    message,
    await buildOrderInlineKeyboard(order.orderNumber, '📄 View Order Details')
  );
}
