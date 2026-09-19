// app/api/media/videos/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { getTelegramFilePath } from '@/lib/telegram-media';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get('all') === 'true';
    const category = searchParams.get('category');
    const search = searchParams.get('search')?.toLowerCase().trim();
    const featuredOnly = searchParams.get('featured') === 'true';

    const snap = await getDocs(collection(db, 'videos'));
    let videos = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    // Filter by published status if not includeAll
    if (!includeAll) {
      videos = videos.filter(v => v.isPublished !== false);
    }

    // Filter by category
    if (category && category !== 'All') {
      videos = videos.filter(v => v.category?.toLowerCase() === category.toLowerCase());
    }

    // Filter by search term
    if (search) {
      videos = videos.filter(v => {
        const titleMatch = v.title?.toLowerCase().includes(search);
        const descMatch = v.description?.toLowerCase().includes(search);
        const tagMatch = Array.isArray(v.tags) && v.tags.some((t: string) => t.toLowerCase().includes(search));
        return titleMatch || descMatch || tagMatch;
      });
    }

    // Filter featured
    if (featuredOnly) {
      videos = videos.filter(v => Boolean(v.featured));
    }

    // Sort: Featured first, then newest first
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

    // If telegramFileId provided, try to verify with Telegram API to auto-fill metadata
    let detectedDuration = Number(data.duration) || 0;
    let detectedFileSize = Number(data.fileSize) || 0;

    if (telegramFileId) {
      const fileInfo = await getTelegramFilePath(telegramFileId);
      if (fileInfo.success && fileInfo.fileSize) {
        detectedFileSize = fileInfo.fileSize;
      }
    }

    const newDocRef = doc(collection(db, 'videos'));
    const now = new Date().toISOString();

    const videoRecord = {
      title,
      description: typeof data.description === 'string' ? data.description.trim() : '',
      category: data.category || 'Product Demos',
      tags: Array.isArray(data.tags)
        ? data.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : typeof data.tags === 'string'
        ? data.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [],
      telegramFileId,
      telegramMessageId: data.telegramMessageId || '',
      storageType: telegramFileId ? 'telegram' : 'url',
      directUrl: directUrl || '',
      thumbnailUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : '',
      duration: detectedDuration,
      fileSize: detectedFileSize,
      width: Number(data.width) || 1920,
      height: Number(data.height) || 1080,
      views: 0,
      isPublished: data.isPublished !== false,
      featured: Boolean(data.featured),
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(newDocRef, videoRecord);
    return NextResponse.json({ id: newDocRef.id, ...videoRecord });
  } catch (error: any) {
    console.error('Failed to create video record:', error);
    return NextResponse.json({ error: error.message || 'Failed to create video record' }, { status: 500 });
  }
}
