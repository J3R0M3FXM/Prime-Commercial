import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export const dynamic = 'force-dynamic';

let cachedCouriers: any[] | null = null;
let lastCouriersFetchTime = 0;
const COURIERS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cachedCouriers && (now - lastCouriersFetchTime < COURIERS_CACHE_TTL_MS)) {
      return NextResponse.json(cachedCouriers);
    }

    const snap = await getDocs(collection(db, 'couriers'));
    const couriers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort stably by createdAt or name
    couriers.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

    cachedCouriers = couriers;
    lastCouriersFetchTime = now;

    return NextResponse.json(couriers);
  } catch (error: any) {
    if (cachedCouriers) return NextResponse.json(cachedCouriers);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    cachedCouriers = null;
    const data = await request.json().catch(() => ({}));
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: "Courier name is required" }, { status: 400 });
    }

    if (data.logo && typeof data.logo === 'string' && data.logo.length > 600000) {
      return NextResponse.json({ error: "Courier logo image is too large. Please use an image under 500KB." }, { status: 400 });
    }

    const newDocRef = doc(collection(db, 'couriers'));

    const requestData = {
      name,
      logo: typeof data.logo === 'string' ? data.logo : '',
      type: data.type || "Standard",
      baseFare: Number(data.baseFare) || 0,
      firstMile: Number(data.firstMile) || 0,
      firstMileFee: Number(data.firstMileFee) || 0,
      exceedingKmFee: Number(data.exceedingKmFee) || 0,
      surcharge: Number(data.surcharge) || 0,
      nightDifferential: Number(data.nightDifferential) || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await setDoc(newDocRef, requestData);
    return NextResponse.json({ id: newDocRef.id, ...requestData });
  } catch (error: any) {
    console.error("Failed to create courier:", error);
    return NextResponse.json({ error: error.message || "Failed to create courier" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cachedCouriers = null;
    const body = await request.json().catch(() => ({}));
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Missing courier ID" }, { status: 400 });

    if (data.name !== undefined) {
      const name = typeof data.name === 'string' ? data.name.trim() : '';
      if (!name) {
        return NextResponse.json({ error: "Courier name cannot be empty" }, { status: 400 });
      }
      data.name = name;
    }

    if (data.logo && typeof data.logo === 'string' && data.logo.length > 600000) {
      return NextResponse.json({ error: "Courier logo image is too large. Please use an image under 500KB." }, { status: 400 });
    }

    const requestData: any = {
      ...data,
      updatedAt: new Date().toISOString(),
    };

    if (data.baseFare !== undefined) requestData.baseFare = Number(data.baseFare) || 0;
    if (data.firstMile !== undefined) requestData.firstMile = Number(data.firstMile) || 0;
    if (data.firstMileFee !== undefined) requestData.firstMileFee = Number(data.firstMileFee) || 0;
    if (data.exceedingKmFee !== undefined) requestData.exceedingKmFee = Number(data.exceedingKmFee) || 0;
    if (data.surcharge !== undefined) requestData.surcharge = Number(data.surcharge) || 0;
    if (data.nightDifferential !== undefined) requestData.nightDifferential = Number(data.nightDifferential) || 0;
    
    await setDoc(doc(db, 'couriers', id), requestData, { merge: true });
    return NextResponse.json({ success: true, id, ...requestData });
  } catch (error: any) {
    console.error("Failed to update courier:", error);
    return NextResponse.json({ error: error.message || "Failed to update courier" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cachedCouriers = null;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });
    
    await deleteDoc(doc(db, 'couriers', id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
