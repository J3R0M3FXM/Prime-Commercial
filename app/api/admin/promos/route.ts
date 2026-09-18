import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { type PromoConfig, generatePromoCode } from '@/lib/promos';

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
    const promosCol = collection(db, 'promos');
    const snap = await getDocs(promosCol);

    // Also fetch redemptions to audit device sharing & fraud
    let allRedemptions: any[] = [];
    try {
      const redSnap = await getDocs(collection(db, 'promo_redemptions'));
      allRedemptions = redSnap.docs.map(d => ({ id: d.id, ...cleanTimestamps(d.data()) }));
    } catch {
      allRedemptions = [];
    }

    const promos = snap.docs.map(d => {
      const data = cleanTimestamps(d.data());
      const code = data.code;
      const redemptions = allRedemptions.filter((r: any) => r.promoCode === code || r.promoId === d.id);
      
      // Check device fraud in redemptions: devices associated with multiple customer IDs
      const deviceToCustomers = new Map<string, Set<string>>();
      let abuseFlagCount = 0;

      redemptions.forEach((r: any) => {
        const dev = r.deviceId || r.hardwareId;
        const cust = r.customerId || r.primeMemberId;
        if (dev && cust) {
          const set = deviceToCustomers.get(dev) || new Set<string>();
          set.add(cust);
          deviceToCustomers.set(dev, set);
        }
      });

      deviceToCustomers.forEach((custSet) => {
        if (custSet.size > 1) {
          abuseFlagCount += custSet.size;
        }
      });

      return {
        id: d.id,
        ...data,
        usageCount: redemptions.length,
        redemptions: redemptions.slice(-10), // latest 10
        fraudFlagsCount: abuseFlagCount
      };
    });

    promos.sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

    return NextResponse.json(promos);
  } catch (err: any) {
    console.error('Error fetching promos:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let { 
      code, 
      title, 
      description = '', 
      discountType = 'fixed', 
      discountValue = 0, 
      maxDiscountAmount = null, 
      minSpend = 0, 
      totalUsageLimit = null, 
      usageLimitPerCustomer = 1, 
      isActive = true,
      startDate = null,
      endDate = null
    } = body;

    let cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      cleanCode = generatePromoCode('PRIME');
    }

    // Check if code already exists
    const q = query(collection(db, 'promos'), where('code', '==', cleanCode));
    const existSnap = await getDocs(q);
    if (!existSnap.empty) {
      return NextResponse.json({ error: `A promo with code "${cleanCode}" already exists.` }, { status: 400 });
    }

    const promoId = `promo_${Date.now()}`;
    const newPromo: PromoConfig = {
      id: promoId,
      code: cleanCode,
      title: title || `${cleanCode} Promo`,
      description: description || '',
      discountType: discountType as any,
      discountValue: Number(discountValue) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
      minSpend: minSpend ? Number(minSpend) : 0,
      totalUsageLimit: totalUsageLimit ? Number(totalUsageLimit) : undefined,
      usageCount: 0,
      usageLimitPerCustomer: usageLimitPerCustomer ? Number(usageLimitPerCustomer) : 1,
      isActive: Boolean(isActive),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'promos', promoId), newPromo);
    return NextResponse.json(newPromo);
  } catch (err: any) {
    console.error('Error creating promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Promo ID is required' }, { status: 400 });

    const promoRef = doc(db, 'promos', id);
    const snap = await getDoc(promoRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Promo not found' }, { status: 404 });
    }

    if (updates.code) {
      updates.code = String(updates.code).trim().toUpperCase();
    }

    updates.updatedAt = new Date().toISOString();
    await updateDoc(promoRef, updates);

    const updatedSnap = await getDoc(promoRef);
    return NextResponse.json({ id, ...cleanTimestamps(updatedSnap.data()) });
  } catch (err: any) {
    console.error('Error updating promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Promo ID is required' }, { status: 400 });

    await deleteDoc(doc(db, 'promos', id));
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
