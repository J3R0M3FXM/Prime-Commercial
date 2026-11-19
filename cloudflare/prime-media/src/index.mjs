import { AwsClient } from 'aws4fetch';
import { handleAssets } from './assets.mjs';
import { handleSmsBridge } from './sms-bridge.mjs';

const BUCKET = 'prime-media-preview';
const PART_SIZE = 10 * 1024 * 1024;
const MAX_SIZE = 150 * 1024 * 1024;
const encoder = new TextEncoder();

function categories(values) {
  if (!Array.isArray(values) || values.length > 12 || values.some(value => typeof value !== 'string' || !value.trim() || value.length > 80)) throw new Error('Invalid categories');
  const seen = new Set();
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true;
  });
}
function validThumbnail(value) { return !value || /^tgmedia:[A-Za-z0-9_-]{8,80}$/.test(value) || /^https:\/\/[^\s]+$/.test(value); }

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}
function fail(message, status = 400) { return json({ error: message }, status); }
function hex(bytes) { return [...bytes].map(x => x.toString(16).padStart(2, '0')).join(''); }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unbase64url(value) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), x => x.charCodeAt(0)); }
async function hmac(keyBytes, data) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function identity(request, env) {
  const initData = request.headers.get('X-Telegram-Init-Data') || '';
  if (!initData || initData.length > 4096 || !env.TELEGRAM_BOT_TOKEN) return null;
  const fields = new URLSearchParams(initData);
  const hash = fields.get('hash') || '';
  const authDate = Number(fields.get('auth_date'));
  if (!/^[a-f0-9]{64}$/i.test(hash) || !Number.isSafeInteger(authDate) || Math.abs(Date.now() / 1000 - authDate) > 86400) return null;
  fields.delete('hash');
  const check = [...fields.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(encoder.encode('WebAppData'), env.TELEGRAM_BOT_TOKEN);
  if (!equalBytes(await hmac(secret, check), Uint8Array.from(hash.match(/../g), x => parseInt(x, 16)))) return null;
  try {
    const user = JSON.parse(fields.get('user') || '{}');
    const id = String(user.id || '');
    return /^[0-9]{1,24}$/.test(id) ? id : null;
  } catch { return null; }
}
function isAdmin(id, env) {
  return Boolean(id && String(env.ADMIN_TELEGRAM_IDS || '').split(',').map(x => x.trim()).includes(id));
}
function videoKey(id) { return `videos/${id}/source.mp4`; }
function infoKey(id) { return `catalog/${id}.json`; }
function uploadKey(id) { return `uploads/${id}.json`; }
function validId(id) { return /^[a-f0-9]{32}$/.test(id); }
async function readJson(bucket, key) {
  const object = await bucket.get(key);
  return object ? await object.json() : null;
}
async function writeJson(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });
}
async function signPart(env, key, uploadId, partNumber) {
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID || '') || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) throw new Error('R2 signing secrets are missing.');
  const client = new AwsClient({ service: 's3', region: 'auto', accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY });
  const url = new URL(`https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET}/${key}`);
  url.searchParams.set('partNumber', String(partNumber));
  url.searchParams.set('uploadId', uploadId);
  url.searchParams.set('X-Amz-Expires', '300');
  const signed = await client.sign(new Request(url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' } }), { aws: { signQuery: true } });
  return signed.url.toString();
}
async function bearer(id, env, lifetime = 600) {
  const expiry = Math.floor(Date.now() / 1000) + lifetime;
  const data = `${id}.${expiry}`;
  const signature = base64url(await hmac(encoder.encode(env.STREAM_SIGNING_KEY), data));
  return `${data}.${signature}`;
}
async function validBearer(token, id, env) {
  const match = /^([a-f0-9]{32})\.([0-9]{10})\.([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!match || match[1] !== id || Number(match[2]) < Date.now() / 1000 || Number(match[2]) > Date.now() / 1000 + 7200) return false;
  return equalBytes(await hmac(encoder.encode(env.STREAM_SIGNING_KEY), `${match[1]}.${match[2]}`), unbase64url(match[3]));
}
async function handle(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).includes(origin);
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, Range', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges' } : {};
  if (request.method === 'OPTIONS') return allowed ? new Response(null, { status: 204, headers: cors }) : fail('Origin not allowed.', 403);
  const respond = (value, status = 200) => json(value, status, cors);
  if (origin && !allowed) return fail('Origin not allowed.', 403);
  if (!env.MEDIA_BUCKET || !env.STREAM_SIGNING_KEY) return respond({ error: 'Storage service is not configured.' }, 503);
  const userId = await identity(request, env);
  const admin = isAdmin(userId, env);

  const smsResponse = await handleSmsBridge(request, env, { url, admin, respond });
  if (smsResponse) return smsResponse;

  const assetResponse = await handleAssets(request, env, { url, admin, respond, cors, readJson, writeJson, bearer, validBearer });
  if (assetResponse) return assetResponse;

  if (url.pathname === '/health' && request.method === 'GET') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    await env.MEDIA_BUCKET.list({ prefix: 'catalog/', limit: 1 });
    return respond({ connected: true, storage: 'r2', multipart: Boolean(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.CLOUDFLARE_ACCOUNT_ID) });
  }

  if (url.pathname === '/videos' && request.method === 'GET') {
    const rows = [];
    let cursor;
    do {
      const page = await env.MEDIA_BUCKET.list({ prefix: 'catalog/', cursor });
      for (const object of page.objects) {
        const info = await readJson(env.MEDIA_BUCKET, object.key);
        if (info && (admin && url.searchParams.get('scope') === 'admin' || info.isPublished)) rows.push(info);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor && rows.length < 500);
    return respond(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }
  if (url.pathname === '/uploads/start' && request.method === 'POST') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    const body = await request.json();
    const size = Number(body.fileSize);
    if (!Number.isSafeInteger(size) || size < 12 || size > MAX_SIZE || body.contentType !== 'video/mp4') return respond({ error: 'Choose an MP4 up to 150 MiB.' }, 400);
    const id = hex(crypto.getRandomValues(new Uint8Array(16)));
    const key = videoKey(id);
    const upload = await env.MEDIA_BUCKET.createMultipartUpload(key, { httpMetadata: { contentType: 'video/mp4' } });
    await writeJson(env.MEDIA_BUCKET, uploadKey(id), { uploadId: upload.uploadId, owner: userId, size, createdAt: Date.now() });
    return respond({ id, partSize: PART_SIZE, partCount: Math.ceil(size / PART_SIZE) });
  }
  const part = /^\/uploads\/([a-f0-9]{32})\/part$/.exec(url.pathname);
  if (part && request.method === 'POST') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    const session = await readJson(env.MEDIA_BUCKET, uploadKey(part[1]));
    if (!session || session.owner !== userId || Date.now() - session.createdAt > 86400000) return respond({ error: 'Upload session expired.' }, 404);
    const body = await request.json();
    const number = Number(body.partNumber);
    if (!Number.isInteger(number) || number < 1 || number > Math.ceil(session.size / PART_SIZE)) return respond({ error: 'Invalid part number.' }, 400);
    return respond({ url: await signPart(env, videoKey(part[1]), session.uploadId, number) });
  }
  const complete = /^\/uploads\/([a-f0-9]{32})\/complete$/.exec(url.pathname);
  if (complete && request.method === 'POST') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    const id = complete[1];
    const session = await readJson(env.MEDIA_BUCKET, uploadKey(id));
    if (!session) {
      const completed = await readJson(env.MEDIA_BUCKET, infoKey(id));
      if (completed) return respond({ video: completed });
      return respond({ error: 'Upload session not found.' }, 404);
    }
    if (session.owner !== userId || Date.now() - session.createdAt > 86400000) return respond({ error: 'Upload session not found.' }, 404);
    const body = await request.json();
    if (!String(body.title || '').trim()) return respond({ error: 'Title is required.' }, 400);
    let categoryList;
    try { categoryList = categories(body.categories || [body.category || 'Uncategorized']); }
    catch { return respond({ error: 'Choose up to 12 categories, each 80 characters or less.' }, 400); }
    if (!categoryList.length) return respond({ error: 'At least one category is required.' }, 400);
    if (!validThumbnail(String(body.thumbnailUrl || ''))) return respond({ error: 'Invalid thumbnail reference.' }, 400);
    const expected = Math.ceil(session.size / PART_SIZE);
    if (!Array.isArray(body.parts) || body.parts.length !== expected || body.parts.some((p, i) => p.partNumber !== i + 1 || !/^"?[a-f0-9-]{16,80}"?$/i.test(p.etag))) return respond({ error: 'Incomplete upload parts.' }, 400);
    const upload = env.MEDIA_BUCKET.resumeMultipartUpload(videoKey(id), session.uploadId);
    await upload.complete(body.parts.map(p => ({ partNumber: p.partNumber, etag: p.etag.replace(/^"|"$/g, '') })));
    const object = await env.MEDIA_BUCKET.head(videoKey(id));
    if (!object || object.size !== session.size) return respond({ error: 'Stored file size verification failed.' }, 500);
    const info = { id, title: String(body.title || '').trim().slice(0, 180), description: String(body.description || '').trim().slice(0, 4000), category: String(body.category || 'Product Demos').trim().slice(0, 80), tags: Array.isArray(body.tags) ? body.tags.slice(0, 20).map(x => String(x).slice(0, 40)) : [], thumbnailUrl: String(body.thumbnailUrl || '').slice(0, 1000), fileSize: object.size, isPublished: false, featured: Boolean(body.featured), createdAt: new Date().toISOString() };
    info.categories = categoryList; info.category = info.categories[0] || 'Uncategorized';
    info.duration = Math.max(0, Math.min(86400, Math.round(Number(body.duration) || 0)));
    info.width = Math.max(1, Math.round(Number(body.width) || 1920));
    info.height = Math.max(1, Math.round(Number(body.height) || 1080));
    if (!validThumbnail(info.thumbnailUrl)) return respond({ error: 'Invalid thumbnail reference.' }, 400);
    await writeJson(env.MEDIA_BUCKET, infoKey(id), info);
    await env.MEDIA_BUCKET.delete(uploadKey(id));
    return respond({ video: info });
  }
  const abort = /^\/uploads\/([a-f0-9]{32})$/.exec(url.pathname);
  if (abort && request.method === 'DELETE') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    const session = await readJson(env.MEDIA_BUCKET, uploadKey(abort[1]));
    if (!session || session.owner !== userId) return respond({ error: 'Upload session not found.' }, 404);
    await env.MEDIA_BUCKET.resumeMultipartUpload(videoKey(abort[1]), session.uploadId).abort();
    await env.MEDIA_BUCKET.delete(uploadKey(abort[1]));
    return respond({ success: true });
  }
  const video = /^\/videos\/([a-f0-9]{32})$/.exec(url.pathname);
  if (video && request.method === 'PATCH') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    const info = await readJson(env.MEDIA_BUCKET, infoKey(video[1]));
    if (!info) return respond({ error: 'Video not found.' }, 404);
    const body = await request.json();
    for (const key of ['title', 'description', 'category', 'thumbnailUrl']) if (typeof body[key] === 'string') info[key] = body[key].trim().slice(0, key === 'description' ? 4000 : 1000);
    for (const key of ['isPublished', 'featured']) if (typeof body[key] === 'boolean') info[key] = body[key];
    if (Array.isArray(body.tags)) info.tags = body.tags.slice(0, 20).map(x => String(x).slice(0, 40));
    if (body.categories !== undefined) {
      try { info.categories = categories(body.categories); }
      catch { return respond({ error: 'Invalid categories.' }, 400); }
      if (!info.categories.length) return respond({ error: 'At least one category is required.' }, 400);
      info.category = info.categories[0];
    }
    if (!validThumbnail(info.thumbnailUrl)) return respond({ error: 'Invalid thumbnail reference.' }, 400);
    if (!info.title) return respond({ error: 'Title is required.' }, 400);
    await writeJson(env.MEDIA_BUCKET, infoKey(video[1]), info);
    return respond({ video: info });
  }
  if (video && request.method === 'DELETE') {
    if (!admin) return respond({ error: 'Admin access required.' }, 403);
    await env.MEDIA_BUCKET.delete([infoKey(video[1]), videoKey(video[1])]);
    return respond({ success: true });
  }
  const grant = /^\/videos\/([a-f0-9]{32})\/grant$/.exec(url.pathname);
  if (grant && request.method === 'POST') {
    if (!userId) return respond({ error: 'Telegram access required.' }, 401);
    const info = await readJson(env.MEDIA_BUCKET, infoKey(grant[1]));
    if (!info || !info.isPublished && !admin) return respond({ error: 'Video not found.' }, 404);
    const lifetime = Math.min(7200, Math.max(600, (Number(info.duration) || 0) + 300));
    return respond({ url: `${url.origin}/stream/${grant[1]}?token=${encodeURIComponent(await bearer(grant[1], env, lifetime))}`, expiresIn: lifetime });
  }
  const stream = /^\/stream\/([a-f0-9]{32})$/.exec(url.pathname);
  if (stream && (request.method === 'GET' || request.method === 'HEAD')) {
    if (!await validBearer(url.searchParams.get('token'), stream[1], env)) return respond({ error: 'Video link expired.' }, 403);
    const info = await readJson(env.MEDIA_BUCKET, infoKey(stream[1]));
    if (!info || !info.isPublished) return respond({ error: 'Video not found.' }, 404);
    const head = await env.MEDIA_BUCKET.head(videoKey(stream[1]));
    if (!head) return respond({ error: 'Video not found.' }, 404);
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const start = rangeMatch?.[1] ? Number(rangeMatch[1]) : 0;
      const end = rangeMatch?.[2] ? Number(rangeMatch[2]) : head.size - 1;
      if (!rangeMatch || (!rangeMatch[1] && !rangeMatch[2]) || start >= head.size || (rangeMatch[1] && end < start))
        return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${head.size}` } });
    }
    const object = await env.MEDIA_BUCKET.get(videoKey(stream[1]), { range: request.headers });
    if (!object) return fail('Video not found.', 404);
    const headers = new Headers({ ...cors, 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' });
    const range = object.range;
    if (range) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set('Content-Length', String(range ? range.length : object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
  }
  return respond({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) { console.error('Prime media worker error', error); return fail('Storage request failed.', 500); }
  },
};
