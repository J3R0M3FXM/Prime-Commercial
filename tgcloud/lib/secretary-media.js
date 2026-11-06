import { db, InputFile } from 'sdk';
import { eq } from 'sdk/db';
import { mediaAssetContents, mediaAssets } from '../schema.js';

const FLOW_MEDIA_MARKER = '__secretary_step_media__';

export function secretaryFlowMedia(flow) {
  const inline = Array.isArray(flow?.buttons)
    ? flow.buttons.find((button) => button?.id === FLOW_MEDIA_MARKER)?.mediaUrl
    : '';
  return String(flow?.mediaUrl || inline || '').trim();
}

export async function resolveSecretaryPhoto(reference) {
  const value = String(reference || '').trim();
  if (!value.startsWith('tgmedia:')) return value;
  const id = value.slice('tgmedia:'.length);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error('Secretary photo reference is invalid.');
  const asset = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).get();
  if (!asset || asset.bucket !== 'media-gallery' || asset.visibility !== 'public' || !/^image\/(jpeg|png|webp)$/.test(String(asset.contentType || ''))) {
    throw new Error('The uploaded Secretary photo is unavailable. Upload it again.');
  }
  const content = await db.select().from(mediaAssetContents).where(eq(mediaAssetContents.id, id)).get();
  const stored = content?.bytes;
  let bytes = null;
  if (stored instanceof Uint8Array) bytes = stored;
  else if (stored instanceof ArrayBuffer) bytes = new Uint8Array(stored);
  else if (stored && stored.data instanceof Uint8Array) bytes = stored.data;
  if (!bytes || !bytes.length || bytes.length > 900_000 || (Number(asset.size) > 0 && bytes.length !== Number(asset.size))) {
    throw new Error('The uploaded Secretary photo is unreadable. Upload it again.');
  }
  const extension = asset.contentType === 'image/png' ? 'png' : asset.contentType === 'image/webp' ? 'webp' : 'jpg';
  return new InputFile(bytes, `${id}.${extension}`, { type: asset.contentType });
}

export function flowButtons(flow) {
  return (Array.isArray(flow?.buttons) ? flow.buttons : [])
    .filter((button) => button?.id !== FLOW_MEDIA_MARKER);
}

export function validateFlowButtons(buttons) {
  if (!Array.isArray(buttons)) throw new Error('buttons must be an array.');
  const media = buttons.find((button) => button?.id === FLOW_MEDIA_MARKER);
  const reference = String(media?.mediaUrl || '').trim();
  if (reference.length > 2048 || /[\u0000-\u0020]/.test(reference)) {
    throw new Error('Secretary photo reference is invalid or too long.');
  }
  if (/^https?:/i.test(reference)) {
    if (!/^https:\/\/[^/\s]+(?:\/.*)?$/i.test(reference) || /^https:\/\/[^/]*@/i.test(reference)) {
      throw new Error('Secretary photo URLs must use HTTPS and cannot contain credentials.');
    }
  }
  return buttons;
}
