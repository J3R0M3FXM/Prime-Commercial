import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

function cleanTimestamps(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const copy: any = Array.isArray(obj) ? [] : {};
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object' && typeof (value as any).toDate === 'function') {
      copy[key] = (value as any).toDate().toISOString();
    } else if (value && typeof value === 'object') {
      copy[key] = cleanTimestamps(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

export async function GET() {
  try {
    const ordersCol = collection(db, 'orders');
    const snap = await getDocs(ordersCol);
    const orders = snap.docs.map(d => ({
      id: d.id,
      ...cleanTimestamps(d.data())
    }));

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return NextResponse.json(orders);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, status, notes, paymentStatus } = await request.json();
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const orderRef = doc(db, 'orders', id);
    const updateData: any = { updatedAt: new Date().toISOString() };
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;

    await updateDoc(orderRef, updateData);
    return NextResponse.json({ success: true, ...updateData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });

    const orderRef = doc(db, 'orders', id);
    await deleteDoc(orderRef);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
