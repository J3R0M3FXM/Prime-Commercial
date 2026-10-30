import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { mediaAssetContents, mediaAssets } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

function decodeBase64Url(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  if (!value || value.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const output = new Uint8Array(Math.floor(value.length * 3 / 4));
  let buffer = 0; let bits = 0; let offset = 0;
  for (const character of value) {
    const digit = alphabet.indexOf(character); if (digit < 0) return null;
    buffer = (buffer << 6) | digit; bits += 6;
    if (bits >= 8) { bits -= 8; output[offset++] = (buffer >> bits) & 0xff; buffer &= (1 << bits) - 1; }
  }
  if (bits && buffer !== 0) return null;
  return output.subarray(0, offset);
}

/** Staff-uploaded payment logos and QR images. Arbitrary URLs are never accepted. */
export default async function (input, ctx) {
  await requireAdmin(ctx);
  const id = String(input?.id || '').trim();
  const bucket = input?.bucket;
  if (!/^img-[a-zA-Z0-9_-]{8,64}$/.test(id)) throw new EndpointError('Invalid image upload ID.', { code: 'INVALID_INPUT' });
  if (!['payment-method-logos', 'payment-qr-codes'].includes(bucket)) throw new EndpointError('Unsupported payment image type.', { code: 'INVALID_BUCKET' });
  if (!['image/jpeg', 'image/png'].includes(input?.contentType)) throw new EndpointError('Choose a JPG, PNG, or WEBP image.', { code: 'INVALID_IMAGE_TYPE' });
  const encoded = typeof input?.data === 'string' ? input.data : '';
  if (!encoded || encoded.length > 820_000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new EndpointError('The image data arrived incomplete or is too large. Choose it again.', { code: 'INVALID_IMAGE_ENCODING' });
  const bytes = decodeBase64Url(encoded);
  const jpeg = bytes?.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes?.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (!bytes || bytes.length < 4 || bytes.length > 600_000 || (!jpeg && !png)) throw new EndpointError('The uploaded content is not a supported JPEG or PNG image.', { code: 'INVALID_IMAGE' });
  const existing = await db.select({ id: mediaAssets.id }).from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  const content = await db.select({ id: mediaAssetContents.id }).from(mediaAssetContents).where(eq(mediaAssetContents.id, id)).get();
  if (existing || content) throw new EndpointError('This image upload ID already exists. Choose the image again.', { code: 'MEDIA_CONFLICT' });
  const now = new Date();
  await db.insert(mediaAssetContents).values({ id, bytes, createdAt: now }).run();
  try {
    const contentType = png ? 'image/png' : 'image/jpeg';
    await db.insert(mediaAssets).values({ id, bucket, path: id + (png ? '.png' : '.jpg'), fileId: 'inline:' + id, contentType, size: bytes.length, sha256: '', visibility: 'public', orderId: null, createdAt: now, updatedAt: now }).run();
  } catch (error) {
    await db.delete(mediaAssetContents).where(eq(mediaAssetContents.id, id)).run();
    throw error;
  }
  return { success: true, reference: 'tgmedia:' + id };
}
