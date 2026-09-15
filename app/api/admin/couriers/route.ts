import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'couriers'));
    const couriers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json(couriers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const newDocRef = doc(collection(db, 'couriers'));

    const requestData = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(newDocRef, requestData);
    return NextResponse.json({ id: newDocRef.id, ...requestData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    const requestData = {
      ...data,
      updatedAt: new Date().toISOString(),
    };
    
    await setDoc(doc(db, 'couriers', id), requestData, { merge: true });
    return NextResponse.json({ success: true, id, ...requestData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    await deleteDoc(doc(db, 'couriers', id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
