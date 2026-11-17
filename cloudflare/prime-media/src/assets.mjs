// Separate object prefixes keep reusable files independent of the video gallery.
const MAX_BYTES = 90 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const infoKey = id => `asset-catalog/${id}.json`;
const fileKey = id => `asset-files/${id}`;

export async function handleAssets(request, env, context) {
  const { url, admin, respond, cors, readJson, writeJson, bearer, validBearer } = context;
  if (!url.pathname.startsWith('/assets')) return null;
  const content = /^\/assets\/([a-f0-9]{32})\/content$/.exec(url.pathname);
  if (content && ['GET', 'HEAD'].includes(request.method)) {
    const info = await readJson(env.MEDIA_BUCKET, infoKey(content[1]));
    if (!info || (!info.isPublic && !admin && !await validBearer(url.searchParams.get('token'), content[1], env))) return respond({ error: 'File not found.' }, 404);
    const head = await env.MEDIA_BUCKET.head(fileKey(info.id));
    if (!head) return respond({ error: 'File not found.' }, 404);
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : head.size - 1;
      if (!match || (!match[1] && !match[2]) || start >= head.size || (match[1] && end < start)) return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${head.size}` } });
    }
    const object = await env.MEDIA_BUCKET.get(fileKey(info.id), { range: request.headers });
    if (!object) return respond({ error: 'File not found.' }, 404);
    const inline = IMAGE_TYPES.has(info.contentType) || info.contentType.startsWith('video/') || info.contentType.startsWith('audio/');
    const filename = encodeURIComponent(info.name).replace(/['()]/g, character => '%' + character.charCodeAt(0).toString(16));
    const headers = new Headers({ ...cors, 'Content-Type': info.contentType, 'Content-Disposition': `${inline && url.searchParams.get('download') !== '1' ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cache-Control': info.isPublic ? 'public, max-age=300' : 'private, no-store', 'Accept-Ranges': 'bytes', 'Content-Length': String(object.range ? object.range.length : object.size) });
    if (object.range) headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
    return new Response(request.method === 'HEAD' ? null : object.body, { status: object.range ? 206 : 200, headers });
  }
  if (!admin) return respond({ error: 'Admin access required.' }, 403);
  if (url.pathname === '/assets' && request.method === 'GET') {
    const page = await env.MEDIA_BUCKET.list({ prefix: 'asset-catalog/', limit: 100, cursor: url.searchParams.get('cursor') || undefined });
    const assets = [];
    for (const object of page.objects) {
      const info = await readJson(env.MEDIA_BUCKET, object.key);
      if (info) assets.push(info);
    }
    return respond({ assets, cursor: page.truncated ? page.cursor : null });
  }
  const file = /^\/assets\/([a-f0-9]{32})$/.exec(url.pathname);
  if (file && request.method === 'POST') {
    const name = String(url.searchParams.get('name') || '').trim();
    const contentType = String(request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    const size = Number(request.headers.get('Content-Length'));
    if (!name || name.length > 240 || /[\x00-\x1f\x7f]/.test(name)) return respond({ error: 'Choose a file with a valid name, up to 240 characters.' }, 400);
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(contentType)) return respond({ error: 'Invalid file type.' }, 400);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES || !request.body) return respond({ error: 'Choose a file up to 90 MiB with a known size.' }, 400);
    const existing = await readJson(env.MEDIA_BUCKET, infoKey(file[1]));
    if (existing) {
      if (existing.name !== name || existing.size !== size || existing.contentType !== contentType) return respond({ error: 'Upload ID already belongs to another file.' }, 409);
      return respond({ asset: existing });
    }
    // Stream straight into R2; never buffer an entire video in Worker memory.
    await env.MEDIA_BUCKET.put(fileKey(file[1]), request.body, { httpMetadata: { contentType } });
    const object = await env.MEDIA_BUCKET.head(fileKey(file[1]));
    if (!object || object.size !== size) {
      await env.MEDIA_BUCKET.delete(fileKey(file[1]));
      return respond({ error: 'Stored file size verification failed. Try uploading again.' }, 500);
    }
    const info = { id: file[1], name, contentType, size, isPublic: IMAGE_TYPES.has(contentType), createdAt: new Date().toISOString(), storageType: 'r2' };
    await writeJson(env.MEDIA_BUCKET, infoKey(info.id), info);
    return respond({ asset: info });
  }
  const grant = /^\/assets\/([a-f0-9]{32})\/grant$/.exec(url.pathname);
  if (grant && request.method === 'POST') {
    const info = await readJson(env.MEDIA_BUCKET, infoKey(grant[1]));
    if (!info) return respond({ error: 'File not found.' }, 404);
    return respond({ url: `${url.origin}/assets/${info.id}/content?token=${encodeURIComponent(await bearer(info.id, env))}` });
  }
  return respond({ error: 'Not found.' }, 404);
}
