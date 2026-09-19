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
  where,
  limit
} from 'firebase/firestore';
import { type PromoConfig, generatePromoCode } from '@/lib/promos';
import { cacheStore } from '@/lib/cache';

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

const PROMOS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cacheStore.promos && (now - cacheStore.lastPromosFetchTime < PROMOS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.promos);
    }

    const promosCol = collection(db, 'promos');
    const snap = await getDocs(promosCol);

    // Also fetch redemptions to audit device sharing & fraud (limit to recent 200)
    let allRedemptions: any[] = [];
    try {
      const redCol = collection(db, 'promo_redemptions');
      const qRed = query(redCol, limit(200));
      const redSnap = await getDocs(qRed);
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

    cacheStore.promos = promos;
    cacheStore.lastPromosFetchTime = now;

    return NextResponse.json(promos);
  } catch (err: any) {
    if (cacheStore.promos) return NextResponse.json(cacheStore.promos);
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
      voucherType = 'shop_voucher',
      discountType = 'fixed', 
      discountValue = 0, 
      maxDiscountAmount = null, 
      cappedShippingDiscount = null,
      cashbackPercentage = null,
      minSpend = 0, 
      minItemQuantity = 0,
      customerEligibility = 'all',
      minPreviousOrders = 0,
      eligibleTiers = [],
      allowedPaymentMethods = ['all'],
      allowedCourierIds = ['all'],
      activeDaysOfWeek = [0, 1, 2, 3, 4, 5, 6],
      isPaydayOnly = false,
      flashHourStart = null,
      flashHourEnd = null,
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
      voucherType: voucherType as any,
      discountType: discountType as any,
      discountValue: Number(discountValue) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
      cappedShippingDiscount: cappedShippingDiscount ? Number(cappedShippingDiscount) : undefined,
      cashbackPercentage: cashbackPercentage ? Number(cashbackPercentage) : undefined,
      minSpend: minSpend ? Number(minSpend) : 0,
      minItemQuantity: minItemQuantity ? Number(minItemQuantity) : undefined,
      customerEligibility: customerEligibility as any,
      minPreviousOrders: minPreviousOrders ? Number(minPreviousOrders) : undefined,
      eligibleTiers: Array.isArray(eligibleTiers) ? eligibleTiers : [],
      allowedPaymentMethods: Array.isArray(allowedPaymentMethods) ? allowedPaymentMethods : ['all'],
      allowedCourierIds: Array.isArray(allowedCourierIds) ? allowedCourierIds : ['all'],
      activeDaysOfWeek: Array.isArray(activeDaysOfWeek) ? activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6],
      isPaydayOnly: Boolean(isPaydayOnly),
      flashHourStart: flashHourStart !== null && flashHourStart !== undefined && flashHourStart !== '' ? Number(flashHourStart) : undefined,
      flashHourEnd: flashHourEnd !== null && flashHourEnd !== undefined && flashHourEnd !== '' ? Number(flashHourEnd) : undefined,
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
    cacheStore.invalidatePromos();
    return NextResponse.json(newPromo);
  } catch (err: any) {
    console.error('Error creating promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    cacheStore.invalidatePromos();
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'Promo ID is required' }, { status: 400 });

    const promoRef = doc(db, 'promos', id);
    const snap = await getDoc(promoRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Promo not found' }, { status: 404 });
    }

    const sanitizedUpdates: Record<string, any> = {
      updatedAt: new Date().toISOString()
    };

    if (updates.code !== undefined) {
      sanitizedUpdates.code = String(updates.code).trim().toUpperCase();
    }
    if (updates.title !== undefined) sanitizedUpdates.title = String(updates.title);
    if (updates.description !== undefined) sanitizedUpdates.description = String(updates.description);
    if (updates.voucherType !== undefined) sanitizedUpdates.voucherType = updates.voucherType;
    if (updates.discountType !== undefined) sanitizedUpdates.discountType = updates.discountType;
    if (updates.discountValue !== undefined) sanitizedUpdates.discountValue = Number(updates.discountValue) || 0;
    if (updates.maxDiscountAmount !== undefined) sanitizedUpdates.maxDiscountAmount = updates.maxDiscountAmount ? Number(updates.maxDiscountAmount) : null;
    if (updates.cappedShippingDiscount !== undefined) sanitizedUpdates.cappedShippingDiscount = updates.cappedShippingDiscount ? Number(updates.cappedShippingDiscount) : null;
    if (updates.cashbackPercentage !== undefined) sanitizedUpdates.cashbackPercentage = updates.cashbackPercentage ? Number(updates.cashbackPercentage) : null;
    if (updates.minSpend !== undefined) sanitizedUpdates.minSpend = Number(updates.minSpend) || 0;
    if (updates.minItemQuantity !== undefined) sanitizedUpdates.minItemQuantity = updates.minItemQuantity ? Number(updates.minItemQuantity) : null;
    if (updates.customerEligibility !== undefined) sanitizedUpdates.customerEligibility = updates.customerEligibility;
    if (updates.minPreviousOrders !== undefined) sanitizedUpdates.minPreviousOrders = updates.minPreviousOrders ? Number(updates.minPreviousOrders) : null;
    if (updates.eligibleTiers !== undefined) sanitizedUpdates.eligibleTiers = Array.isArray(updates.eligibleTiers) ? updates.eligibleTiers : [];
    if (updates.allowedPaymentMethods !== undefined) sanitizedUpdates.allowedPaymentMethods = Array.isArray(updates.allowedPaymentMethods) ? updates.allowedPaymentMethods : ['all'];
    if (updates.allowedCourierIds !== undefined) sanitizedUpdates.allowedCourierIds = Array.isArray(updates.allowedCourierIds) ? updates.allowedCourierIds : ['all'];
    if (updates.activeDaysOfWeek !== undefined) sanitizedUpdates.activeDaysOfWeek = Array.isArray(updates.activeDaysOfWeek) ? updates.activeDaysOfWeek : [0, 1, 2, 3, 4, 5, 6];
    if (updates.isPaydayOnly !== undefined) sanitizedUpdates.isPaydayOnly = Boolean(updates.isPaydayOnly);
    if (updates.flashHourStart !== undefined) sanitizedUpdates.flashHourStart = updates.flashHourStart !== null && updates.flashHourStart !== '' ? Number(updates.flashHourStart) : null;
    if (updates.flashHourEnd !== undefined) sanitizedUpdates.flashHourEnd = updates.flashHourEnd !== null && updates.flashHourEnd !== '' ? Number(updates.flashHourEnd) : null;
    if (updates.totalUsageLimit !== undefined) sanitizedUpdates.totalUsageLimit = updates.totalUsageLimit ? Number(updates.totalUsageLimit) : null;
    if (updates.usageLimitPerCustomer !== undefined) sanitizedUpdates.usageLimitPerCustomer = Number(updates.usageLimitPerCustomer) || 1;
    if (updates.isActive !== undefined) sanitizedUpdates.isActive = Boolean(updates.isActive);
    if (updates.startDate !== undefined) sanitizedUpdates.startDate = updates.startDate || null;
    if (updates.endDate !== undefined) sanitizedUpdates.endDate = updates.endDate || null;

    await updateDoc(promoRef, sanitizedUpdates);

    const updatedSnap = await getDoc(promoRef);
    return NextResponse.json({ id, ...cleanTimestamps(updatedSnap.data()) });
  } catch (err: any) {
    console.error('Error updating promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    cacheStore.invalidatePromos();
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
