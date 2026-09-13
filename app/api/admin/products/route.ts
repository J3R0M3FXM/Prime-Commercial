import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const product = await request.json();
    const productsCol = collection(db, 'products');
    const docRef = await addDoc(productsCol, {
      ...product,
      createdAt: new Date()
    });
    return NextResponse.json({ id: docRef.id, ...product });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...data } = await request.json();
    const productRef = doc(db, 'products', id);
    await updateDoc(productRef, data);
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
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
