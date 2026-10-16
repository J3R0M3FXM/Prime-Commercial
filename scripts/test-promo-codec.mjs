import assert from 'node:assert/strict';
import { deserializePromo, serializePromoDescription } from '../tgcloud/lib/promos.js';

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
