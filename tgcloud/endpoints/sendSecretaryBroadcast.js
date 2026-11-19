import { api, db, EndpointError } from 'sdk';
import { requireAdmin } from '../lib/auth.js';
import { resolveSecretaryPhoto } from '../lib/secretary-media.js';

function invalid(message) { throw new EndpointError(message, { code: 'INVALID_BROADCAST' }); }
function https(value) {
  if (typeof value !== 'string' || value.length > 2048 || !/^https:\/\/[^/\s@]+(?:\/[^\s]*)?$/i.test(value)) invalid('Use a valid HTTPS link without credentials.');
  return value;
}

export function validateBroadcast(input) {
  const target = String(input.target || '').trim();
  if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(target) && !/^-[1-9][0-9]{0,15}$/.test(target)) invalid('Enter a group/channel @username or negative chat ID.');
  if (target.startsWith('-') && !Number.isSafeInteger(Number(target))) invalid('Invalid chat ID.');
  const mediaType = String(input.mediaType || 'none');
  if (!['none', 'photo', 'video'].includes(mediaType)) invalid('Choose Text Only, Photo, or Video.');
  const message = String(input.message || '').trim();
  if (mediaType === 'none' && !message) invalid('A message is required for text-only broadcasts.');
  if (message.length > (mediaType === 'none' ? 4096 : 1024)) invalid('Use up to 4096 characters for text or 1024 for an optional media caption.');
  const media = mediaType === 'none' ? '' : String(input.media || '').trim();
  if (mediaType !== 'none' && !(mediaType === 'photo' && /^tgmedia:[A-Za-z0-9_-]{8,64}$/.test(media))) https(media);
  if (!Array.isArray(input.buttons) || input.buttons.length > 12) invalid('Use up to 12 inline buttons.');
  const buttons = input.buttons.map(button => {
    const text = String(button?.text || '').trim();
    const row = Number(button?.row);
    if (!text || text.length > 64 || !Number.isInteger(row) || row < 1 || row > 6) invalid('Each button needs a label (up to 64 characters) and row 1–6.');
    return { text, url: https(String(button?.url || '').trim()), row };
  });
  for (let row = 1; row <= 6; row++) if (buttons.filter(button => button.row === row).length > 2) invalid('Use at most two buttons per row.');
  return { target, message, mediaType, media, buttons };
}

async function ensureHistory() {
  const exists = () => db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='secretary_broadcasts'");
  if (await exists()) return;
  try {
    await db.run(`CREATE TABLE IF NOT EXISTS secretary_broadcasts (
      staff_id TEXT NOT NULL, request_key TEXT NOT NULL, payload TEXT NOT NULL,
      target TEXT NOT NULL, status TEXT NOT NULL, message_id INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(staff_id, request_key))`);
  } catch (error) { if (!await exists()) throw error; }
}

export default async function (input, ctx) {
  const staff = await requireAdmin(ctx);
  await ensureHistory();
  const staffId = String(staff.id);
  if (input?.action === 'list') return { broadcasts: await db.all(
    `SELECT request_key AS requestKey, target, status, message_id AS messageId,
      created_at AS createdAt FROM secretary_broadcasts WHERE staff_id=:staff
      ORDER BY created_at DESC, request_key DESC LIMIT 20`, { ':staff': staffId }) };
  const key = String(input?.operationKey || '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) invalid('A valid broadcast request key is required.');
  const params = { ':staff': staffId, ':key': key };
  const read = () => db.get(`SELECT status, payload, target, message_id AS messageId
    FROM secretary_broadcasts WHERE staff_id=:staff AND request_key=:key`, params);
  if (input?.action === 'status') return await read() || { status: 'not_found' };
  if (input?.action !== 'send') invalid('Unsupported broadcast action.');
  const request = validateBroadcast(input);
  const payload = JSON.stringify(request);
  const existing = await read();
  if (existing) {
    if (existing.payload !== payload) invalid('This request key belongs to a different broadcast.');
    return existing;
  }
  // All validation and media preparation precede the durable one-time send claim.
  let chat;
  try { chat = await api.getChat({ chat_id: request.target }); }
  catch { invalid('Cannot access this group/channel. Add the bot and grant permission to post.'); }
  if (!['group', 'supergroup', 'channel'].includes(chat?.type)) invalid('Broadcasts can only be sent to groups or channels.');
  const media = request.mediaType === 'photo' ? await resolveSecretaryPhoto(request.media) : request.media;
  const claimed = await db.run(`INSERT INTO secretary_broadcasts
    (staff_id, request_key, payload, target, status, created_at, updated_at)
    VALUES (:staff,:key,:payload,:target,'sending',unixepoch(),unixepoch())
    ON CONFLICT(staff_id,request_key) DO NOTHING RETURNING request_key`,
  { ...params, ':payload': payload, ':target': String(chat.id) });
  if (!claimed?.rows?.length) {
    const winner = await read();
    if (winner?.payload !== payload) invalid('This request key belongs to a different broadcast.');
    return winner;
  }
  const keyboard = [];
  for (let row = 1; row <= 6; row++) {
    const buttons = request.buttons.filter(button => button.row === row).map(({ text, url }) => ({ text, url }));
    if (buttons.length) keyboard.push(buttons);
  }
  const common = { chat_id: chat.id, ...(keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {}) };
  try {
    const sent = request.mediaType === 'photo'
      ? await api.sendPhoto({ ...common, photo: media, ...(request.message ? { caption: request.message } : {}) })
      : request.mediaType === 'video'
        ? await api.sendVideo({ ...common, video: media, ...(request.message ? { caption: request.message } : {}) })
        : await api.sendMessage({ ...common, text: request.message });
    if (!Number.isSafeInteger(sent?.message_id) || sent.message_id <= 0) throw new Error('Missing Telegram confirmation');
    await db.run(`UPDATE secretary_broadcasts SET status='sent',message_id=:message,
      updated_at=unixepoch() WHERE staff_id=:staff AND request_key=:key AND status='sending'`,
    { ...params, ':message': sent.message_id });
    return { status: 'sent', messageId: sent.message_id, target: String(chat.id) };
  } catch {
    // Telegram sends have no idempotency key. Never automatically resend an uncertain result.
    await db.run(`UPDATE secretary_broadcasts SET status='uncertain',updated_at=unixepoch()
      WHERE staff_id=:staff AND request_key=:key AND status='sending'`, params);
    return { status: 'uncertain', target: String(chat.id) };
  }
}
