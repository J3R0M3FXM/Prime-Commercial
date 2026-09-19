import { NextResponse } from 'next/server';
import { 
  getPromosFromDb, 
  getPromoByCodeFromDb, 
  createPromoInDb, 
  updatePromoInDb, 
  deletePromoInDb,
  getPromoRedemptionsFromDb
} from '@/lib/db-adapter';
import { generatePromoCode } from '@/lib/promos';
import { cacheStore } from '@/lib/cache';

export const dynamic = 'force-dynamic';

const PROMOS_CACHE_TTL_MS = 60000; // 60 seconds

export async function GET() {
  try {
    const now = Date.now();
    if (cacheStore.promos && (now - cacheStore.lastPromosFetchTime < PROMOS_CACHE_TTL_MS)) {
      return NextResponse.json(cacheStore.promos);
    }

    const promos = await getPromosFromDb();
    const allRedemptions = await getPromoRedemptionsFromDb(200);

    const promosWithStats = promos.map((p: any) => {
      if (!p) return null;
      const code = p.code;
      const redemptions = allRedemptions.filter((r: any) => r.promoCode === code || r.promoId === p.id);
      
      // Check device fraud in redemptions: devices associated with multiple customer IDs
      const deviceToCustomers = new Map<string, Set<string>>();
      let abuseFlagCount = 0;

      redemptions.forEach((r: any) => {
        const dev = r.deviceId;
        const cust = r.customerId;
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
        ...p,
        usageCount: redemptions.length,
        redemptions: redemptions.slice(-10), // latest 10
        fraudFlagsCount: abuseFlagCount
      };
    }).filter(Boolean);

    cacheStore.promos = promosWithStats;
    cacheStore.lastPromosFetchTime = now;

    return NextResponse.json(promosWithStats);
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
    const existing = await getPromoByCodeFromDb(cleanCode);
    if (existing) {
      return NextResponse.json({ error: `A promo with code "${cleanCode}" already exists.` }, { status: 400 });
    }

    const promoId = `promo_${Date.now()}`;
    const newPromo = await createPromoInDb({
      id: promoId,
      code: cleanCode,
      title: title || `${cleanCode} Promo`,
      description: description || '',
      voucherType,
      discountType,
      discountValue: Number(discountValue) || 0,
      maxDiscountAmount: maxDiscountAmount ? Number(maxDiscountAmount) : undefined,
      cappedShippingDiscount: cappedShippingDiscount ? Number(cappedShippingDiscount) : undefined,
      cashbackPercentage: cashbackPercentage ? Number(cashbackPercentage) : undefined,
      minSpend: minSpend ? Number(minSpend) : 0,
      minItemQuantity: minItemQuantity ? Number(minItemQuantity) : undefined,
      customerEligibility,
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
      endDate: endDate || undefined
    });

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

    const updatedPromo = await updatePromoInDb(id, updates);
    return NextResponse.json(updatedPromo);
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

    await deletePromoInDb(id);
    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('Error deleting promo:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
