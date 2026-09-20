import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { data, error } = await supabase.from('videos').select('*').eq('id', id).single();

    if (error || !data) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ id: data.id, ...data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch video' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;

    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (body.title !== undefined) updateData.title = String(body.title).trim();
    if (body.description !== undefined) updateData.description = String(body.description).trim();
    if (body.category !== undefined) updateData.category = String(body.category).trim();
    if (body.tags !== undefined) {
      updateData.tags = Array.isArray(body.tags)
        ? body.tags.map((t: any) => String(t).trim()).filter(Boolean)
        : typeof body.tags === 'string'
        ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
        : [];
    }
    if (body.telegramFileId !== undefined) updateData.telegram_file_id = String(body.telegramFileId).trim();
    if (body.directUrl !== undefined) updateData.direct_url = String(body.directUrl).trim();
    if (body.thumbnailUrl !== undefined) updateData.thumbnail_url = String(body.thumbnailUrl);
    if (body.duration !== undefined) updateData.duration = Number(body.duration) || 0;
    if (body.fileSize !== undefined) updateData.file_size = Number(body.fileSize) || 0;
    if (body.isPublished !== undefined) updateData.is_published = Boolean(body.isPublished);
    if (body.featured !== undefined) updateData.featured = Boolean(body.featured);

    const { error } = await supabase.from('videos').update(updateData).eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, id, ...updateData });
  } catch (error: any) {
    console.error('Failed to update video:', error);
    return NextResponse.json({ error: error.message || 'Failed to update video' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 400 });
    }
    const supabase = getSupabaseAdmin()!;
    const { error } = await supabase.from('videos').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Failed to delete video:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete video' }, { status: 500 });
  }
}
