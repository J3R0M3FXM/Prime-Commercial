import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { uploadVideoToTelegram, getTelegramBotToken } from '@/lib/telegram-media';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const formData = await request.formData();
    const file = formData.get('video') as File | null;
    const title = (formData.get('title') as string || '').trim();
    const description = (formData.get('description') as string || '').trim();
    const category = (formData.get('category') as string || 'Product Demos').trim();
    const tagsRaw = formData.get('tags') as string || '';
    const isPublished = formData.get('isPublished') !== 'false';
    const featured = formData.get('featured') === 'true';
    const customChatId = formData.get('chatId') as string || '';
    const customThumbnail = formData.get('thumbnailUrl') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'Video file is required' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Video title is required' }, { status: 400 });
    }

    const token = getTelegramBotToken();
    if (!token) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN is not configured in server environment.' },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploadRes = await uploadVideoToTelegram(buffer, file.name, {
      caption: `🎬 ${title}\n📁 ${category}\n${description ? `\n${description}` : ''}`,
      chatId: customChatId || undefined,
    });

    if (!uploadRes.success || !uploadRes.fileId) {
      return NextResponse.json(
        { error: uploadRes.error || 'Failed to upload video to Telegram' },
        { status: 500 }
      );
    }

    const tags = tagsRaw
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const now = new Date().toISOString();

    const videoRecord = {
      title,
      description,
      category,
      tags,
      telegram_file_id: uploadRes.fileId,
      telegram_file_unique_id: uploadRes.fileUniqueId || '',
      telegram_message_id: uploadRes.messageId || null,
      storage_chat_id: uploadRes.chatId || '',
      storage_type: 'telegram',
      thumbnail_url: customThumbnail || '',
      duration: uploadRes.duration || 0,
      file_size: uploadRes.fileSize || buffer.length,
      width: uploadRes.width || 1920,
      height: uploadRes.height || 1080,
      views: 0,
      is_published: isPublished,
      featured,
      created_at: now,
      updated_at: now,
    };

    const { data: inserted, error } = await supabase.from('videos').insert([videoRecord]).select().single();
    if (error) throw error;

    return NextResponse.json({
      success: true,
      id: inserted.id,
      title: inserted.title,
      description: inserted.description,
      category: inserted.category,
      tags: inserted.tags,
      telegramFileId: inserted.telegram_file_id,
      thumbnailUrl: inserted.thumbnail_url,
      views: inserted.views,
      isPublished: inserted.is_published,
      featured: inserted.featured,
      createdAt: inserted.created_at
    });
  } catch (error: any) {
    console.error('Failed to handle video upload to Telegram:', error);
    return NextResponse.json({ error: error.message || 'Server error during upload' }, { status: 500 });
  }
}
