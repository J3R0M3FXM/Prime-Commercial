import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from './dist/worker.mjs';

const objects = new Map();
const bucket = {
  async get(key, options) {
    const value = objects.get(key);
    if (!value) return null;
    if (options?.range?.get('Range')) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(options.range.get('Range'));
      if (!match) throw new Error('Invalid test range');
      const offset = Number(match[1]);
      const end = match[2] ? Number(match[2]) : value.length - 1;
      const bytes = value.slice(offset, end + 1);
      return { size: value.length, range: { offset, length: bytes.length }, body: bytes, json: async () => JSON.parse(value.toString()) };
    }
    return { size: value.length, body: value, json: async () => JSON.parse(value.toString()) };
  },
  async head(key) { const value = objects.get(key); return value ? { size: value.length } : null; },
  async put(key, value) { objects.set(key, Buffer.from(value instanceof ReadableStream ? await new Response(value).arrayBuffer() : value)); },
  async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); },
  async list({ prefix }) { return { objects: [...objects.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })), truncated: false }; },
  async createMultipartUpload(key) { return { uploadId: 'test-upload', key }; },
  resumeMultipartUpload(key) { return { async complete() { objects.set(key, Buffer.alloc(1024, 1)); }, async abort() {} }; },
};
const env = { MEDIA_BUCKET: bucket, TELEGRAM_BOT_TOKEN: 'test:bot-token', ADMIN_TELEGRAM_IDS: '123', ALLOWED_ORIGINS: 'https://app.example', STREAM_SIGNING_KEY: 'test-signing-key', CLOUDFLARE_ACCOUNT_ID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', R2_ACCESS_KEY_ID: 'test-access', R2_SECRET_ACCESS_KEY: 'test-secret' };
function initData(id, age = 0) {
  const fields = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000) - age), query_id: 'AAE', user: JSON.stringify({ id }) });
  const check = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(env.TELEGRAM_BOT_TOKEN).digest();
  fields.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return fields.toString();
}
async function call(path, { method = 'GET', id = 123, origin = 'https://app.example', body, init = initData(id), range } = {}) {
  const response = await worker.fetch(new Request('https://worker.example' + path, { method, headers: { Origin: origin, 'X-Telegram-Init-Data': init, ...(range ? { Range: range } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body) }), env);
  return response;
}
const missing = await call('/uploads/start', { method: 'POST', init: '', body: { fileSize: 1024, contentType: 'video/mp4' } });
assert.equal(missing.status, 403);
assert.equal((await call('/uploads/start', { method: 'POST', id: 456, body: { fileSize: 1024, contentType: 'video/mp4' } })).status, 403);
assert.equal((await call('/uploads/start', { method: 'POST', init: initData(123, 90000), body: { fileSize: 1024, contentType: 'video/mp4' } })).status, 403);
assert.equal((await call('/uploads/start', { method: 'POST', origin: 'https://evil.example', body: { fileSize: 1024, contentType: 'video/mp4' } })).status, 403);
const start = await (await call('/uploads/start', { method: 'POST', body: { fileSize: 1024, contentType: 'video/mp4' } })).json();
assert.match(start.id, /^[a-f0-9]{32}$/);
const signed = await (await call(`/uploads/${start.id}/part`, { method: 'POST', body: { partNumber: 1 } })).json();
assert.match(signed.url, /X-Amz-Signature=/);
assert.match(signed.url, /partNumber=1/);
assert.equal((await call(`/uploads/${start.id}/part`, { method: 'POST', id: 456, body: { partNumber: 1 } })).status, 403);
const completed = await call(`/uploads/${start.id}/complete`, { method: 'POST', body: { title: 'Uploaded', category: 'Tutorials', parts: [{ partNumber: 1, etag: 'a'.repeat(32) }] } });
assert.equal(completed.status, 200);
assert.equal((await completed.json()).video.isPublished, false);
assert.equal((await call(`/uploads/${start.id}/part`, { method: 'POST', body: { partNumber: 1 } })).status, 404);
const id = 'b'.repeat(32);
await bucket.put(`catalog/${id}.json`, JSON.stringify({ id, title: 'Draft', isPublished: false, createdAt: new Date().toISOString() }));
await bucket.put(`videos/${id}/source.mp4`, Buffer.alloc(1024, 1));
assert.deepEqual(await (await call('/videos', { id: 456 })).json(), []);
assert.equal((await call(`/videos/${id}/grant`, { method: 'POST', id: 456 })).status, 404);
const published = await call(`/videos/${id}`, { method: 'PATCH', body: { isPublished: true } });
assert.equal(published.status, 200);
const grant = await (await call(`/videos/${id}/grant`, { method: 'POST', id: 456 })).json();
assert.match(grant.url, /\/stream\//);
const streamPath = new URL(grant.url).pathname + new URL(grant.url).search;
const ranged = await call(streamPath, { id: 456, range: 'bytes=100-199' });
assert.equal(ranged.status, 206);
assert.equal(ranged.headers.get('Content-Range'), 'bytes 100-199/1024');
assert.equal((await ranged.arrayBuffer()).byteLength, 100);
assert.equal(ranged.headers.get('Access-Control-Allow-Origin'), 'https://app.example', 'Offline fetch and range playback need readable CORS responses');
assert.match(ranged.headers.get('Access-Control-Expose-Headers'), /Content-Range/);
assert.equal((await call(streamPath, { id: 456, range: 'bytes=99999-' })).status,416);
assert.equal((await call('/health',{id:456})).status,403);
assert.equal((await (await call('/health')).json()).connected,true);
const metadata = await call(`/videos/${id}`,{method:'PATCH',body:{categories:['Tutorials','Product Demos','tutorials'],thumbnailUrl:'tgmedia:img-test1234'}});
assert.deepEqual((await metadata.json()).video.categories,['Tutorials','Product Demos']);
assert.equal((await call(`/videos/${id}`,{method:'PATCH',body:{categories:['x'.repeat(81)]}})).status,400);
assert.equal((await call(`/uploads/${start.id}/complete`,{method:'POST',body:{}})).status,200,'Completion retry must return the saved video');
await call(`/videos/${id}`,{method:'PATCH',body:{isPublished:false}});
assert.equal((await call(streamPath,{id:456})).status,404,'Unpublish must revoke previously issued playback URLs');
assert.equal((await call(`/stream/${id}?token=bad`, { id: 456 })).status, 403);
console.log('R2 Worker auth, signing, privacy and range checks passed.');

async function uploadAsset(id, bytes, type, name, owner = 123) {
  return worker.fetch(new Request(`https://worker.example/assets/${id}?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { Origin: 'https://app.example', 'X-Telegram-Init-Data': initData(owner), 'Content-Type': type, 'Content-Length': String(bytes.length) }, body: bytes }), env);
}
const imageId='c'.repeat(32), documentId='d'.repeat(32);
assert.equal((await call('/assets', {id:456})).status,403);
assert.equal((await uploadAsset(imageId,Buffer.from('image'),'image/png','Logo.png',456)).status,403);
const assetUpload=await uploadAsset(imageId,Buffer.from('image'),'image/png','Logo.png');
assert.equal(assetUpload.status,200);assert.equal((await assetUpload.json()).asset.isPublic,true);
assert.equal((await uploadAsset(imageId,Buffer.from('image'),'image/png','Logo.png')).status,200,'Retry returns the same asset');
assert.equal((await uploadAsset(imageId,Buffer.from('different'),'image/png','Logo.png')).status,409,'Existing file cannot be overwritten');
assert.equal((await call(`/assets/${imageId}/content`,{init:''})).status,200,'Reusable image URLs do not expire');
assert.equal((await (await call('/assets')).json()).assets.length,1);
const privateUpload=await uploadAsset(documentId,Buffer.from('<script>alert(1)</script>'),'text/html','Test.html');
assert.equal((await privateUpload.json()).asset.isPublic,false);
assert.equal((await call(`/assets/${documentId}/content`,{id:456})).status,404);
assert.equal((await call(`/assets/${documentId}/grant`,{method:'POST',id:456})).status,403);
const access=await (await call(`/assets/${documentId}/grant`,{method:'POST'})).json();
const accessPath=new URL(access.url).pathname+new URL(access.url).search;
const download=await call(accessPath,{init:''});
assert.equal(download.status,200);assert.match(download.headers.get('Content-Disposition'),/^attachment/);
assert.equal(download.headers.get('X-Content-Type-Options'),'nosniff');
assert.equal((await call(accessPath,{init:'',range:'bytes=0-5'})).status,206);
assert.equal((await call(`/assets/${documentId}/content?token=bad`,{init:''})).status,404);
assert.equal((await uploadAsset('e'.repeat(32),Buffer.alloc(0),'text/plain','Empty')).status,400);
console.log('PASS: reusable R2 files, admin-only uploads/list/grants, private attachments, persistent image URLs, range reads and retry conflicts.');
