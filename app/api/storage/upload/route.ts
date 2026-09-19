import { NextResponse } from 'next/server';
import { uploadToSupabaseStorage, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, bucket = 'receipt-proofs', filename, contentType = 'image/png' } = body;

    if (!image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    // Check if Supabase is configured
    if (!isSupabaseConfigured()) {
      // If not yet configured, return image as-is (base64 string)
      return NextResponse.json({
        success: true,
        url: image,
        isSupabase: false,
        message: 'Supabase Storage not configured. Saved in local payload.'
      });
    }

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const path = filename ? `${uniqueId}-${filename}` : `receipt-${uniqueId}.png`;

    const result = await uploadToSupabaseStorage({
      bucket,
      path,
      data: image,
      contentType,
    });

    if (result.error) {
      console.warn('Supabase storage upload failed, falling back to base64:', result.error);
      return NextResponse.json({
        success: true,
        url: image,
        isSupabase: false,
        error: result.error
      });
    }

    return NextResponse.json({
      success: true,
      url: result.url,
      path: result.path,
      isSupabase: true
    });
  } catch (error: any) {
    console.error('Storage upload route error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process upload' }, { status: 500 });
  }
}
