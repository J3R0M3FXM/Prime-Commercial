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
const edits = [], deletions = [];
let editError = '', deleteError = '';
api.editMessageText = async input => { edits.push({ type: 'text', ...input }); if (editError) throw Error(editError); return { message_id: input.message_id }; };
api.editMessageCaption = async input => { edits.push({ type: 'caption', ...input }); if (editError) throw Error(editError); return { message_id: input.message_id }; };
api.deleteMessage = async input => { deletions.push(input); if (deleteError) throw Error(deleteError); return true; };
const requireAdmin = async ctx => { if (![111, 222].includes(ctx?.id)) throw new EndpointError('Denied', { code: 'ADMIN_REQUIRED' }); return ctx; };
const resolveSecretaryPhoto = async value => { if (value === 'tgmedia:missing123') throw Error('Missing photo'); return value.startsWith('tgmedia:') ? { uploaded: value } : value; };
const source = readFileSync('tgcloud/endpoints/sendSecretaryBroadcast.js', 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace('export function', 'function').replace(/export default async function\s*\(/, 'async function handler(');
const handler = new Function('api', 'db', 'EndpointError', 'requireAdmin', 'resolveSecretaryPhoto', source + '\nreturn handler;')(api, db, EndpointError, requireAdmin, resolveSecretaryPhoto);
const request = { action: 'send', operationKey: 'a'.repeat(32), target: '@prime_channel', message: 'Keep My Casing', mediaType: 'none', buttons: [{ text: 'Shop Now', url: 'https://example.com/shop', row: 1 }, { text: 'Support', url: 'https://example.com/support', row: 1 }] };
await assert.rejects(handler(request, {}), { code: 'ADMIN_REQUIRED' });
for (const patch of [{ target: '111' }, { message: '' }, { message: '   ' }, { message: 'x'.repeat(4097) }, { buttons: [{ text: 'Bad', url: 'javascript:alert(1)', row: 1 }] }, { buttons: Array(3).fill(request.buttons[0]) }, { operationKey: 'x'.repeat(129) }]) {
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
failSend = false;
await handler({ ...photo, operationKey: 'f'.repeat(32), message: '' }, { id: 111 });
assert.equal(sent.at(-1).type, 'photo');
assert.equal('caption' in sent.at(-1), false, 'Photo can be sent without a caption');
await handler({ ...video, operationKey: 'g'.repeat(32), message: '   ' }, { id: 111 });
assert.equal(sent.at(-1).type, 'video');
assert.equal('caption' in sent.at(-1), false, 'Blank video caption is omitted');
await handler({ ...video, operationKey: 'h'.repeat(32), message: 'x'.repeat(1024) }, { id: 111 });
assert.equal(sent.at(-1).caption.length, 1024);
const detail = await handler({ action: 'detail', operationKey: request.operationKey }, { id: 111 });
assert.equal(detail.draft.message, request.message); assert.equal(detail.canDelete, true);
assert.equal(detail.draft.media, undefined, 'Post editor never receives old signed media links');
for (const action of ['detail', 'edit', 'delete']) await assert.rejects(handler({ action, operationKey: request.operationKey, revision: 0 }, { id: 222 }), { code: 'INVALID_BROADCAST' });
await assert.rejects(handler({ action: 'delete', operationKey: uncertain.operationKey, revision: 0 }, { id: 111 }), { code: 'INVALID_BROADCAST' });
const edit = { action: 'edit', operationKey: request.operationKey, revision: 0, message: 'Updated pRiMe', buttons: [] };
await assert.rejects(handler({ ...edit, message: '' }, { id: 111 }), { code: 'INVALID_BROADCAST' });
const competing = await Promise.allSettled([handler(edit, { id: 111 }), handler(edit, { id: 111 })]);
assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
assert.equal(edits.length, 1, 'Concurrent edits share a durable claim');
assert.equal(edits[0].chat_id, '-100123'); assert.equal(edits[0].message_id, 1);
assert.deepEqual(edits[0].reply_markup.inline_keyboard, [], 'Removing all buttons clears the keyboard');
await assert.rejects(handler(edit, { id: 111 }), { code: 'INVALID_BROADCAST' });
assert.equal((await handler({ action: 'detail', operationKey: request.operationKey }, { id: 111 })).draft.message, 'Updated pRiMe');
assert.equal((await handler(request, { id: 111 })).status, 'sent', 'Original send identity remains valid after editing');
assert.equal(sent.length, 7, 'Post management never sends another message');
await handler({ ...edit, operationKey: photo.operationKey, message: '', buttons: request.buttons }, { id: 111 });
assert.equal(edits.at(-1).type, 'caption'); assert.equal(edits.at(-1).caption, '');
assert.equal(edits.at(-1).reply_markup.inline_keyboard[0].length, 2);
editError = 'Transport interrupted';
const videoEdit = { ...edit, operationKey: video.operationKey, message: 'Saved change' };
assert.equal((await handler(videoEdit, { id: 111 })).status, 'edit_uncertain');
await assert.rejects(handler({ ...videoEdit, message: 'Different change' }, { id: 111 }), { code: 'INVALID_BROADCAST' });
await assert.rejects(handler({ action: 'delete', operationKey: video.operationKey, revision: 0 }, { id: 111 }), { code: 'INVALID_BROADCAST' });
editError = 'Bad Request: message is not modified';
assert.equal((await handler({ action: 'retry_edit', operationKey: video.operationKey, revision: 0, message: 'Ignored tampering' }, { id: 111 })).status, 'sent');
assert.equal(edits.at(-1).caption, 'Saved change', 'Recovery retries only the saved edit');
editError = '';
const remove = { action: 'delete', operationKey: request.operationKey, revision: 1, target: '-100999', messageId: 999 };
deleteError = 'Network interrupted';
assert.equal((await handler(remove, { id: 111 })).status, 'delete_uncertain');
deleteError = 'Bad Request: message to delete not found';
assert.equal((await handler(remove, { id: 111 })).status, 'deleted');
assert.deepEqual(deletions.at(-1), { chat_id: '-100123', message_id: 1 }, 'Client cannot redirect edits or deletions');
const deleteCount = deletions.length;
assert.equal((await handler(remove, { id: 111 })).status, 'deleted');
assert.equal(deletions.length, deleteCount, 'Deleted post retries do not call Telegram');
assert.equal((await handler({ action: 'list' }, { id: 111 })).broadcasts.find(row => row.requestKey === request.operationKey).postState, 'deleted');
sqlite.prepare('UPDATE secretary_broadcasts SET created_at=unixepoch()-172801 WHERE request_key=?').run(photo.operationKey);
assert.equal((await handler({ action: 'detail', operationKey: photo.operationKey }, { id: 111 })).canDelete, false);
await assert.rejects(handler({ action: 'delete', operationKey: photo.operationKey, revision: 1 }, { id: 111 }), /48 hours/);
assert.equal(sent.length, 7);
sqlite.close();
console.log('PASS: staff-scoped send/edit/delete, text and media captions/buttons, concurrent claims, stale revision rejection, original-send idempotency, saved-change recovery, deletion cutoff and no duplicate messages.');
