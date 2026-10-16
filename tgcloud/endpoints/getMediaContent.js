import { api, db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers, mediaAssets, orders } from '../schema.js';
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
  if (!id) throw new EndpointError('Media asset ID is required.', { code: 'INVALID_INPUT' });
  const asset = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  if (!asset) throw new EndpointError('Media not found.', { code: 'NOT_FOUND' });

  if (asset.visibility !== 'public' && !(await canReadPrivateAsset(asset, ctx))) {
    // Do not reveal whether a private asset exists to unauthorized callers.
    throw new EndpointError('Media not found.', { code: 'NOT_FOUND' });
  }
  if (Number(asset.size) > 20 * 1024 * 1024) {
    throw new EndpointError('This media file exceeds the supported inline transfer size.', { code: 'MEDIA_TOO_LARGE' });
  }

  const content = await api.getFileContent(asset.fileId);
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
