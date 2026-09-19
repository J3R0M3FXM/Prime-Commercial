// app/api/admin/media/status/route.ts
import { NextResponse } from 'next/server';
import { getTelegramBotToken, getTelegramStorageChatId } from '@/lib/telegram-media';
import { db } from '@/lib/firebase';
import { collection, getCountFromServer } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  const token = getTelegramBotToken();
  const storageChatId = getTelegramStorageChatId();

  if (!token) {
    return NextResponse.json({
      connected: false,
      error: 'TELEGRAM_BOT_TOKEN is not set',
      storageChatId,
    });
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();

    let totalVideos = 0;
    try {
      const snap = await getCountFromServer(collection(db, 'videos'));
      totalVideos = snap.data().count;
    } catch {
      // ignore
    }

    if (res.ok && data.ok) {
      return NextResponse.json({
        connected: true,
        bot: {
          id: data.result.id,
          username: data.result.username,
          firstName: data.result.first_name,
        },
        storageChatId,
        totalVideos,
      });
    } else {
      return NextResponse.json({
        connected: false,
        error: data.description || 'Failed to authenticate Telegram Bot',
        storageChatId,
        totalVideos,
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      connected: false,
      error: err.message || 'Network error connecting to Telegram Bot API',
      storageChatId,
    });
  }
}
