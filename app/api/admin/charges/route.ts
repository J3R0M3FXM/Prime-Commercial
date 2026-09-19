import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { normalizeCharge } from '@/lib/charges';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedCharges: any[] | null = null;
let lastChargesFetchTime = 0;
const CHARGES_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cachedCharges && (now - lastChargesFetchTime < CHARGES_CACHE_TTL_MS)) {
      return NextResponse.json(cachedCharges);
    }

    const chargesSnap = await getDocs(collection(db, 'charges'));
    const charges = chargesSnap.docs.map(d => {
      const data = d.data();
      return normalizeCharge({ id: d.id, ...data }, d.id);
    });

    cachedCharges = charges;
    lastChargesFetchTime = now;

    return NextResponse.json(charges);
  } catch (error: any) {
    if (cachedCharges) return NextResponse.json(cachedCharges);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    cachedCharges = null;
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
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cachedCharges = null;
    const data = await request.json();
    const { id, ...updateData } = data;
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400 });

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
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cachedCharges = null;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing charge ID" }, { status: 400 });

    const docRef = doc(db, 'charges', id);
    await deleteDoc(docRef);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

