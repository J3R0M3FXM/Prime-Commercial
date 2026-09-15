import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const snap = await getDocs(collection(db, 'warehouses'));
    const warehouses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // sorting by name or createdAt could be done here
    return NextResponse.json(warehouses);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const newDocRef = doc(collection(db, 'warehouses'));
    const isDefault = data.isDefault === true;
    
    // If setting as default, we need to unset any existing defaults
    if (isDefault) {
      const snap = await getDocs(collection(db, 'warehouses'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        if (d.data().isDefault) {
          batch.update(d.ref, { isDefault: false });
        }
      });
      await batch.commit();
    }

    const requestData = {
      ...data,
      isDefault,
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

    const isDefault = data.isDefault === true;
    
    // If setting as default, unset others
    if (isDefault) {
      const snap = await getDocs(collection(db, 'warehouses'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        if (d.id !== id && d.data().isDefault) {
          batch.update(d.ref, { isDefault: false });
        }
      });
      await batch.commit();
    }

    const requestData = {
      ...data,
      isDefault,
      updatedAt: new Date().toISOString(),
    };
    
    await setDoc(doc(db, 'warehouses', id), requestData, { merge: true });
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
    
    await deleteDoc(doc(db, 'warehouses', id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
