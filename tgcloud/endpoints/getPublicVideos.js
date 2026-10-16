import { db } from 'sdk';
import { desc, eq } from 'sdk/db';
import { videos } from '../schema.js';

/** Public gallery metadata; unpublished items are never returned. */
export default async function (input = {}) {
  const rows = await db.select().from(videos)
    .where(eq(videos.isPublished, true))
    .orderBy(desc(videos.createdAt))
    .all();

  const category = String(input.category || '').trim().toLowerCase();
  const search = String(input.search || '').trim().toLowerCase();
  const featuredOnly = input.featured === true || String(input.featured).toLowerCase() === 'true';

  const filtered = rows.filter((video) => {
    if (category && category !== 'all' && String(video.category || '').toLowerCase() !== category) return false;
    if (featuredOnly && !video.featured) return false;
    if (search) {
      const tags = Array.isArray(video.tags) ? video.tags : [];
      const matches = String(video.title || '').toLowerCase().includes(search) ||
        String(video.description || '').toLowerCase().includes(search) ||
        tags.some((tag) => String(tag).toLowerCase().includes(search));
      if (!matches) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return filtered.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    category: video.category,
    tags: video.tags,
    telegramFileId: video.telegramFileId,
    telegramMessageId: video.telegramMessageId,
    storageType: video.storageType,
    directUrl: video.directUrl,
    thumbnailUrl: video.thumbnailUrl,
    duration: video.duration,
    fileSize: video.fileSize,
    width: video.width,
    height: video.height,
    views: video.views,
    isPublished: video.isPublished,
    featured: video.featured,
    createdAt: video.createdAt,
    updatedAt: video.updatedAt,
  }));
}
