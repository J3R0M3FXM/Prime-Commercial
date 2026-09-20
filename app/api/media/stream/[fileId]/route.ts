import { NextRequest, NextResponse } from 'next/server';
import { getTelegramFilePath, getTelegramDownloadUrl } from '@/lib/telegram-media';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

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

    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseAdmin()!;
        const { data } = await supabase.from('videos').select('*').eq('id', fileId).single();
        if (data) {
          const telegramFileId = data.telegram_file_id || data.telegramFileId;
          const directUrl = data.direct_url || data.directUrl;
          if (telegramFileId) {
            const tgInfo = await getTelegramFilePath(telegramFileId);
            if (tgInfo.success && tgInfo.filePath) {
              targetStreamUrl = getTelegramDownloadUrl(tgInfo.filePath);
            }
          } else if (directUrl) {
            targetStreamUrl = directUrl;
          }
        }
      }
    } catch {
      // Not a doc ID, continue
    }

    if (!targetStreamUrl) {
      if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
        targetStreamUrl = decodeURIComponent(fileId);
      } else {
        const tgInfo = await getTelegramFilePath(fileId);
        if (tgInfo.success && tgInfo.filePath) {
          targetStreamUrl = getTelegramDownloadUrl(tgInfo.filePath);
        } else {
          return new NextResponse(
            `Unable to locate video on Telegram: ${tgInfo.error || 'Invalid file ID'}`,
            { status: 404 }
          );
        }
      }
    }

    const rangeHeader = request.headers.get('range');
    const proxyHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0'
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

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', videoResponse.headers.get('Content-Type') || 'video/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');
    
    const contentLength = videoResponse.headers.get('Content-Length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);
    
    const contentRange = videoResponse.headers.get('Content-Range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

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
