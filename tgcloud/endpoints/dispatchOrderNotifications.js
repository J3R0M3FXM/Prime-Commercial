import { api, db, EndpointError } from 'sdk';

const MAX_BATCH = 8;
const MAX_ATTEMPTS = 8;
const TEST_ORDER_MARKER = '__PRIME_SCHEDULER_TEST__';
let botUsername = '';

function randomToken() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function keyboard(orderNumber, label) {
  if (!botUsername) {
    const bot = await api.getMe();
    botUsername = String(bot?.username || '').trim();
  }
  if (!botUsername) throw new Error('bot_username_unavailable');
  return { inline_keyboard: [[{
    text: label,
    url: 'https://t.me/' + botUsername + '?startapp=' + encodeURIComponent('order_' + orderNumber),
  }]] };
}

async function claim(row) {
  const token = randomToken();
  const changed = await db.run(
    `UPDATE telegram_notification_outbox
        SET status = 'sending', lease_token = :token, lease_until = unixepoch() + 180
      WHERE id = :id AND status IN ('retry', 'inline')
        AND next_attempt_at <= unixepoch()
        AND (lease_until IS NULL OR lease_until <= unixepoch())
      RETURNING id`,
    { ':token': token, ':id': row.id },
  );
  if (!Number(changed?.rowsAffected) && !changed?.rows?.length) return null;
  return { ...row, token };
}

async function deliver(row) {
  const claimed = await claim(row);
  if (!claimed) return 'skipped';
  try {
    const payload = {
      chat_id: String(claimed.chatId), text: claimed.messageText, parse_mode: 'HTML',
      disable_web_page_preview: true,
    };
    if (claimed.orderNumber !== TEST_ORDER_MARKER) {
      payload.reply_markup = await keyboard(claimed.orderNumber, claimed.buttonLabel);
    }
    await api.sendMessage(payload);
    await db.run(
      `UPDATE telegram_notification_outbox SET status = 'sent', sent_at = unixepoch(),
              chat_id = '', message_text = '', order_number = '', button_label = '',
              lease_token = NULL, lease_until = NULL, last_error = NULL
        WHERE id = :id AND status = 'sending' AND lease_token = :token`,
      { ':id': claimed.id, ':token': claimed.token },
    );
    return 'sent';
  } catch (error) {
    const attempts = Math.max(0, Number(claimed.attemptCount) || 0) + 1;
    const terminal = attempts >= MAX_ATTEMPTS;
    const delaySeconds = Math.min(3600, 60 * (2 ** Math.min(attempts - 1, 6)));
    await db.run(
      `UPDATE telegram_notification_outbox
          SET status = :status, attempt_count = :attempts,
              next_attempt_at = unixepoch() + :delay, last_error = 'telegram_send_failed',
              lease_token = NULL, lease_until = NULL
        WHERE id = :id AND status = 'sending' AND lease_token = :token`,
      { ':status': terminal ? 'failed' : 'retry', ':attempts': attempts,
        ':delay': delaySeconds, ':id': claimed.id, ':token': claimed.token },
    );
    console.warn('[notification-dispatch] Telegram send failed; retry state saved.');
    return terminal ? 'failed' : 'retry';
  }
}

async function cleanup() {
  const thirtyDays = 30 * 24 * 60 * 60;
  const ninetyDays = 90 * 24 * 60 * 60;
  // Clear sensitive content from failed rows after 30 days.
  // Sent rows are already cleared immediately after success.
  const cleared = await db.run(
    `UPDATE telegram_notification_outbox
        SET chat_id = '', message_text = '', order_number = '', button_label = '', last_error = 'retention_cleared'
      WHERE status = 'failed' AND chat_id <> '' AND created_at <= unixepoch() - :thirtyDays`,
    { ':thirtyDays': thirtyDays },
  );
  // Delete all rows older than 90 days to keep the table size manageable.
  const deleted = await db.run(
    `DELETE FROM telegram_notification_outbox WHERE created_at <= unixepoch() - :ninetyDays`,
    { ':ninetyDays': ninetyDays },
  );
  return {
    cleared: Number(cleared?.rowsAffected || 0),
    deleted: Number(deleted?.rowsAffected || 0),
  };
}

/** Invoked by the authenticated TGCloud CLI runner; Telegram Mini App calls are rejected. */
export default async function (input = {}, ctx) {
  if (ctx?.initData?.user) {
    throw new EndpointError('This dispatcher is available only to the scheduled CLI runner.', { code: 'RUNNER_ONLY' });
  }
  const requested = Number(input?.limit);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(MAX_BATCH, requested)) : MAX_BATCH;
  const testOnly = input?.testOnly === true;
  const testFilter = testOnly ? " AND order_number = '__PRIME_SCHEDULER_TEST__'" : '';
  if (input?.dryRun === true) {
    const result = await db.get(
      `SELECT COUNT(*) AS due_count
         FROM telegram_notification_outbox
        WHERE status IN ('retry', 'inline') AND next_attempt_at <= unixepoch()
          AND (lease_until IS NULL OR lease_until <= unixepoch())${testFilter}`,
    );
    return { dryRun: true, testOnly, dueCount: Number(result?.due_count || 0), batchLimit: limit };
  }
  const due = await db.all(
    `SELECT id, chat_id AS chatId, message_text AS messageText,
            order_number AS orderNumber, button_label AS buttonLabel,
            attempt_count AS attemptCount
       FROM telegram_notification_outbox
      WHERE status IN ('retry', 'inline') AND next_attempt_at <= unixepoch()
        AND (lease_until IS NULL OR lease_until <= unixepoch())
        ${testFilter}
      ORDER BY created_at ASC LIMIT :limit`,
    { ':limit': limit },
  );
  const counts = { inspected: due.length, sent: 0, retried: 0, failed: 0, skipped: 0 };
  for (const row of due) {
    const result = await deliver(row);
    if (result === 'sent') counts.sent += 1;
    else if (result === 'retry') counts.retried += 1;
    else if (result === 'failed') counts.failed += 1;
    else counts.skipped += 1;
  }
  if (!testOnly) counts.cleanup = await cleanup();
  return counts;
}
