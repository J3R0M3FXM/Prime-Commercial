// app/api/media/videos/[id]/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const docRef = doc(db, 'videos', id);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ id: snap.id, ...snap.data() });
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
    const docRef = doc(db, 'videos', id);

    const updateData: any = {
      updatedAt: new Date().toISOString(),
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
    if (body.telegramFileId !== undefined) updateData.telegramFileId = String(body.telegramFileId).trim();
    if (body.directUrl !== undefined) updateData.directUrl = String(body.directUrl).trim();
    if (body.thumbnailUrl !== undefined) updateData.thumbnailUrl = String(body.thumbnailUrl);
    if (body.duration !== undefined) updateData.duration = Number(body.duration) || 0;
    if (body.fileSize !== undefined) updateData.fileSize = Number(body.fileSize) || 0;
    if (body.isPublished !== undefined) updateData.isPublished = Boolean(body.isPublished);
    if (body.featured !== undefined) updateData.featured = Boolean(body.featured);

    await setDoc(docRef, updateData, { merge: true });
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
    const docRef = doc(db, 'videos', id);
    await deleteDoc(docRef);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Failed to delete video:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete video' }, { status: 500 });
  }
}
