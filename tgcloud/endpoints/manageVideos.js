import { db, EndpointError } from 'sdk';
import { asc, desc, eq } from 'sdk/db';
import { videos, systemSettings } from '../schema.js';
import { requireAdmin } from '../lib/auth.js';
import { categoryTags, publicVideoMetadata, videoCategories } from '../lib/video-metadata.js';
import { handleVideoUpload } from '../lib/video-upload.js';

const textFields = new Set(['title', 'description', 'category', 'telegramFileId', 'telegramMessageId', 'directUrl', 'thumbnailUrl']);
const writable = new Set([...textFields, 'tags', 'categories', 'duration', 'fileSize', 'width', 'height', 'isPublished', 'featured']);

function normalize(input, creating, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EndpointError('Invalid video payload.', { code: 'INVALID_INPUT' });
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!writable.has(key)) throw new EndpointError('Unsupported video field: ' + key, { code: 'INVALID_FIELD' });
    if (textFields.has(key)) {
      if (typeof value !== 'string' && value !== null) throw new EndpointError(key + ' must be text.', { code: 'INVALID_INPUT' });
      const text = value == null ? '' : value.trim();
      if (key === 'title' && !text) throw new EndpointError('Video title is required.', { code: 'INVALID_INPUT' });
      if ((key === 'directUrl' || key === 'thumbnailUrl') && text && !/^https:\/\//i.test(text) && !/^tgmedia:[A-Za-z0-9_-]{8,80}$/.test(text)) {
        throw new EndpointError(key + ' must be an HTTP(S) URL.', { code: 'INVALID_INPUT' });
      }
      if (text.length > 10000) throw new EndpointError(key + ' is too long.', { code: 'INVALID_INPUT' });
      output[key] = text;
    } else if (key === 'categories') {
      if (!Array.isArray(value) || value.length > 12 || value.some(category => typeof category !== 'string' || !category.trim() || category.length > 80))
        throw new EndpointError('Choose up to 12 valid categories.', { code: 'INVALID_INPUT' });
    } else if (key === 'tags') {
      if (!Array.isArray(value)) throw new EndpointError('tags must be an array.', { code: 'INVALID_INPUT' });
      output.tags = value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 100);
    } else if (['duration', 'fileSize', 'width', 'height'].includes(key)) {
      const n = Number(value);
      if (!Number.isSafeInteger(n) || n < 0) throw new EndpointError(key + ' must be a non-negative integer.', { code: 'INVALID_INPUT' });
      output[key] = n;
    } else if (key === 'isPublished' || key === 'featured') {
      if (typeof value !== 'boolean') throw new EndpointError(key + ' must be a boolean.', { code: 'INVALID_INPUT' });
      output[key] = value;
    }
  }
  if (input.categories !== undefined) {
    const categories = videoCategories({ categories: input.categories });
    if (!categories.length) throw new EndpointError('At least one category is required.', { code: 'INVALID_INPUT' });
    output.category = categories[0];
    output.tags = categoryTags(categories, output.tags || existing.tags || []);
  }
  const telegramFileId = output.telegramFileId;
  const directUrl = output.directUrl;
  if (creating && (!output.title || !(telegramFileId || directUrl))) {
    throw new EndpointError('A title and either Telegram File ID or direct URL are required.', { code: 'INVALID_INPUT' });
  }
  if (telegramFileId) output.storageType = 'telegram';
  else if (directUrl) output.storageType = 'url';
  if (!creating && Object.keys(output).length === 0) throw new EndpointError('No editable video fields supplied.', { code: 'INVALID_INPUT' });
  output.updatedAt = new Date();
  return output;
}

export default async function (input, ctx) {
  const staff = await requireAdmin(ctx);
  const action = input?.action;

  if (action === 'getStorageTarget') {
    const row = await db.select().from(systemSettings).where(eq(systemSettings.key, 'telegram_video_storage_chat_id')).get();
    return { chatId: typeof row?.value === 'string' ? row.value : '' };
  }
  if (action === 'setStorageTarget') {
    const chatId = String(input.chatId || '').trim();
    if (!/^(-100\d{5,}|@[A-Za-z][A-Za-z0-9_]{4,31})$/.test(chatId)) throw new EndpointError('Enter a private channel ID or channel username.', { code: 'INVALID_INPUT' });
    await db.run(`INSERT INTO system_settings (key,value,updated_at) VALUES ('telegram_video_storage_chat_id',json(:value),unixepoch())
      ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=unixepoch()`, { ':value': JSON.stringify(chatId) });
    return { success: true, chatId };
  }
  if (['uploadStart','uploadChunk','uploadComplete','uploadCancel'].includes(action)) return await handleVideoUpload(input, staff, normalize);
  if (action === 'list') return (await db.select().from(videos).orderBy(desc(videos.createdAt)).all()).map(publicVideoMetadata);

  if (action === 'create') {
    const values = normalize(input, true);
    values.category = values.category || 'Product Demos';
    values.description = values.description || '';
    values.tags = values.tags || [];
    values.telegramMessageId = values.telegramMessageId || '';
    values.directUrl = values.directUrl || '';
    values.thumbnailUrl = values.thumbnailUrl || '';
    values.duration = values.duration || 0;
    values.fileSize = values.fileSize || 0;
    values.width = values.width || 1920;
    values.height = values.height || 1080;
    values.views = 0;
    values.isPublished = values.isPublished !== false;
    values.featured = Boolean(values.featured);
    values.createdAt = new Date();
    const [video] = await db.insert(videos).values(values).returning().run();
    return { success: true, video };
  }

  if (action === 'update') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A video ID is required.', { code: 'INVALID_INPUT' });
    const current = await db.select().from(videos).where(eq(videos.id, input.id)).get();
    if (!current) throw new EndpointError('Video not found.', { code: 'NOT_FOUND' });
    const values = normalize(input, false, current);
    const [video] = await db.update(videos).set(values).where(eq(videos.id, input.id)).returning().run();
    if (!video) throw new EndpointError('Video not found.', { code: 'NOT_FOUND' });
    return { success: true, video };
  }

  if (action === 'delete') {
    if (typeof input?.id !== 'string' || !input.id.trim()) throw new EndpointError('A video ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(videos).where(eq(videos.id, input.id)).returning().run();
    if (!deleted) throw new EndpointError('Video not found.', { code: 'NOT_FOUND' });
    return { success: true, id: deleted.id };
  }

  throw new EndpointError('Unsupported video action.', { code: 'INVALID_ACTION' });
}
