import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sqlite = new DatabaseSync(':memory:');
const db = {
  async get(sql, params = {}) { return sqlite.prepare(sql).get(params); },
  async all(sql, params = {}) { return sqlite.prepare(sql).all(params); },
  async run(sql, params = {}) {
    const query = sqlite.prepare(sql);
    if (/RETURNING/i.test(sql)) { const rows = query.all(params); return { rows, rowsAffected: rows.length }; }
    return { rowsAffected: Number(query.run(params).changes) };
  },
};
class EndpointError extends Error { constructor(message, options) { super(message); this.code = options?.code; } }
let chatType = 'channel'; let failSend = false;
const sent = [];
const send = type => async input => { sent.push({ type, ...input }); if (failSend) throw Error('Lost response'); return { message_id: sent.length }; };
const api = { getChat: async () => ({ id: -100123, type: chatType }), sendPhoto: send('photo'), sendVideo: send('video'), sendMessage: send('text') };
const requireAdmin = async ctx => { if (![111, 222].includes(ctx?.id)) throw new EndpointError('Denied', { code: 'ADMIN_REQUIRED' }); return ctx; };
const resolveSecretaryPhoto = async value => { if (value === 'tgmedia:missing123') throw Error('Missing photo'); return value.startsWith('tgmedia:') ? { uploaded: value } : value; };
const source = readFileSync('tgcloud/endpoints/sendSecretaryBroadcast.js', 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace('export function', 'function').replace(/export default async function\s*\(/, 'async function handler(');
const handler = new Function('api', 'db', 'EndpointError', 'requireAdmin', 'resolveSecretaryPhoto', source + '\nreturn handler;')(api, db, EndpointError, requireAdmin, resolveSecretaryPhoto);
const request = { action: 'send', operationKey: 'a'.repeat(32), target: '@prime_channel', message: 'Keep My Casing', mediaType: 'none', buttons: [{ text: 'Shop Now', url: 'https://example.com/shop', row: 1 }, { text: 'Support', url: 'https://example.com/support', row: 1 }] };
await assert.rejects(handler(request, {}), { code: 'ADMIN_REQUIRED' });
for (const patch of [{ target: '111' }, { message: '' }, { message: 'x'.repeat(4097) }, { buttons: [{ text: 'Bad', url: 'javascript:alert(1)', row: 1 }] }, { buttons: Array(3).fill(request.buttons[0]) }, { operationKey: 'x'.repeat(129) }]) {
  await assert.rejects(handler({ ...request, ...patch }, { id: 111 }), { code: 'INVALID_BROADCAST' });
}
chatType = 'private'; await assert.rejects(handler(request, { id: 111 }), { code: 'INVALID_BROADCAST' }); chatType = 'channel';
await Promise.all([handler(request, { id: 111 }), handler(request, { id: 111 })]);
assert.equal(sent.length, 1, 'Concurrent sends share one durable claim');
assert.equal(sent[0].chat_id, -100123); assert.equal(sent[0].text, request.message);
assert.deepEqual(sent[0].reply_markup.inline_keyboard, [request.buttons.map(({ text, url }) => ({ text, url }))]);
assert.equal((await handler(request, { id: 111 })).status, 'sent'); assert.equal(sent.length, 1);
await assert.rejects(handler({ ...request, message: 'Changed' }, { id: 111 }), { code: 'INVALID_BROADCAST' });
assert.equal((await handler({ action: 'list' }, { id: 222 })).broadcasts.length, 0);
assert.equal((await handler({ action: 'status', operationKey: request.operationKey }, { id: 222 })).status, 'not_found');
const photo = { ...request, operationKey: 'b'.repeat(32), mediaType: 'photo', media: 'tgmedia:fixture123' };
await handler(photo, { id: 111 }); assert.equal(sent[1].type, 'photo'); assert.deepEqual(sent[1].photo, { uploaded: photo.media }); assert.equal(sent[1].caption, request.message);
await assert.rejects(handler({ ...photo, operationKey: 'z'.repeat(32), media: 'tgmedia:missing123' }, { id: 111 }), /Missing photo/);
assert.equal((await handler({ action: 'status', operationKey: 'z'.repeat(32) }, { id: 111 })).status, 'not_found', 'Preparation errors occur before claiming send');
const video = { ...request, operationKey: 'c'.repeat(32), mediaType: 'video', media: 'https://example.com/video.mp4' };
chatType = 'supergroup'; await handler(video, { id: 111 }); assert.equal(sent[2].type, 'video');
await assert.rejects(handler({ ...video, operationKey: 'd'.repeat(32), message: 'x'.repeat(1025) }, { id: 111 }), { code: 'INVALID_BROADCAST' });
failSend = true;
const uncertain = { ...request, operationKey: 'e'.repeat(32) };
assert.equal((await handler(uncertain, { id: 111 })).status, 'uncertain');
assert.equal((await handler(uncertain, { id: 111 })).status, 'uncertain');
assert.equal(sent.length, 4, 'Lost Telegram responses are never automatically resent');
assert.equal((await handler({ action: 'list' }, { id: 111 })).broadcasts.length, 4);
sqlite.close();
console.log('PASS: staff-only group/channel broadcasts, photo/video/text with inline rows, input bounds, account isolation, concurrent one-time sends and uncertain-delivery protection.');
