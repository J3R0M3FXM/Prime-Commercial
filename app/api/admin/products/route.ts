import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    const product = await request.json();
    const productsCol = collection(db, 'products');
    const docRef = await addDoc(productsCol, {
      ...product,
      createdAt: new Date()
    });
    cacheStore.invalidateProducts();
    return NextResponse.json({ id: docRef.id, ...product });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();

    // Handle batch reordering
    if (Array.isArray(body.reorder)) {
      const batch = writeBatch(db);
      for (const item of body.reorder) {
        if (item.id) {
          const ref = doc(db, 'products', item.id);
          batch.update(ref, { sortOrder: Number(item.sortOrder) || 0 });
        }
      }
      await batch.commit();
      cacheStore.invalidateProducts();
      return NextResponse.json({ success: true, count: body.reorder.length });
    }

    const { id, ...data } = body;
    const productRef = doc(db, 'products', id);
    await updateDoc(productRef, data);
    cacheStore.invalidateProducts();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    const productRef = doc(db, 'products', id);
    await deleteDoc(productRef);
    cacheStore.invalidateProducts();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
