import { db, EndpointError } from 'sdk';
import { asc, eq } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { mediaAssetContents, mediaAssets } from '../schema.js';

const allowedBuckets = new Set([
  'product-images', 'receipt-proofs', 'media-gallery', 'courier-logos',
  'payment-method-logos', 'payment-qr-codes',
]);

function decodeBase64Url(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const output = new Uint8Array(Math.floor(value.length * 3 / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    buffer = (buffer << 6) | digit;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  if (bits && buffer !== 0) return null;
  return output.subarray(0, offset);
}

function imageExtension(bytes, contentType) {
  const jpeg = contentType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = contentType === 'image/png' && bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!jpeg && !png) throw new EndpointError('The uploaded content does not match its image type.', { code: 'INVALID_IMAGE' });
  return png ? 'png' : 'jpg';
}

async function uploadPublicImage(input) {
  const id = String(input?.id || '').trim();
  const bucket = input?.action === 'uploadProductImage' ? 'product-images' : String(input?.bucket || '').trim();
  const contentType = String(input?.contentType || '');
  const encoded = typeof input?.data === 'string' ? input.data : '';
  if (!/^img-[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new EndpointError('Invalid image upload ID.', { code: 'INVALID_INPUT' });
  if (!['product-images', 'media-gallery', 'courier-logos', 'payment-method-logos', 'payment-qr-codes'].includes(bucket)) {
    throw new EndpointError('Choose a supported public image type.', { code: 'INVALID_MEDIA_BUCKET' });
  }
  if (!['image/jpeg', 'image/png'].includes(contentType)) throw new EndpointError('Upload a JPEG or PNG image.', { code: 'INVALID_IMAGE_TYPE' });
  if (!encoded || encoded.length > 1_250_000) throw new EndpointError('Choose a smaller image and try again.', { code: 'IMAGE_TOO_LARGE' });
  const bytes = decodeBase64Url(encoded);
  if (!bytes || !bytes.length || bytes.length > 900_000) throw new EndpointError('Choose an image under 900 KB.', { code: 'IMAGE_TOO_LARGE' });
  const extension = imageExtension(bytes, contentType);
  const existing = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  const existingContent = await db.select({ id: mediaAssetContents.id }).from(mediaAssetContents).where(eq(mediaAssetContents.id, id)).get();
  if (existing || existingContent) throw new EndpointError('This image upload ID already exists. Choose the image again.', { code: 'MEDIA_CONFLICT' });
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const now = new Date();
  await db.insert(mediaAssetContents).values({ id, bytes, createdAt: now }).run();
  try {
    await db.insert(mediaAssets).values({
      id, bucket, path: id + '.' + extension, fileId: 'inline:' + id,
      contentType, size: bytes.length, sha256, visibility: 'public', orderId: null,
      createdAt: now, updatedAt: now,
    }).run();
  } catch (error) {
    await db.delete(mediaAssetContents).where(eq(mediaAssetContents.id, id)).run();
    throw error;
  }
  return { success: true, id, bucket, reference: 'tgmedia:' + id, contentType, size: bytes.length };
}

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

  if (action === 'uploadPublicImage' || action === 'uploadProductImage') {
    return await uploadPublicImage(input);
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
