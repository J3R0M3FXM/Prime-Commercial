// app/api/media/stream/[fileId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTelegramFilePath, getTelegramDownloadUrl, getTelegramBotToken } from '@/lib/telegram-media';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    if (!fileId) {
      return new NextResponse('Missing video identifier', { status: 400 });
    }

    let targetStreamUrl = '';
    let isTelegram = false;

    // 1. Check if fileId is actually a Firestore document ID
    try {
      const docSnap = await getDoc(doc(db, 'videos', fileId));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.telegramFileId) {
          const tgInfo = await getTelegramFilePath(data.telegramFileId);
          if (tgInfo.success && tgInfo.filePath) {
            targetStreamUrl = getTelegramDownloadUrl(tgInfo.filePath);
            isTelegram = true;
          }
        } else if (data.directUrl) {
          targetStreamUrl = data.directUrl;
        }
      }
    } catch {
      // Not a doc ID, continue
    }

    // 2. If not resolved from doc ID, check if it's a direct Telegram File ID
    if (!targetStreamUrl) {
      if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
        targetStreamUrl = decodeURIComponent(fileId);
      } else {
        const tgInfo = await getTelegramFilePath(fileId);
        if (tgInfo.success && tgInfo.filePath) {
          targetStreamUrl = getTelegramDownloadUrl(tgInfo.filePath);
          isTelegram = true;
        } else {
          return new NextResponse(
            `Unable to locate video on Telegram: ${tgInfo.error || 'Invalid file ID'}`,
            { status: 404 }
          );
        }
      }
    }

    // 3. Prepare headers and forward Range request for smooth seeking
    const rangeHeader = request.headers.get('range');
    const proxyHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    if (rangeHeader) {
      proxyHeaders['Range'] = rangeHeader;
    }

    const videoResponse = await fetch(targetStreamUrl, {
      headers: proxyHeaders,
    });

    if (!videoResponse.ok && videoResponse.status !== 206) {
      return new NextResponse(
        `Failed to fetch video stream from storage provider: ${videoResponse.statusText}`,
        { status: videoResponse.status }
      );
    }

    // Build client response headers
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', videoResponse.headers.get('Content-Type') || 'video/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');
    
    const contentLength = videoResponse.headers.get('Content-Length');
    if (contentLength) {
      responseHeaders.set('Content-Length', contentLength);
    }
    
    const contentRange = videoResponse.headers.get('Content-Range');
    if (contentRange) {
      responseHeaders.set('Content-Range', contentRange);
    }

    responseHeaders.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');

    return new NextResponse(videoResponse.body as any, {
      status: videoResponse.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Video streaming proxy error:', error);
    return new NextResponse(`Streaming error: ${error.message || 'Unknown'}`, { status: 500 });
  }
}
