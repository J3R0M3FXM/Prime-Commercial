import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { calculatePromoDiscount, type PromoConfig } from '@/lib/promos';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      code, 
      itemsSubtotal = 0, 
      deliveryFee = 0, 
      customerId = '', 
      primeMemberId = '',
      deviceId = '', 
      hardwareId = '' 
    } = body;

    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) {
      return NextResponse.json({ valid: false, error: 'Promo code is required.' }, { status: 400 });
    }

    // 1. Look up promo in Firestore
    const promosCol = collection(db, 'promos');
    const q = query(promosCol, where('code', '==', cleanCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      return NextResponse.json({ valid: false, error: 'Promo code does not exist or is invalid.' });
    }

    const promoDoc = snap.docs[0];
    const promo = { id: promoDoc.id, ...promoDoc.data() } as PromoConfig;

    // 2. Active Toggle Switch
    if (promo.isActive === false) {
      return NextResponse.json({ valid: false, error: 'This promo code is currently inactive.' });
    }

    // 3. Validity dates
    const nowIso = new Date().toISOString();
    if (promo.startDate && promo.startDate > nowIso) {
      return NextResponse.json({ valid: false, error: `This promo will become active on ${new Date(promo.startDate).toLocaleDateString()}.` });
    }
    if (promo.endDate && promo.endDate < nowIso) {
      return NextResponse.json({ valid: false, error: 'This promo code has expired.' });
    }

    // 4. Minimum spend requirement
    const subtotalNum = Number(itemsSubtotal) || 0;
    if (promo.minSpend && promo.minSpend > 0 && subtotalNum < promo.minSpend) {
      return NextResponse.json({ 
        valid: false, 
        error: `Minimum spend of ₱${Number(promo.minSpend).toLocaleString()} on items is required for this promo.` 
      });
    }

    // 5. Total usage quota
    if (promo.totalUsageLimit && promo.totalUsageLimit > 0) {
      const currentUses = Number(promo.usageCount || 0);
      if (currentUses >= promo.totalUsageLimit) {
        return NextResponse.json({ valid: false, error: 'This promo code has reached its total usage limit.' });
      }
    }

    // 6. Device Fingerprinting Anti-Fraud:
    // Check if multiple accounts are attempting to redeem this promo using the same Device ID or Hardware ID
    const redemptionsCol = collection(db, 'promo_redemptions');
    const cleanDevId = String(deviceId || '').trim();
    const cleanHwId = String(hardwareId || '').trim();

    if (cleanDevId || cleanHwId) {
      // Query redemptions for this promo code
      const redQ = query(redemptionsCol, where('promoCode', '==', cleanCode));
      const redSnap = await getDocs(redQ);

      const deviceRedemptions = redSnap.docs.filter(d => {
        const data = d.data();
        const matchesDev = cleanDevId && data.deviceId && String(data.deviceId).trim() === cleanDevId;
        const matchesHw = cleanHwId && data.hardwareId && String(data.hardwareId).trim() === cleanHwId;
        return matchesDev || matchesHw;
      });

      // If redeemed from this device before by ANY DIFFERENT account:
      const otherAccountRedemptions = deviceRedemptions.filter(d => {
        const data = d.data();
        const isSameCust = customerId && data.customerId === customerId;
        const isSamePrime = primeMemberId && data.primeMemberId === primeMemberId;
        return !isSameCust && !isSamePrime;
      });

      if (otherAccountRedemptions.length > 0) {
        return NextResponse.json({ 
          valid: false, 
          error: 'Promo abuse detected: This promo code has already been claimed on this device under another account.' 
        });
      }

      // Check per-customer usage limit
      const perCustomerLimit = Number(promo.usageLimitPerCustomer) || 1;
      const customerRedemptions = redSnap.docs.filter(d => {
        const data = d.data();
        return (customerId && data.customerId === customerId) || 
               (primeMemberId && data.primeMemberId === primeMemberId) ||
               (cleanDevId && data.deviceId === cleanDevId);
      });

      if (customerRedemptions.length >= perCustomerLimit) {
        return NextResponse.json({ 
          valid: false, 
          error: `You have already redeemed this promo code (Limit: ${perCustomerLimit} use${perCustomerLimit > 1 ? 's' : ''} per customer).` 
        });
      }
    }

    // 7. Calculate discount
    const { discount, isFreeShipping } = calculatePromoDiscount(promo, subtotalNum, Number(deliveryFee) || 0);

    return NextResponse.json({
      valid: true,
      code: promo.code,
      promoId: promo.id,
      title: promo.title,
      description: promo.description || '',
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountAmount: discount,
      isFreeShipping,
      maxDiscountAmount: promo.maxDiscountAmount || null,
      minSpend: promo.minSpend || 0
    });
  } catch (err: any) {
    console.error('Promo validate error:', err);
    return NextResponse.json({ valid: false, error: err.message || 'Validation failed.' }, { status: 500 });
  }
}
