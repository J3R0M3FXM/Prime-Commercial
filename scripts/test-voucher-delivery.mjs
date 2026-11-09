import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
const db = {
  async run(sql, params = {}) { const statement = database.prepare(sql); if (/\bRETURNING\b/i.test(sql)) { const rows = statement.all(params); return { rows, rowsAffected: rows.length }; } return { rowsAffected: Number(statement.run(params).changes) }; },
  async get(sql, params = {}) { return database.prepare(sql).get(params); },
  async all(sql, params = {}) { return database.prepare(sql).all(params); },
};
class EndpointError extends Error { constructor(message, options) { super(message); this.code = options?.code; } }
class InputFile { constructor(bytes, name, options) { this.bytes = bytes; this.name = name; this.options = options; } }
const sent = []; let failSend = false;
const api = { async sendDocument(input) { sent.push(input); if (failSend) throw Error('Simulated uncertain response'); return { message_id: 42 }; } };
const requireAdmin = async ctx => { if (![111,222].includes(ctx?.initData?.user?.id)) throw new EndpointError('Admin required', { code: 'ADMIN_REQUIRED' }); return ctx.initData.user; };
const source = readFileSync('tgcloud/endpoints/sendVoucherToTelegram.js', 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace(/export default async function\s*\(/, 'async function handler(');
const handler = new Function('api','db','EndpointError','InputFile','requireAdmin',source + '\nreturn handler;')(api,db,EndpointError,InputFile,requireAdmin);
const context = id => ({ initData: { user: { id } } });
const bytes = new Uint8Array(256 * 1024 + 17); bytes.set([137,80,78,71,13,10,26,10]); bytes[bytes.length - 1] = 123;
const part = chunk => Buffer.from(chunk).toString('base64url');
const uploadId = 'a'.repeat(32);
const start = { action:'start', uploadId, fileName:'PRIME-Voucher-TEST.png', fileSize:bytes.length, chunkCount:2 };
await assert.rejects(handler(start, context(333)), error => error.code === 'ADMIN_REQUIRED');
await handler(start, context(111));
await assert.rejects(handler({action:'chunk',uploadId,index:0,data:part(bytes.subarray(0,256*1024))}, context(222)), /expired/);
await assert.rejects(handler({action:'chunk',uploadId,index:0,data:'AA'}, context(111)), /size/);
await handler({action:'chunk',uploadId,index:0,data:part(bytes.subarray(0,256*1024))}, context(111));
await assert.rejects(handler({action:'send',uploadId}, context(111)), /missing/);
await handler({action:'chunk',uploadId,index:1,data:part(bytes.subarray(256*1024))}, context(111));
assert.deepEqual(await handler({action:'send',uploadId,chatId:'222'}, context(111)), { success:true,messageId:42 });
assert.equal(sent.length,1); assert.equal(sent[0].chat_id,'111','The recipient comes only from authenticated staff identity');
assert.equal(sent[0].document.name,'PRIME-Voucher-TEST.png'); assert.deepEqual(sent[0].document.bytes,bytes);
assert.equal((await handler({action:'send',uploadId}, context(111))).messageId,42);
assert.equal(sent.length,1,'A completed retry must not send a duplicate');
assert.equal(database.prepare('SELECT count(*) AS n FROM voucher_export_parts').get().n,0,'Image parts are removed after delivery');
const invalidId = 'c'.repeat(32);
await handler({action:'start',uploadId:invalidId,fileName:'PRIME-Voucher-TEST.png',fileSize:8,chunkCount:1}, context(111));
await handler({action:'chunk',uploadId:invalidId,index:0,data:part(new Uint8Array(8))}, context(111));
await assert.rejects(handler({action:'send',uploadId:invalidId}, context(111)), /not a PNG/);
assert.equal(sent.length,1,'Invalid file contents never reach Telegram');
const second = 'b'.repeat(32); const small = bytes.subarray(0,32);
await handler({action:'start',uploadId:second,fileName:'PRIME-Voucher-TEST.png',fileSize:small.length,chunkCount:1}, context(111));
await handler({action:'chunk',uploadId:second,index:0,data:part(small)}, context(111));
failSend = true;
await assert.rejects(handler({action:'send',uploadId:second}, context(111)), error => error.code === 'VOUCHER_DELIVERY_UNCERTAIN');
await assert.rejects(handler({action:'send',uploadId:second}, context(111)), error => error.code === 'VOUCHER_DELIVERY_UNCERTAIN');
assert.equal(sent.length,2,'An uncertain response is not automatically sent again');
database.close();
console.log('PASS: staff-owned PNG chunks, exact Telegram document, retry safety and uncertain delivery handling.');
