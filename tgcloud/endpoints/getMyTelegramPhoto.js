import { api, db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { customers } from '../schema.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < bytes.length ? ALPHABET[c & 63] : '=');
  }
  return result;
}

async function asBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (content?.data instanceof Uint8Array) return content.data;
  if (typeof content?.arrayBuffer === 'function') return new Uint8Array(await content.arrayBuffer());
  throw new Error('Unsupported Telegram photo content');
}

export default async function (input = {}, ctx) {
  const user = ctx?.initData?.user;
  const telegramId = user?.id == null ? '' : String(user.id);
  if (!/^[0-9]{1,24}$/.test(telegramId)) throw new EndpointError('A verified Telegram user is required.', { code: 'AUTH_REQUIRED' });
  const customer = await db.select({ id: customers.id }).from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) throw new EndpointError('Your PRIME account could not be found.', { code: 'ACCOUNT_NOT_FOUND' });

  // Mini App init data is verified by Serverless. It is a fallback if the bot
  // cannot see a photo because of Telegram privacy settings.
  const initPhoto = String(user.photo_url || '').trim();
  const fallbackPhotoUrl = /^https:\/\//i.test(initPhoto) ? initPhoto : '';
  try {
    const result = await api.getUserProfilePhotos({ user_id: Number(telegramId), offset: 0, limit: 1 });
    const sizes = result?.photos?.[0] || result?.result?.photos?.[0] || [];
    const photo = Array.isArray(sizes) ? sizes.find(size => Number(size.width) >= 160) || sizes[0] : null;
    const fileId = String(photo?.file_id || photo?.fileId || '');
    const uniqueId = String(photo?.file_unique_id || photo?.fileUniqueId || fileId);
    if (!fileId) return { photoUrl: fallbackPhotoUrl, photoKey: fallbackPhotoUrl ? 'init:' + fallbackPhotoUrl : '', source: fallbackPhotoUrl ? 'initData' : 'none' };
    if (String(input?.knownPhotoKey || '') === uniqueId) return { unchanged: true, photoKey: uniqueId };
    const bytes = await asBytes(await api.getFileContent(fileId));
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('Telegram profile photo is too large');
    const contentType = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg';
    return { photoUrl: `data:${contentType};base64,${base64(bytes)}`, photoKey: uniqueId, source: 'botApi' };
  } catch (error) {
    // Keep Account usable when Telegram's photo API is unavailable. The client
    // retries while visible; never expose a bot token or raw file URL.
    return { photoUrl: fallbackPhotoUrl, photoKey: fallbackPhotoUrl ? 'init:' + fallbackPhotoUrl : '', source: fallbackPhotoUrl ? 'initData' : 'none' };
  }
}
