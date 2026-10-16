import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { mediaAssets } from '../schema.js';

const allowedBuckets = new Set(['product-images', 'receipt-proofs', 'media-gallery']);

function normalizeAsset(input) {
  const bucket = String(input?.bucket || '');
  const path = String(input?.path || '').trim();
  const fileId = String(input?.fileId || '').trim();
  const contentType = String(input?.contentType || 'application/octet-stream').trim();
  const sha256 = String(input?.sha256 || '').trim().toLowerCase();
  const size = Number(input?.size);
  if (!allowedBuckets.has(bucket) || !path || path.startsWith('/') || path.split('/').includes('..')) {
    throw new EndpointError('Invalid media bucket or object path.', { code: 'INVALID_INPUT' });
  }
  if (!fileId || fileId.length > 2048) throw new EndpointError('A valid Telegram file ID is required.', { code: 'INVALID_INPUT' });
  if (!Number.isSafeInteger(size) || size < 0 || size > 50 * 1024 * 1024) {
    throw new EndpointError('Media size is outside the supported range.', { code: 'INVALID_INPUT' });
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new EndpointError('A SHA-256 checksum is required.', { code: 'INVALID_INPUT' });
  if (contentType.length > 255) throw new EndpointError('Invalid content type.', { code: 'INVALID_INPUT' });

  const requestedVisibility = input.visibility === 'public' ? 'public' : 'private';
  const visibility = bucket === 'product-images' ? 'public'
    : bucket === 'receipt-proofs' ? 'private'
      : requestedVisibility;

  const messageId = input.messageId == null ? null : Number(input.messageId);
  if (messageId !== null && !Number.isSafeInteger(messageId)) throw new EndpointError('messageId must be an integer.', { code: 'INVALID_INPUT' });

  return {
    bucket, path, fileId, messageId, contentType, size, sha256, visibility,
    orderId: input.orderId == null || input.orderId === '' ? null : String(input.orderId),
    updatedAt: new Date(),
  };
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'list') {
    return await db.select({
      id: mediaAssets.id,
      bucket: mediaAssets.bucket,
      path: mediaAssets.path,
      messageId: mediaAssets.messageId,
      contentType: mediaAssets.contentType,
      size: mediaAssets.size,
      sha256: mediaAssets.sha256,
      visibility: mediaAssets.visibility,
      orderId: mediaAssets.orderId,
      createdAt: mediaAssets.createdAt,
      updatedAt: mediaAssets.updatedAt,
    }).from(mediaAssets).orderBy(asc(mediaAssets.bucket), asc(mediaAssets.path)).all();
  }

  if (action === 'import') {
    if (!Array.isArray(input.assets) || input.assets.length < 1 || input.assets.length > 50) {
      throw new EndpointError('assets must contain between 1 and 50 media records.', { code: 'INVALID_INPUT' });
    }
    const rows = input.assets.map(normalizeAsset).map((asset) => ({
      ...asset,
      createdAt: new Date(),
    }));
    for (const row of rows) {
      const { createdAt, ...updates } = row;
      await db.insert(mediaAssets).values(row).onConflictDoUpdate({
        target: [mediaAssets.bucket, mediaAssets.path],
        set: { ...updates, updatedAt: new Date() },
      }).run();
    }
    return { success: true, imported: rows.length };
  }

  if (action === 'setVisibility') {
    const id = String(input.id || '').trim();
    const visibility = input.visibility === 'public' ? 'public' : 'private';
    if (!id) throw new EndpointError('Media asset ID is required.', { code: 'INVALID_INPUT' });
    const asset = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get();
    if (!asset) throw new EndpointError('Media asset not found.', { code: 'NOT_FOUND' });
    if (asset.bucket === 'receipt-proofs' && visibility === 'public') {
      throw new EndpointError('Receipt proofs cannot be made public.', { code: 'PRIVATE_MEDIA_REQUIRED' });
    }
    const [updated] = await db.update(mediaAssets).set({ visibility, updatedAt: new Date() })
      .where(eq(mediaAssets.id, id)).returning().run();
    return { success: true, id: updated.id, visibility: updated.visibility };
  }

  if (action === 'linkOrder') {
    const id = String(input.id || '').trim();
    const orderId = String(input.orderId || '').trim();
    if (!id || !orderId) throw new EndpointError('Media asset ID and order ID are required.', { code: 'INVALID_INPUT' });
    const [updated] = await db.update(mediaAssets).set({ orderId, updatedAt: new Date() })
      .where(eq(mediaAssets.id, id)).returning().run();
    if (!updated) throw new EndpointError('Media asset not found.', { code: 'NOT_FOUND' });
    return { success: true, id: updated.id, orderId: updated.orderId };
  }

  throw new EndpointError('Unsupported media asset action.', { code: 'INVALID_ACTION' });
}
