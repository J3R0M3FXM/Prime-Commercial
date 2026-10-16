import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { mediaAssets } from '../schema.js';

const BUCKETS = ['product-images', 'receipt-proofs', 'media-gallery'];

export function parseStorageReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return null;
  const value = reference.trim();
  const directId = value.startsWith('tgmedia:') ? value.slice('tgmedia:'.length).trim() : '';
  if (directId) return { id: directId };

  for (const bucket of BUCKETS) {
    const marker = '/' + bucket + '/';
    const index = value.indexOf(marker);
    if (index >= 0) {
      let path = value.slice(index + marker.length).split('?')[0];
      try { path = decodeURIComponent(path); } catch {}
      if (path && !path.startsWith('/') && !path.split('/').includes('..')) return { bucket, path };
    }
    const prefix = bucket + '/';
    if (value.startsWith(prefix)) {
      let path = value.slice(prefix.length).split('?')[0];
      try { path = decodeURIComponent(path); } catch {}
      if (path && !path.startsWith('/') && !path.split('/').includes('..')) return { bucket, path };
    }
  }
  return null;
}

export async function findMediaAsset(reference) {
  const parsed = parseStorageReference(reference);
  if (!parsed) return null;
  if (parsed.id) return await db.select().from(mediaAssets).where(eq(mediaAssets.id, parsed.id)).get();
  return await db.select().from(mediaAssets).where(and(
    eq(mediaAssets.bucket, parsed.bucket),
    eq(mediaAssets.path, parsed.path),
  )).get();
}

export async function publicMediaReference(reference) {
  if (typeof reference !== 'string' || !reference.trim()) return '';
  const value = reference.trim();
  const asset = await findMediaAsset(value);
  if (asset) return asset.visibility === 'public' ? 'tgmedia:' + asset.id : '';
  if (value.includes('/storage/v1/object/')) return '';
  return value;
}
