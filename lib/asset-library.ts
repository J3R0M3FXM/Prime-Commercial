'use client';
import { callServerless } from '@/lib/telegram-serverless-client';

export type LibraryAsset = { id: string; name: string; contentType: string; size: number; isPublic: boolean; createdAt: string; storageType: 'r2' | 'telegram'; reference: string };
// Permanent content URLs are safe for saved product/logo references.
export const ASSET_ORIGIN = String(import.meta.env?.VITE_R2_MEDIA_ORIGIN || 'https://prime-media-gateway.pages.dev').trim().replace(/\/$/, '');
const publicImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
export function isReusableImageReference(value = ''): boolean {
  return /^tgmedia:[A-Za-z0-9_-]{8,80}$/.test(value) || value.startsWith(ASSET_ORIGIN + '/assets/') && /^\/assets\/[a-f0-9]{32}\/content$/.test(value.slice(ASSET_ORIGIN.length));
}
export function isReusableImage(asset: LibraryAsset): boolean { return asset.isPublic && publicImageTypes.has(asset.contentType) && isReusableImageReference(asset.reference); }
function telegramHeaders(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) throw new Error('Open PRIME from Telegram to use Assets.');
  return { 'X-Telegram-Init-Data': initData };
}
async function request<T>(path: string, method = 'GET'): Promise<T> {
  const response = await fetch(ASSET_ORIGIN + path, { method, headers: telegramHeaders(), cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || 'Asset storage is unavailable.'));
  return result as T;
}
export async function listLibraryAssets(): Promise<{ assets: LibraryAsset[]; warning: string }> {
  const results = await Promise.allSettled([
    (async () => {
      const rows: LibraryAsset[] = []; let cursor = '';
      do {
        const page = await request<{ assets: LibraryAsset[]; cursor: string | null }>('/assets' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (!Array.isArray(page.assets)) throw new Error('The R2 asset list could not be read.');
        rows.push(...page.assets.map(asset => ({ ...asset, storageType: 'r2' as const, reference: `${ASSET_ORIGIN}/assets/${asset.id}/content` })));
        cursor = page.cursor || '';
      } while (cursor);
      return rows;
    })(),
    callServerless<any[]>('manageMediaAssets', { action: 'list' }, 30_000).then(rows => {
      if (!Array.isArray(rows)) throw new Error('The Telegram asset list could not be read.');
      const buckets = new Set(['product-images', 'courier-logos', 'payment-method-logos', 'payment-qr-codes', 'media-gallery']);
      return rows.filter(row => row.visibility === 'public' && !row.orderId && buckets.has(row.bucket)).map(row => ({ id: String(row.id), name: String(row.path || row.id), contentType: String(row.contentType), size: Number(row.size) || 0, isPublic: true, createdAt: String(row.createdAt || ''), storageType: 'telegram' as const, reference: 'tgmedia:' + row.id }));
    }),
  ]);
  if (results.every(result => result.status === 'rejected')) throw new Error('Assets could not be loaded. Refresh to reconnect.');
  const assets = results.flatMap(result => result.status === 'fulfilled' ? result.value : []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const warning = results.map((result, index) => result.status === 'rejected' ? `${index === 0 ? 'R2' : 'Telegram'} library unavailable: ${result.reason?.message || 'connection failed'}` : '').filter(Boolean).join(' · ');
  return { assets, warning };
}
const uploadIds = new WeakMap<File, string>();
export async function uploadLibraryAsset(file: File, onProgress: (percent: number) => void): Promise<LibraryAsset> {
  if (!file.size || file.size > 90 * 1024 * 1024) throw new Error('Choose a file up to 90 MiB.');
  const id = uploadIds.get(file) || crypto.randomUUID().replaceAll('-', ''); uploadIds.set(file, id);
  const url = `${ASSET_ORIGIN}/assets/${id}?name=${encodeURIComponent(file.name)}`;
  const headers = telegramHeaders();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url); xhr.timeout = 180_000;
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onerror = () => reject(new Error('Upload connection failed. Keep the file selected and retry.'));
    xhr.ontimeout = () => reject(new Error('Upload timed out. Keep the file selected and retry.'));
    xhr.onload = () => {
      let result: any; try { result = JSON.parse(xhr.responseText); } catch { reject(new Error('Upload response could not be read.')); return; }
      if (xhr.status < 200 || xhr.status >= 300 || !result.asset?.id) { reject(new Error(result.error || 'The upload was not confirmed.')); return; }
      resolve({ ...result.asset, storageType: 'r2', reference: `${ASSET_ORIGIN}/assets/${result.asset.id}/content` });
    };
    xhr.send(file);
  });
}
export async function assetAccessUrl(asset: LibraryAsset): Promise<string> {
  if (asset.storageType === 'telegram') {
    const { resolveTelegramMedia } = await import('@/lib/telegram-serverless-client');
    return resolveTelegramMedia(asset.reference);
  }
  if (asset.isPublic) return asset.reference;
  const result = await request<{ url: string }>(`/assets/${asset.id}/grant`, 'POST');
  if (!result.url?.startsWith(`${ASSET_ORIGIN}/assets/${asset.id}/content?token=`)) throw new Error('Invalid file link.');
  return result.url;
}
