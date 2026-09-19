// app/api/admin/media/upload/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { uploadVideoToTelegram, getTelegramBotToken } from '@/lib/telegram-media';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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
        { error: 'TELEGRAM_BOT_TOKEN is not configured in server environment. Please configure it in settings.' },
        { status: 500 }
      );
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Telegram Storage
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

    // Prepare tags
    const tags = tagsRaw
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    // Save record in Firestore
    const newDocRef = doc(collection(db, 'videos'));
    const now = new Date().toISOString();

    const videoRecord = {
      title,
      description,
      category,
      tags,
      telegramFileId: uploadRes.fileId,
      telegramFileUniqueId: uploadRes.fileUniqueId || '',
      telegramMessageId: uploadRes.messageId || null,
      storageChatId: uploadRes.chatId || '',
      storageType: 'telegram',
      thumbnailUrl: customThumbnail || '',
      duration: uploadRes.duration || 0,
      fileSize: uploadRes.fileSize || buffer.length,
      width: uploadRes.width || 1920,
      height: uploadRes.height || 1080,
      views: 0,
      isPublished,
      featured,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(newDocRef, videoRecord);

    return NextResponse.json({
      success: true,
      id: newDocRef.id,
      ...videoRecord,
    });
  } catch (error: any) {
    console.error('Failed to handle video upload to Telegram:', error);
    return NextResponse.json({ error: error.message || 'Server error during upload' }, { status: 500 });
  }
}
