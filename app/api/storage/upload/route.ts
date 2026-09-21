import { NextResponse } from 'next/server';
import { uploadToSupabaseStorage, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

const MAX_IMAGE_CHARS = 12 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, bucket = 'receipt-proofs', filename, contentType = 'image/png' } = body;

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: 'Image is too large.' }, { status: 413 });
    }

    // Customer receipt uploads are intentionally restricted to the receipt bucket.
    if (bucket !== 'receipt-proofs') {
      return NextResponse.json({ error: 'Invalid storage bucket' }, { status: 400 });
    }

    if (!/^image\/(jpeg|jpg|png|webp)$/.test(String(contentType))) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        url: image,
        isSupabase: false,
        message: 'Supabase Storage not configured. Saved in local payload.'
      });
    }

    const uniqueId = crypto.randomUUID();
    const safeFilename = String(filename || 'receipt.png').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const path = `receipt-${uniqueId}-${safeFilename}`;

    const result = await uploadToSupabaseStorage({
      bucket,
      path,
      data: image,
      contentType,
    });

    if (result.error) {
      console.warn('Supabase storage upload failed:', result.error);
      return NextResponse.json({ error: 'Receipt upload failed.' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      path: result.path,
      isSupabase: true
    });
  } catch (error: any) {
    console.error('Storage upload route error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process upload' }, { status: 400 });
  }
}
