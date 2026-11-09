import { api, db, EndpointError, InputFile } from 'sdk';
import { requireAdmin } from '../lib/auth.js';

const CHUNK_SIZE = 256 * 1024;
const MAX_SIZE = 8 * 1024 * 1024;
const fail = (message, code = 'VOUCHER_UPLOAD_INVALID') => { throw new EndpointError(message, { code }); };

function decode(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (typeof value !== 'string' || !value || value.length > 350000 || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) fail('Invalid voucher image part.');
  const bytes = new Uint8Array(Math.floor(value.length * 3 / 4));
  let bits = 0, buffer = 0, offset = 0;
  for (const character of value) {
    buffer = (buffer << 6) | alphabet.indexOf(character); bits += 6;
    if (bits >= 8) { bits -= 8; bytes[offset++] = (buffer >> bits) & 255; buffer &= (1 << bits) - 1; }
  }
  if (bits && buffer) fail('Invalid voucher image encoding.');
  return bytes.subarray(0, offset);
}

export default async function (input, ctx) {
  const staff = await requireAdmin(ctx);
  const owner = String(staff.id);
  const uploadId = String(input?.uploadId || '');
  if (!/^[a-f0-9]{32}$/.test(uploadId)) fail('Invalid voucher upload ID.');
  await db.run(`CREATE TABLE IF NOT EXISTS voucher_export_sessions (
    id TEXT PRIMARY KEY, owner TEXT NOT NULL, filename TEXT NOT NULL, file_size INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'uploading', message_id INTEGER, expires_at INTEGER NOT NULL)`);
  await db.run(`CREATE TABLE IF NOT EXISTS voucher_export_parts (
    upload_id TEXT NOT NULL, part_index INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(upload_id,part_index))`);
  await db.run(`DELETE FROM voucher_export_parts WHERE upload_id IN (SELECT id FROM voucher_export_sessions WHERE expires_at<=unixepoch())`);
  await db.run(`DELETE FROM voucher_export_sessions WHERE expires_at<=unixepoch()`);
  const action = String(input?.action || '');
  if (action === 'start') {
    const size = Number(input.fileSize), count = Number(input.chunkCount);
    const filename = String(input.fileName || '').trim();
    if (!Number.isSafeInteger(size) || size < 8 || size > MAX_SIZE || count !== Math.ceil(size / CHUNK_SIZE) || !/^PRIME-Voucher-[A-Za-z0-9_-]{1,80}\.png$/.test(filename)) fail('Invalid voucher image.');
    const inserted = await db.run(`INSERT INTO voucher_export_sessions (id,owner,filename,file_size,chunk_count,expires_at)
      VALUES (:id,:owner,:filename,:size,:count,unixepoch()+3600) ON CONFLICT(id) DO NOTHING RETURNING id`,
      { ':id': uploadId, ':owner': owner, ':filename': filename, ':size': size, ':count': count });
    if (!Number(inserted?.rowsAffected)) fail('This voucher upload ID is already in use.');
    return { success: true };
  }
  const session = await db.get(`SELECT * FROM voucher_export_sessions WHERE id=:id AND owner=:owner`, { ':id': uploadId, ':owner': owner });
  if (!session || Number(session.expires_at) <= Math.floor(Date.now() / 1000)) fail('The voucher upload expired. Please try again.');
  if (action === 'cancel') {
    if (session.status !== 'uploading') fail('Check your Telegram chat before trying again.', 'VOUCHER_DELIVERY_UNCERTAIN');
    await db.run(`DELETE FROM voucher_export_parts WHERE upload_id=:id`, { ':id': uploadId });
    await db.run(`DELETE FROM voucher_export_sessions WHERE id=:id AND owner=:owner AND status='uploading'`, { ':id': uploadId, ':owner': owner });
    return { success: true };
  }
  if (action === 'chunk') {
    const index = Number(input.index);
    if (session.status !== 'uploading' || !Number.isInteger(index) || index < 0 || index >= Number(session.chunk_count)) fail('Invalid voucher image part.');
    const bytes = decode(input.data);
    if (bytes.length !== Math.min(CHUNK_SIZE, Number(session.file_size) - index * CHUNK_SIZE)) fail('Voucher image part size does not match.');
    await db.run(`INSERT INTO voucher_export_parts (upload_id,part_index,data) VALUES (:id,:index,:data)
      ON CONFLICT(upload_id,part_index) DO UPDATE SET data=excluded.data`, { ':id': uploadId, ':index': index, ':data': input.data });
    return { success: true };
  }
  if (action !== 'send') fail('Unsupported voucher delivery action.');
  if (session.status === 'complete') return { success: true, messageId: session.message_id };
  if (session.status !== 'uploading') fail('Check your Telegram chat before trying again.', 'VOUCHER_DELIVERY_UNCERTAIN');
  const parts = await db.all(`SELECT part_index,data FROM voucher_export_parts WHERE upload_id=:id ORDER BY part_index`, { ':id': uploadId });
  if (parts.length !== Number(session.chunk_count)) fail('Some voucher image parts are missing.');
  const bytes = new Uint8Array(Number(session.file_size));
  parts.forEach((part, index) => {
    if (Number(part.part_index) !== index) fail('Some voucher image parts are missing.');
    bytes.set(decode(part.data), index * CHUNK_SIZE);
  });
  if (![137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) fail('The voucher image is not a PNG.');
  const claimed = await db.run(`UPDATE voucher_export_sessions SET status='sending' WHERE id=:id AND owner=:owner AND status='uploading' RETURNING id`, { ':id': uploadId, ':owner': owner });
  if (!Number(claimed?.rowsAffected)) fail('Voucher delivery is already in progress.', 'VOUCHER_DELIVERY_UNCERTAIN');
  try {
    const message = await api.sendDocument({ chat_id: owner, document: new InputFile(bytes, session.filename, { type: 'image/png' }), caption: 'Your PRIME voucher. Save or forward this file from Telegram.' });
    if (!message?.message_id) fail('Telegram did not confirm delivery.', 'VOUCHER_DELIVERY_UNCERTAIN');
    await db.run(`UPDATE voucher_export_sessions SET status='complete',message_id=:message WHERE id=:id AND owner=:owner`, { ':id': uploadId, ':owner': owner, ':message': message.message_id });
    await db.run(`DELETE FROM voucher_export_parts WHERE upload_id=:id`, { ':id': uploadId });
    return { success: true, messageId: message.message_id };
  } catch {
    await db.run(`UPDATE voucher_export_sessions SET status='uncertain' WHERE id=:id AND owner=:owner AND status='sending'`, { ':id': uploadId, ':owner': owner });
    await db.run(`DELETE FROM voucher_export_parts WHERE upload_id=:id`, { ':id': uploadId });
    fail('Telegram did not confirm delivery. Check your bot chat before retrying. If needed, open the PRIME bot and press Start.', 'VOUCHER_DELIVERY_UNCERTAIN');
  }
}
