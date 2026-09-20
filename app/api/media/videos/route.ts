import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getTelegramFilePath } from '@/lib/telegram-media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('all') === 'true';
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase().trim();
    const featuredOnly = searchParams.get('featured') === 'true';

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.from('videos').select('*').order('created_at', { ascending: false });
    if (error) throw error;

    let videos = (data || []).map(v => ({
      id: v.id,
      title: v.title,
      description: v.description,
      category: v.category,
      tags: v.tags,
      telegramFileId: v.telegram_file_id || v.telegramFileId,
      telegramMessageId: v.telegram_message_id || v.telegramMessageId,
      storageType: v.storage_type || v.storageType,
      directUrl: v.direct_url || v.directUrl,
      thumbnailUrl: v.thumbnail_url || v.thumbnailUrl,
      duration: v.duration,
      fileSize: v.file_size || v.fileSize,
      width: v.width,
      height: v.height,
      views: v.views,
      isPublished: v.is_published !== undefined ? v.is_published : v.isPublished,
      featured: v.featured,
      createdAt: v.created_at || v.createdAt,
      updatedAt: v.updated_at || v.updatedAt,
    }));

    if (!includeAll) {
      videos = videos.filter(v => v.isPublished !== false);
    }

    if (category && category !== 'All') {
      videos = videos.filter(v => v.category?.toLowerCase() === category.toLowerCase());
    }

    if (search) {
      videos = videos.filter(v => {
        const titleMatch = v.title?.toLowerCase().includes(search);
        const descMatch = v.description?.toLowerCase().includes(search);
        const tagMatch = Array.isArray(v.tags) && v.tags.some((t: string) => t.toLowerCase().includes(search));
        return titleMatch || descMatch || tagMatch;
      });
    }

    if (featuredOnly) {
      videos = videos.filter(v => Boolean(v.featured));
    }

    videos.sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json(videos);
  } catch (error: any) {
    console.error('Failed to fetch gallery videos:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch videos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'Video title is required' }, { status: 400 });
    }

    const telegramFileId = typeof data.telegramFileId === 'string' ? data.telegramFileId.trim() : '';
    const directUrl = typeof data.directUrl === 'string' ? data.directUrl.trim() : '';

    if (!telegramFileId && !directUrl) {
      return NextResponse.json({ error: 'Either Telegram File ID or a Video URL is required' }, { status: 400 });
    }

    let detectedDuration = Number(data.duration) || 0;
    let detectedFileSize = Number(data.fileSize) || 0;

    if (telegramFileId) {
      const fileInfo = await getTelegramFilePath(telegramFileId);
      if (fileInfo.success && fileInfo.fileSize) {
        detectedFileSize = fileInfo.fileSize;
      }
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const videoRecord = {
      id,
      title,
      description: typeof data.description === 'string' ? data.description.trim() : '',
      category: data.category || 'Product Demos',
      tags: Array.isArray(data.tags)
        ? data.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : typeof data.tags === 'string'
        ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
      telegram_file_id: telegramFileId,
      telegram_message_id: data.telegramMessageId || '',
      storage_type: telegramFileId ? 'telegram' : 'url',
      direct_url: directUrl || '',
      thumbnail_url: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : '',
      duration: detectedDuration,
      file_size: detectedFileSize,
      width: Number(data.width) || 1920,
      height: Number(data.height) || 1080,
      views: 0,
      is_published: data.isPublished !== false,
      featured: Boolean(data.featured),
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from('videos').insert([videoRecord]);
    if (error) throw error;

    return NextResponse.json({ 
      id,
      title: videoRecord.title,
      description: videoRecord.description,
      category: videoRecord.category,
      tags: videoRecord.tags,
      telegramFileId: videoRecord.telegram_file_id,
      directUrl: videoRecord.direct_url,
      thumbnailUrl: videoRecord.thumbnail_url,
      duration: videoRecord.duration,
      fileSize: videoRecord.file_size,
      views: videoRecord.views,
      isPublished: videoRecord.is_published,
      featured: videoRecord.featured,
      createdAt: videoRecord.created_at,
      updatedAt: videoRecord.updated_at
    });
  } catch (error: any) {
    console.error('Failed to create video record:', error);
    return NextResponse.json({ error: error.message || 'Failed to create video record' }, { status: 500 });
  }
}
