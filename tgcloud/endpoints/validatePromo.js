import { db } from 'sdk';
import { and, asc, eq, isNull, or } from 'sdk/db';
import { calculateCustomerTier } from '../lib/loyalty.js';
import { resolveTrustedFingerprint } from '../lib/fingerprints.js';
import { calculatePromoDiscount, deserializePromo } from '../lib/promos.js';
import { customers, orders, promoRedemptions, promos } from '../schema.js';

const fail = (error) => ({ valid: false, error });

export default async function (input, ctx) {
  const telegramId = ctx?.initData?.user?.id == null ? '' : String(ctx.initData.user.id);
  if (!/^[0-9]+$/.test(telegramId)) return fail('Telegram authentication required.');

  const customer = await db.select().from(customers).where(eq(customers.tgUserId, telegramId)).get();
  if (!customer) return fail('Customer account not found. Please reopen the Mini App and try again.');

  const code = String(input?.code || '').trim().toUpperCase();
  if (!code) return fail('Promo code is required.');

  const rawPromo = await db.select().from(promos).where(eq(promos.code, code)).get();
  if (!rawPromo) return fail('Promo code does not exist or is invalid.');
  const promo = deserializePromo(rawPromo);
  if (promo.isActive === false) return fail('This promo code is currently inactive.');

  const now = new Date();
  if (promo.startDate && new Date(promo.startDate).getTime() > now.getTime()) {
    return fail('This promo is not active yet.');
  }
  if (promo.endDate && new Date(promo.endDate).getTime() < now.getTime()) {
    return fail('This promo code has expired.');
  }

  // Telegram Serverless runs independently of the Next.js server timezone.
  const pht = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const phtDay = pht.getUTCDay();
  const phtDate = pht.getUTCDate();
  const phtHour = pht.getUTCHours();
  if (Array.isArray(promo.activeDaysOfWeek) && promo.activeDaysOfWeek.length > 0 &&
      promo.activeDaysOfWeek.length < 7 && !promo.activeDaysOfWeek.includes(phtDay)) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return fail('This promo is only valid on selected days (' + promo.activeDaysOfWeek.map((day) => names[day]).join(', ') + ').');
  }
  if (promo.isPaydayOnly && !((phtDate >= 14 && phtDate <= 16) || phtDate >= 28)) {
    return fail('This promo is exclusive to the Payday Sale (15th and end-of-month).');
  }
  if (promo.flashHourStart != null && promo.flashHourEnd != null &&
      (phtHour < Number(promo.flashHourStart) || phtHour >= Number(promo.flashHourEnd))) {
    return fail('This flash voucher is not within its Philippine Time active window.');
  }

  const subtotalRaw = Number(input?.itemsSubtotal);
  const quantityRaw = Number(input?.itemQuantity ?? input?.totalItems);
  const deliveryRaw = Number(input?.deliveryFee);
  const subtotal = Number.isFinite(subtotalRaw) ? Math.max(0, subtotalRaw) : 0;
  const itemQuantity = Number.isFinite(quantityRaw) ? Math.max(0, quantityRaw) : 0;
  const deliveryFee = Number.isFinite(deliveryRaw) ? Math.max(0, deliveryRaw) : 0;
  if (promo.minSpend > 0 && subtotal < promo.minSpend) {
    return fail('Minimum spend of ₱' + Number(promo.minSpend).toLocaleString() + ' on items is required for this promo.');
  }
  if (promo.minItemQuantity > 0 && itemQuantity > 0 && itemQuantity < promo.minItemQuantity) {
    return fail('Minimum of ' + promo.minItemQuantity + ' items in cart is required for this promo.');
  }

  const ownership = [eq(orders.customerId, customer.id)];
  if (customer.primeMemberId) ownership.push(eq(orders.primeMemberId, customer.primeMemberId));
  const orderRows = await db.select({
    status: orders.status,
    subtotal: orders.subtotal,
    createdAt: orders.createdAt,
    deliveredAt: orders.deliveredAt,
  }).from(orders).where(ownership.length === 1 ? ownership[0] : or(...ownership))
    .orderBy(asc(orders.createdAt)).all();
  const completedOrders = orderRows.filter((order) => ['delivered', 'completed'].includes(String(order.status || '').toLowerCase()));
  const tierInfo = calculateCustomerTier(completedOrders);
  const completedCount = completedOrders.length;
  const customerTier = String(tierInfo.tier || 'Silver');
  const tierForComparison = customerTier.toUpperCase();

  if (promo.customerEligibility === 'new_customer' && completedCount > 0) {
    return fail('This voucher is exclusive to new customers on their first completed order.');
  }
  if (promo.customerEligibility === 'min_orders') {
    const required = Number(promo.minPreviousOrders) || 1;
    if (completedCount < required) return fail('This voucher requires at least ' + required + ' completed order' + (required > 1 ? 's' : '') + '.');
  }
  if (promo.customerEligibility === 'tier_restricted') {
    const tiers = Array.isArray(promo.eligibleTiers) ? promo.eligibleTiers.map((tier) => String(tier).toUpperCase()) : [];
    if (tiers.length > 0 && !tiers.includes(tierForComparison)) {
      return fail('This voucher is exclusive to ' + tiers.join(', ') + ' tier members (Current: ' + tierForComparison + ').');
    }
  }

  const paymentMethod = String(input?.paymentMethod || '').trim().toLowerCase();
  if (paymentMethod && Array.isArray(promo.allowedPaymentMethods) && promo.allowedPaymentMethods.length > 0 &&
      !promo.allowedPaymentMethods.includes('all') && !promo.allowedPaymentMethods.map((value) => String(value).toLowerCase()).includes(paymentMethod)) {
    return fail('This voucher is not applicable to the selected payment method.');
  }
  const courierId = String(input?.courierId || '').trim();
  if (courierId && Array.isArray(promo.allowedCourierIds) && promo.allowedCourierIds.length > 0 &&
      !promo.allowedCourierIds.includes('all') && !promo.allowedCourierIds.includes(courierId)) {
    return fail('This voucher is not applicable to the selected delivery courier.');
  }
  if (promo.totalUsageLimit && promo.totalUsageLimit > 0 && Number(promo.usageCount || 0) >= promo.totalUsageLimit) {
    return fail('This promo code has reached its total usage limit.');
  }

  const fingerprint = resolveTrustedFingerprint(customer, {
    deviceId: input?.deviceId,
    hardwareId: input?.hardwareId,
    deviceFingerprintId: input?.deviceFingerprintId,
    sessionToken: input?.sessionToken,
  });
  const redemptions = await db.select().from(promoRedemptions)
    .where(and(eq(promoRedemptions.promoCode, code), isNull(promoRedemptions.releasedAt))).all();

  if (fingerprint.deviceId || fingerprint.hardwareId || fingerprint.deviceFingerprintId) {
    const deviceMatches = redemptions.filter((redemption) =>
      (fingerprint.deviceId && redemption.deviceId && String(redemption.deviceId).trim() === fingerprint.deviceId) ||
      (fingerprint.hardwareId && redemption.hardwareId && String(redemption.hardwareId).trim() === fingerprint.hardwareId) ||
      (fingerprint.deviceFingerprintId && redemption.deviceFingerprintId &&
        String(redemption.deviceFingerprintId).trim() === fingerprint.deviceFingerprintId)
    );
    if (deviceMatches.some((redemption) => redemption.customerId && redemption.customerId !== customer.id)) {
      return fail('Promo abuse detected: this promo was already claimed from the same device under another account.');
    }
  }

  const customerRedemptions = redemptions.filter((redemption) => redemption.customerId === customer.id);
  const perCustomerLimit = Number(promo.usageLimitPerCustomer) || 1;
  if (customerRedemptions.length >= perCustomerLimit) {
    return fail('You have already redeemed this promo code (limit: ' + perCustomerLimit + ' use' + (perCustomerLimit > 1 ? 's' : '') + ' per customer).');
  }

  const discount = calculatePromoDiscount(promo, subtotal, deliveryFee);
  return {
    valid: true,
    code: promo.code,
    promoId: promo.id,
    title: promo.title,
    description: promo.description || '',
    voucherType: promo.voucherType || 'shop_voucher',
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discountAmount: discount.discount,
    isFreeShipping: discount.isFreeShipping,
    shippingSubsidy: discount.shippingSubsidy,
    cashbackPoints: discount.cashbackPoints,
    maxDiscountAmount: promo.maxDiscountAmount || null,
    minSpend: promo.minSpend || 0,
    minItemQuantity: promo.minItemQuantity || 0,
    customerTier,
  };
}
