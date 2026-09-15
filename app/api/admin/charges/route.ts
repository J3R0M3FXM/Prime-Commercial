import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { normalizeCharge } from '@/lib/charges';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET() {
  try {
    const chargesSnap = await getDocs(collection(db, 'charges'));
    const charges = chargesSnap.docs.map(d => {
      const data = d.data();
      return normalizeCharge({ id: d.id, ...data }, d.id);
    });
    return NextResponse.json(charges, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const normalized = normalizeCharge(data);
    
    const docRef = await addDoc(collection(db, 'charges'), {
      name: normalized.name,
      type: normalized.type,
      amount: normalized.amount,
      isDefault: normalized.isDefault,
      isActive: normalized.isActive !== false,
      schedules: {
        date: normalized.schedules?.date || '',
        days: normalized.schedules?.days || [],
        daysOfWeek: normalized.schedules?.days || [],
        time: normalized.schedules?.time || '',
        isOvernight: Boolean(normalized.schedules?.isOvernight),
        overnight: Boolean(normalized.schedules?.isOvernight),
        isRecurring: Boolean(normalized.schedules?.isRecurring),
        recurring: Boolean(normalized.schedules?.isRecurring),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return NextResponse.json({ success: true, id: docRef.id }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400, headers: NO_CACHE_HEADERS });

    const normalized = normalizeCharge({ id, ...updateData }, id);

    const docRef = doc(db, 'charges', id);
    await updateDoc(docRef, {
      name: normalized.name,
      type: normalized.type,
      amount: normalized.amount,
      isDefault: normalized.isDefault,
      isActive: normalized.isActive !== false,
      schedules: {
        date: normalized.schedules?.date || '',
        days: normalized.schedules?.days || [],
        daysOfWeek: normalized.schedules?.days || [],
        time: normalized.schedules?.time || '',
        isOvernight: Boolean(normalized.schedules?.isOvernight),
        overnight: Boolean(normalized.schedules?.isOvernight),
        isRecurring: Boolean(normalized.schedules?.isRecurring),
        recurring: Boolean(normalized.schedules?.isRecurring),
      },
      updatedAt: serverTimestamp()
    });
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400, headers: NO_CACHE_HEADERS });

    const docRef = doc(db, 'charges', id);
    await deleteDoc(docRef);
    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}

