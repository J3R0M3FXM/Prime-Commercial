import assert from 'node:assert/strict';
import { calculatePromoDiscount, deserializePromo, serializePromoDescription } from '../tgcloud/lib/promos.js';
import { calculateCustomerTier } from '../tgcloud/lib/loyalty.js';
import { resolveTrustedFingerprint } from '../tgcloud/lib/fingerprints.js';

const original = {
  description: 'Weekend offer',
  voucherType: 'shipping_voucher',
  customerEligibility: 'tier_restricted',
  minItemQuantity: 3,
  minPreviousOrders: 2,
  eligibleTiers: ['GOLD', 'PLATINUM'],
  allowedPaymentMethods: ['gcash', 'maya'],
  allowedCourierIds: ['courier-1'],
  activeDaysOfWeek: [5, 6],
  isPaydayOnly: true,
  flashHourStart: 18,
  flashHourEnd: 22,
  cappedShippingDiscount: 120,
  cashbackPercentage: 5,
};
const existingDescription = JSON.stringify({ realDescription: 'Old description', futureEligibilityRule: { region: 'PH', version: 2 } });
const description = serializePromoDescription(original, existingDescription);
assert.deepEqual(JSON.parse(description).futureEligibilityRule, { region: 'PH', version: 2 }, 'Unknown metadata keys must survive edits');
const decoded = deserializePromo({
  id: 'promo_test',
  code: 'WEEKEND',
  title: 'Weekend',
  description,
  discountType: 'percentage',
  discountValue: 10,
  maxDiscountAmount: 250,
  minSpend: 500,
  totalUsageLimit: 100,
  usageCount: 7,
  usageLimitPerCustomer: 1,
  isActive: true,
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: new Date('2026-10-31T23:59:59.000Z'),
});
for (const key of [
  'description', 'voucherType', 'customerEligibility', 'minItemQuantity',
  'minPreviousOrders', 'eligibleTiers', 'allowedPaymentMethods',
  'allowedCourierIds', 'activeDaysOfWeek', 'isPaydayOnly', 'flashHourStart',
  'flashHourEnd', 'cappedShippingDiscount', 'cashbackPercentage',
]) {
  assert.deepEqual(decoded[key], original[key], 'Promo metadata must round-trip: ' + key);
}
assert.equal(decoded.discountType, 'percentage');
assert.equal(decoded.discountValue, 10);
assert.equal(decoded.usageCount, 7);
assert.equal(decoded.totalUsageLimit, 100);
console.log('Promo metadata round-trip tests passed.');

assert.equal(calculatePromoDiscount({ discountType: 'fixed', discountValue: 80 }, 50, 20).discount, 50,
  'Fixed promo discount must not exceed item subtotal');
assert.equal(calculatePromoDiscount({ discountType: 'percentage', discountValue: 20, maxDiscountAmount: 30 }, 500, 20).discount, 30,
  'Percentage promo discount must respect its cap');
assert.equal(calculatePromoDiscount({ discountType: 'shipping_discount', discountValue: 50 }, 500, 120).shippingSubsidy, 50,
  'Shipping promo must cap the subsidy');
assert.equal(calculatePromoDiscount({ discountType: 'coins_cashback', cashbackPercentage: 5 }, 999, 20).cashbackPoints, 49,
  'Cashback promo must floor points without reducing upfront discount');

const now = new Date('2026-10-17T00:00:00.000Z');
assert.equal(calculateCustomerTier([], now).tier, 'Silver', 'Tier defaults must remain Silver for customers without completed orders');
const tier = calculateCustomerTier([{ status: 'delivered', subtotal: 6000, createdAt: new Date('2026-10-10T00:00:00.000Z') }], now);
assert.equal(tier.tier, 'Bronze', 'Tier calculation must apply the current 30-day spending cycle');
assert.equal(tier.progressPercent, 20, 'Tier progress must reflect spending toward the next tier');
const trusted = resolveTrustedFingerprint({ fingerprints: [{ deviceId: 'device-1', hardwareId: 'hardware-1', deviceFingerprintId: 'fp-1', sessionToken: 'session-1' }] }, { hardwareId: 'hardware-1' });
assert.equal(trusted.deviceFingerprintId, 'fp-1', 'Fingerprint resolution must recover stored identifiers by hardware ID');

assert.equal(calculatePromoDiscount({ discountType: 'percentage', discountValue: 10 }, Infinity, Infinity).discount, 0,
  'Non-finite client-supplied amounts must not create an unbounded discount');
