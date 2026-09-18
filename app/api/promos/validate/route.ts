import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { calculatePromoDiscount, type PromoConfig } from '@/lib/promos';
import { calculateCustomerTier } from '@/lib/points-system';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      code, 
      itemsSubtotal = 0, 
      itemQuantity = 0,
      totalItems = 0,
      deliveryFee = 0, 
      customerId = '', 
      primeMemberId = '',
      customerTier = '',
      paymentMethod = '',
      courierId = '',
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

    // 4. Philippine Schedule & Flash Windows (PHT / UTC+8)
    const now = new Date();
    // PHT is UTC+8
    const phtDateObj = new Date(now.getTime() + (8 * 60 + now.getTimezoneOffset()) * 60000);
    const phtDay = phtDateObj.getDay(); // 0=Sun, 6=Sat
    const phtDate = phtDateObj.getDate(); // 1-31
    const phtHour = phtDateObj.getHours(); // 0-23

    // 4a. Active Days of Week
    if (Array.isArray(promo.activeDaysOfWeek) && promo.activeDaysOfWeek.length > 0 && promo.activeDaysOfWeek.length < 7) {
      if (!promo.activeDaysOfWeek.includes(phtDay)) {
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const validDays = promo.activeDaysOfWeek.map(d => dayNames[d]).join(', ');
        return NextResponse.json({ 
          valid: false, 
          error: `This promo is only valid on selected days (${validDays}).` 
        });
      }
    }

    // 4b. Payday Sale Restriction (14th, 15th, 16th or 28th to end of month)
    if (promo.isPaydayOnly) {
      const isPaydayWindow = (phtDate >= 14 && phtDate <= 16) || phtDate >= 28;
      if (!isPaydayWindow) {
        return NextResponse.json({ 
          valid: false, 
          error: 'This promo is exclusive to the Payday Sale (15th and end-of-month).' 
        });
      }
    }

    // 4c. Flash Hour Restriction
    if (promo.flashHourStart !== undefined && promo.flashHourStart !== null && 
        promo.flashHourEnd !== undefined && promo.flashHourEnd !== null) {
      const startH = Number(promo.flashHourStart);
      const endH = Number(promo.flashHourEnd);
      if (phtHour < startH || phtHour >= endH) {
        const fmtH = (h: number) => {
          const ampm = h >= 12 ? 'PM' : 'AM';
          const hr = h % 12 === 0 ? 12 : h % 12;
          return `${hr}:00 ${ampm}`;
        };
        return NextResponse.json({ 
          valid: false, 
          error: `This flash voucher is active only between ${fmtH(startH)} and ${fmtH(endH)} (Philippine Time).` 
        });
      }
    }

    // 5. Minimum spend requirement
    const subtotalNum = Number(itemsSubtotal) || 0;
    if (promo.minSpend && promo.minSpend > 0 && subtotalNum < promo.minSpend) {
      return NextResponse.json({ 
        valid: false, 
        error: `Minimum spend of ₱${Number(promo.minSpend).toLocaleString()} on items is required for this promo.` 
      });
    }

    // 5b. Minimum Item Quantity requirement
    const effectiveQuantity = Number(itemQuantity || totalItems) || 0;
    if (promo.minItemQuantity && promo.minItemQuantity > 0 && effectiveQuantity > 0 && effectiveQuantity < promo.minItemQuantity) {
      return NextResponse.json({ 
        valid: false, 
        error: `Minimum of ${promo.minItemQuantity} item${promo.minItemQuantity > 1 ? 's' : ''} in cart is required for this promo.` 
      });
    }

    // 6. Target Audience & Customer Eligibility
    let completedOrdersCount = 0;
    let computedTier = (customerTier || 'MEMBER').toUpperCase();

    if (customerId || primeMemberId) {
      try {
        const ordersCol = collection(db, 'orders');
        const qCust = query(
          ordersCol, 
          where(customerId ? 'customerId' : 'primeMemberId', '==', customerId || primeMemberId)
        );
        const ordSnap = await getDocs(qCust);
        const completedDocs = ordSnap.docs.filter(d => {
          const st = String(d.data().status || '').toLowerCase();
          return st === 'delivered' || st === 'completed';
        });
        completedOrdersCount = completedDocs.length;
        if (!customerTier) {
          computedTier = calculateCustomerTier(completedDocs.map(d => d.data())).tier;
        }
      } catch (err) {
        console.warn('Customer order lookup error in promo validation:', err);
      }
    }

    // 6a. New Customer Only
    if (promo.customerEligibility === 'new_customer') {
      if (completedOrdersCount > 0) {
        return NextResponse.json({ 
          valid: false, 
          error: 'This voucher is exclusive to new customers on their first completed order.' 
        });
      }
    }

    // 6b. Minimum Completed Orders Required
    if (promo.customerEligibility === 'min_orders') {
      const reqOrders = Number(promo.minPreviousOrders) || 1;
      if (completedOrdersCount < reqOrders) {
        return NextResponse.json({ 
          valid: false, 
          error: `This voucher is exclusive to regular buyers with at least ${reqOrders} completed order${reqOrders > 1 ? 's' : ''}.` 
        });
      }
    }

    // 6c. Tier-Restricted
    if (promo.customerEligibility === 'tier_restricted') {
      const allowedTiers = Array.isArray(promo.eligibleTiers) ? promo.eligibleTiers.map(t => t.toUpperCase()) : [];
      if (allowedTiers.length > 0 && !allowedTiers.includes(computedTier)) {
        return NextResponse.json({ 
          valid: false, 
          error: `This voucher is exclusive to ${allowedTiers.join(', ')} tier members (Current: ${computedTier}).` 
        });
      }
    }

    // 7. Payment Method Restriction
    if (paymentMethod && Array.isArray(promo.allowedPaymentMethods) && promo.allowedPaymentMethods.length > 0) {
      const cleanPm = paymentMethod.toLowerCase().trim();
      const hasAll = promo.allowedPaymentMethods.includes('all');
      if (!hasAll && !promo.allowedPaymentMethods.includes(cleanPm)) {
        const readableMethods = promo.allowedPaymentMethods.map(m => {
          if (m === 'gcash') return 'GCash';
          if (m === 'maya') return 'Maya';
          if (m === 'bank_transfer') return 'Bank Transfer';
          if (m === 'upon_delivery') return 'Cash Upon Delivery';
          return m.toUpperCase();
        }).join(' or ');
        return NextResponse.json({ 
          valid: false, 
          error: `This voucher is exclusive to ${readableMethods} payment.` 
        });
      }
    }

    // 8. Courier / Logistics Restriction
    if (courierId && Array.isArray(promo.allowedCourierIds) && promo.allowedCourierIds.length > 0) {
      const hasAll = promo.allowedCourierIds.includes('all');
      if (!hasAll && !promo.allowedCourierIds.includes(courierId)) {
        return NextResponse.json({ 
          valid: false, 
          error: 'This voucher is not applicable to the selected delivery courier.' 
        });
      }
    }

    // 9. Total usage quota
    if (promo.totalUsageLimit && promo.totalUsageLimit > 0) {
      const currentUses = Number(promo.usageCount || 0);
      if (currentUses >= promo.totalUsageLimit) {
        return NextResponse.json({ valid: false, error: 'This promo code has reached its total usage limit.' });
      }
    }

    // 10. Device Fingerprinting Anti-Fraud & Per-Customer Usage Limit:
    const redemptionsCol = collection(db, 'promo_redemptions');
    const cleanDevId = String(deviceId || '').trim();
    const cleanHwId = String(hardwareId || '').trim();

    if (cleanDevId || cleanHwId || customerId || primeMemberId) {
      // Query redemptions for this promo code
      const redQ = query(redemptionsCol, where('promoCode', '==', cleanCode));
      const redSnap = await getDocs(redQ);

      // Check device fraud
      if (cleanDevId || cleanHwId) {
        const deviceRedemptions = redSnap.docs.filter(d => {
          const data = d.data();
          const matchesDev = cleanDevId && data.deviceId && String(data.deviceId).trim() === cleanDevId;
          const matchesHw = cleanHwId && data.hardwareId && String(data.hardwareId).trim() === cleanHwId;
          return matchesDev || matchesHw;
        });

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

    // 11. Calculate discount & subsidies
    const discCalc = calculatePromoDiscount(promo, subtotalNum, Number(deliveryFee) || 0);

    return NextResponse.json({
      valid: true,
      code: promo.code,
      promoId: promo.id,
      title: promo.title,
      description: promo.description || '',
      voucherType: promo.voucherType || 'shop_voucher',
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      discountAmount: discCalc.discount,
      isFreeShipping: discCalc.isFreeShipping,
      shippingSubsidy: discCalc.shippingSubsidy,
      cashbackPoints: discCalc.cashbackPoints,
      maxDiscountAmount: promo.maxDiscountAmount || null,
      minSpend: promo.minSpend || 0,
      minItemQuantity: promo.minItemQuantity || 0
    });
  } catch (err: any) {
    console.error('Promo validate error:', err);
    return NextResponse.json({ valid: false, error: err.message || 'Validation failed.' }, { status: 500 });
  }
}
