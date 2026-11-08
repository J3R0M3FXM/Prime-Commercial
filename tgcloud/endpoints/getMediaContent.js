import { api, db, EndpointError } from 'sdk';
import { and, eq } from 'sdk/db';
import { customers, mediaAssetContents, mediaAssets, orders, videos } from '../schema.js';
import { isAdminUser } from '../lib/auth.js';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes) {
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;
    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;
    output += BASE64[a >> 2];
    output += BASE64[((a & 3) << 4) | (b >> 4)];
    output += hasB ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    output += hasC ? BASE64[c & 63] : '=';
  }
  return output;
}

async function asBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content && content.data instanceof Uint8Array) return content.data;
  if (content && typeof content.arrayBuffer === 'function') return new Uint8Array(await content.arrayBuffer());
  throw new EndpointError('Unsupported media response from Telegram.', { code: 'MEDIA_READ_FAILED' });
}

async function canReadPrivateAsset(asset, ctx) {
  if (await isAdminUser(ctx)) return true;
  const userId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(userId) || !asset.orderId) return false;

  const order = await db.select().from(orders).where(eq(orders.id, asset.orderId)).get();
  if (!order) return false;
  if (String(order.tgUserId || '') === userId) return true;

  const customer = await db.select({
    id: customers.id,
    primeMemberId: customers.primeMemberId,
  }).from(customers).where(eq(customers.tgUserId, userId)).get();
  return Boolean(customer && (
    String(order.customerId || '') === String(customer.id) ||
    (customer.primeMemberId && String(order.primeMemberId || '') === String(customer.primeMemberId))
  ));
}

export default async function (input, ctx) {
  const id = String(input?.id || '').trim();
  const videoId = String(input?.videoId || '').trim();
  if (!id && !videoId) throw new EndpointError('Media asset ID is required.', { code: 'INVALID_INPUT' });

  let asset;
  if (id) {
    asset = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  } else {
    const video = await db.select().from(videos)
      .where(and(eq(videos.id, videoId), eq(videos.isPublished, true))).get();
    if (video?.telegramFileId) {
      asset = {
        id: video.id,
        fileId: video.telegramFileId,
        contentType: 'video/mp4',
        size: Number(video.fileSize) || 0,
        sha256: null,
        visibility: 'public',
        orderId: null,
      };
    }
  }
  if (!asset) throw new EndpointError('Media not found.', { code: 'NOT_FOUND' });

  if (asset.visibility !== 'public' && !(await canReadPrivateAsset(asset, ctx))) {
    // Do not reveal whether a private asset exists to unauthorized callers.
    throw new EndpointError('Media not found.', { code: 'NOT_FOUND' });
  }
  if (Number(asset.size) > 20 * 1024 * 1024) {
    throw new EndpointError('This media file exceeds the supported inline transfer size.', { code: 'MEDIA_TOO_LARGE' });
  }

  if (videoId) {
    const userId = String(ctx?.initData?.user?.id || '');
    if (!/^\d+$/.test(userId)) throw new EndpointError('Telegram access required.', { code: 'AUTH_REQUIRED' });
    const chunkSize = 512 * 1024;
    const index = Number(input?.chunkIndex ?? 0);
    if (!Number.isInteger(index) || index < 0 || index >= 40) throw new EndpointError('Invalid stream part.', { code: 'INVALID_INPUT' });
    // Short-lived server-side transfer cache avoids re-downloading the complete
    // Telegram file for every bridge-sized part. Publication is checked above
    // on every request, including cached reads.
    await db.run(`CREATE TABLE IF NOT EXISTS media_video_transfer_cache (id TEXT PRIMARY KEY, file_id TEXT NOT NULL, bytes BLOB NOT NULL, expires_at INTEGER NOT NULL)`);
    await db.run(`DELETE FROM media_video_transfer_cache WHERE expires_at<=unixepoch()`);
    let cached = await db.get(`SELECT length(bytes) AS size, substr(bytes,:offset,:length) AS bytes
      FROM media_video_transfer_cache WHERE id=:id AND file_id=:file_id AND expires_at>unixepoch()`,
    { ':id': asset.id, ':file_id': asset.fileId, ':offset': index * chunkSize + 1, ':length': chunkSize });
    if (!cached) {
      const source = await asBytes(await api.getFileContent(asset.fileId));
      if (source.length > 20 * 1024 * 1024 || (Number(asset.size) > 0 && source.length !== Number(asset.size)))
        throw new EndpointError('Media size verification failed.', { code: 'MEDIA_SIZE_MISMATCH' });
      await db.run(`INSERT INTO media_video_transfer_cache VALUES (:id,:file_id,:bytes,unixepoch()+180)
        ON CONFLICT(id) DO UPDATE SET file_id=excluded.file_id,bytes=excluded.bytes,expires_at=excluded.expires_at`,
      { ':id': asset.id, ':file_id': asset.fileId, ':bytes': source });
      cached = { size: source.length, bytes: source.subarray(index * chunkSize, (index + 1) * chunkSize) };
    }
    const count = Math.ceil(Number(cached.size) / chunkSize);
    if (index >= count) throw new EndpointError('Invalid stream part.', { code: 'INVALID_INPUT' });
    return { id: asset.id, contentType: 'video/mp4', size: Number(cached.size), chunkIndex: index, chunkCount: count, base64: encodeBase64(await asBytes(cached.bytes)) };
  }

  const stored = await db.select().from(mediaAssetContents).where(eq(mediaAssetContents.id, asset.id)).get();
  let content = stored?.bytes || null;
  if (!content && String(asset.fileId || '').startsWith('inline:')) {
    const inlineId = String(asset.fileId).slice('inline:'.length);
    if (inlineId !== String(asset.id)) throw new EndpointError('Media reference is invalid.', { code: 'MEDIA_READ_FAILED' });
    throw new EndpointError('Media content is unavailable.', { code: 'MEDIA_READ_FAILED' });
  }
  if (!content) content = await api.getFileContent(asset.fileId);
  const bytes = await asBytes(content);
  if (bytes.length > 20 * 1024 * 1024 || (Number(asset.size) > 0 && bytes.length !== Number(asset.size))) {
    throw new EndpointError('Media size verification failed.', { code: 'MEDIA_SIZE_MISMATCH' });
  }

  return {
    id: asset.id,
    contentType: asset.contentType || 'application/octet-stream',
    size: bytes.length,
    sha256: asset.sha256,
    base64: encodeBase64(bytes),
  };
}
