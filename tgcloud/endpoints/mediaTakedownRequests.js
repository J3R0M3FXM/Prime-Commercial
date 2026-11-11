import { db, EndpointError } from 'sdk';
import { eq } from 'sdk/db';
import { fetch } from 'sdk/fetch';
import { videos } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';

const invalid = (message) => { throw new EndpointError(message, { code: 'INVALID_INPUT' }); };

async function ensureTable() {
  await db.run(`CREATE TABLE IF NOT EXISTS media_takedown_requests (
    id TEXT PRIMARY KEY, storage_type TEXT NOT NULL, video_id TEXT NOT NULL,
    video_title TEXT NOT NULL, requester_id TEXT NOT NULL, reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
    reviewed_at INTEGER, reviewed_by TEXT)`);
  await db.run(`CREATE INDEX IF NOT EXISTS media_takedown_status_idx ON media_takedown_requests(status,created_at DESC)`);
}

export default async function (input, ctx) {
  const action = String(input?.action || '');
  if (!['submit', 'list', 'review'].includes(action)) invalid('Invalid request action.');
  if (action !== 'submit') await requireAdmin(ctx);
  await ensureTable();
  if (action === 'list') return await db.all(`SELECT * FROM media_takedown_requests ORDER BY CASE WHEN status='pending' THEN 0 ELSE 1 END,created_at DESC LIMIT 100`);
  if (action === 'review') {
    const id = String(input?.id || '');
    const status = String(input?.status || '');
    if (!/^[a-f0-9-]{36}$/.test(id) || !['reviewed', 'dismissed'].includes(status)) invalid('Invalid review.');
    const result = await db.get(`UPDATE media_takedown_requests SET status=:status,reviewed_at=unixepoch(),reviewed_by=:staff WHERE id=:id AND status='pending' RETURNING id`, {
      ':id': id, ':status': status, ':staff': String(ctx.initData.user.id),
    });
    return { success: Boolean(result?.id) };
  }
  const requesterId = String(ctx?.initData?.user?.id || '');
  if (!/^\d{1,24}$/.test(requesterId)) throw new EndpointError('Telegram access required.', { code: 'AUTH_REQUIRED' });
  const storageType = String(input?.storageType || '');
  const videoId = String(input?.id || '');
  const reason = String(input?.reason || '').trim();
  if (!['r2', 'telegram'].includes(storageType) || !/^[A-Za-z0-9_-]{1,120}$/.test(videoId)) invalid('Invalid video.');
  if (reason.length < 10 || reason.length > 2000) invalid('Describe your request in 10 to 2000 characters.');
  let video;
  if (storageType === 'telegram') video = await db.select().from(videos).where(eq(videos.id, videoId)).get();
  else {
    const response = await fetch('https://prime-media-gateway.pages.dev/videos');
    if (!response.ok) throw new EndpointError('Media availability could not be verified.', { code: 'MEDIA_UNAVAILABLE' });
    const catalog = await response.json();
    video = Array.isArray(catalog) ? catalog.find((item) => item.id === videoId) : null;
  }
  if (!video || !(video.isPublished === true || video.isPublished === 1)) throw new EndpointError('Video not found.', { code: 'NOT_FOUND' });
  const existing = await db.get(`SELECT id FROM media_takedown_requests WHERE storage_type=:storage AND video_id=:video AND requester_id=:requester AND status='pending' LIMIT 1`, {
    ':storage': storageType, ':video': videoId, ':requester': requesterId,
  });
  if (existing) return { success: true, id: existing.id, alreadyPending: true };
  const id = globalThis.crypto.randomUUID();
  await db.run(`INSERT INTO media_takedown_requests (id,storage_type,video_id,video_title,requester_id,reason,created_at)
    VALUES (:id,:storage,:video,:title,:requester,:reason,unixepoch())`, {
    ':id': id, ':storage': storageType, ':video': videoId,
    ':title': String(video.title || 'Untitled video').slice(0, 300), ':requester': requesterId, ':reason': reason,
  });
  return { success: true, id };
}
