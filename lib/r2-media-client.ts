'use client';

export type R2Video = {
  id: string; title: string; description?: string; category: string; tags?: string[];
  thumbnailUrl?: string; fileSize: number; isPublished: boolean; featured: boolean;
  createdAt: string; storageType: 'r2';
};

const origin = String(import.meta.env.VITE_R2_MEDIA_ORIGIN || '').trim().replace(/\/$/, '');
const maxBytes = 150 * 1024 * 1024;
const uploadPrefix = 'prime_r2_upload_v1:';

export function r2MediaEnabled(): boolean { return /^https:\/\/[^/]+$/.test(origin); }
function initData(): string {
  const value = (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData || '';
  if (!value) throw new Error('Open PRIME from Telegram to use Cloudflare media.');
  return value;
}
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (!r2MediaEnabled()) throw new Error('Cloudflare media is not connected.');
  const response = await fetch(origin + path, {
    method,
    headers: { 'X-Telegram-Init-Data': initData(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result.error || 'Cloudflare media request failed.'));
  return result as T;
}
function asR2Video(value: Omit<R2Video, 'storageType'>): R2Video { return { ...value, storageType: 'r2' }; }
export async function listR2Videos(admin = false): Promise<R2Video[]> {
  const rows = await request<Omit<R2Video, 'storageType'>[]>(admin ? '/videos?scope=admin' : '/videos');
  return rows.map(asR2Video);
}
export async function grantR2Playback(id: string): Promise<string> {
  const result = await request<{ url: string }>(`/videos/${encodeURIComponent(id)}/grant`, 'POST');
  if (!result.url?.startsWith(origin + '/stream/')) throw new Error('Invalid video stream URL.');
  return result.url;
}
export async function updateR2Video(id: string, changes: Partial<R2Video>): Promise<R2Video> {
  const result = await request<{ video: Omit<R2Video, 'storageType'> }>(`/videos/${encodeURIComponent(id)}`, 'PATCH', changes);
  return asR2Video(result.video);
}
export async function deleteR2Video(id: string): Promise<void> {
  await request(`/videos/${encodeURIComponent(id)}`, 'DELETE');
}
export async function uploadR2Video(file: File, metadata: {
  title: string; description?: string; category?: string; tags?: string[]; thumbnailUrl?: string; featured?: boolean;
}, onProgress?: (completed: number, total: number) => void): Promise<R2Video> {
  if (!file.name.toLowerCase().endsWith('.mp4') || file.type && file.type !== 'video/mp4' || file.size < 12 || file.size > maxBytes) {
    throw new Error('Choose an MP4 up to 150 MiB.');
  }
  if (!metadata.title.trim()) throw new Error('Video title is required.');
  const marker = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (String.fromCharCode(...Array.from(marker.subarray(4, 8))) !== 'ftyp') throw new Error('The selected file is not a valid MP4.');
  const cacheKey = uploadPrefix + [file.name, file.size, file.lastModified].join(':');
  type State = { id: string; partSize: number; partCount: number; parts: Record<string, string> };
  let state: State | null = null;
  try { state = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch { /* Restart if storage is unavailable. */ }
  if (!state || !/^[a-f0-9]{32}$/.test(state.id) || state.partSize !== 10 * 1024 * 1024 || state.partCount !== Math.ceil(file.size / state.partSize)) {
    const started = await request<{ id: string; partSize: number; partCount: number }>('/uploads/start', 'POST', { fileSize: file.size, contentType: 'video/mp4' });
    state = { ...started, parts: {} };
    try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch { /* Current upload remains usable. */ }
  }
  for (let number = 1; number <= state.partCount; number++) {
    if (state.parts[number]) { onProgress?.(number, state.partCount); continue; }
    const { url } = await request<{ url: string }>(`/uploads/${state.id}/part`, 'POST', { partNumber: number });
    const chunk = file.slice((number - 1) * state.partSize, Math.min(number * state.partSize, file.size), 'video/mp4');
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await fetch(url, { method: 'PUT', body: chunk, headers: { 'Content-Type': 'video/mp4' } });
        if (response.ok) break;
      } catch { /* Retry a failed part, preserving previous parts. */ }
      if (attempt === 2) throw new Error(`Cloudflare rejected part ${number}. Check the bucket CORS rule and try again.`);
    }
    const etag = response?.headers.get('ETag');
    if (!etag) throw new Error(`Cloudflare did not expose the ETag for part ${number}. Check bucket CORS.`);
    state.parts[number] = etag;
    try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch { /* Current upload remains usable. */ }
    onProgress?.(number, state.partCount);
  }
  const parts = Array.from({ length: state.partCount }, (_, i) => ({ partNumber: i + 1, etag: state!.parts[i + 1] }));
  const completed = await request<{ video: Omit<R2Video, 'storageType'> }>(`/uploads/${state.id}/complete`, 'POST', { ...metadata, parts });
  try { localStorage.removeItem(cacheKey); } catch { /* No effect on saved object. */ }
  return asR2Video(completed.video);
}
