import assert from 'node:assert/strict';
import { calculateDeliveryFee, calculateRoadDistanceFallback, normalizeDeliveryRate } from '../tgcloud/lib/delivery-fee.js';

assert.equal(calculateDeliveryFee({
  baseFare: 10, firstMile: 2, firstMileFee: 3, exceedingKmFee: 5, surcharge: 2, nightDifferential: 0,
}, 3), 23, 'Fee must combine base, first-mile, excess distance, and surcharge');
assert.equal(calculateDeliveryFee({
  baseFare: 10, firstMile: 2, firstMileFee: 3, exceedingKmFee: 5, surcharge: 2, nightDifferential: 0,
  timeBasedFeePerMinute: 1.25,
}, 3, 4), 28, 'Time fee must be added before the final whole-peso rounding');
assert.equal(calculateDeliveryFee({ baseFare: 10.49 }, 0), 10, 'Final delivery fee must round to the nearest whole peso');
assert.equal(calculateDeliveryFee({ baseFare: 10.5 }, 0), 11, 'Half-peso delivery fee must round up');
assert.equal(calculateDeliveryFee({ baseFare: 10, timeBasedFeePerMinute: 5 }, 0, null), 10,
  'Time fee must be omitted when route time is unavailable');
assert.equal(calculateDeliveryFee({
  baseFare: 10, firstMile: 2, firstMileFee: 3, exceedingKmFee: 5, surcharge: 2, nightDifferential: 0,
}, 0), 12, 'Zero distance still includes configured base fare and surcharge');
assert.equal(calculateDeliveryFee({
  baseFare: -10, firstMile: -2, firstMileFee: -3, exceedingKmFee: -5, surcharge: -2, nightDifferential: -1,
}, -4), 0, 'Negative rates and distance must never produce a negative fee');
assert.equal(normalizeDeliveryRate({ base_fare: 8, first_mile: 1, first_mile_fee: 2, exceeding_km_fee: 4 }).baseFare, 8,
  'Rate normalizer must accept the existing snake_case field shape');
assert.equal(normalizeDeliveryRate({ time_based_fee_per_minute: 2 }).timeBasedFeePerMinute, 2,
  'Time-based courier rate must normalize from the database column');
const decreasingBands = { baseFare: 50, pricingBands: [
  { fromKm: 0, toKm: 3, ratePerKm: 6.5 },
  { fromKm: 3, toKm: 7, ratePerKm: 6.2 },
  { fromKm: 7, toKm: null, ratePerKm: 5 },
] };
assert.equal(calculateDeliveryFee(decreasingBands, 9), 104,
  'Decreasing band rates must charge only the kilometres within each band');
const increasingBands = { baseFare: 50, pricingBands: [
  { fromKm: 0, toKm: 2, ratePerKm: 0 },
  { fromKm: 2, toKm: 7, ratePerKm: 10 },
  { fromKm: 7, toKm: null, ratePerKm: 15 },
] };
assert.equal(calculateDeliveryFee(increasingBands, 9), 130,
  'Base-included distance and increasing band rates must calculate correctly');
assert.equal(normalizeDeliveryRate(increasingBands).pricingBands.at(-1).toKm, null,
  'An open-ended final band must remain open-ended');
assert.equal(calculateRoadDistanceFallback(14.5, 121, 14.5, 121), 0, 'Same origin and destination must return zero distance');
const oneDegree = calculateRoadDistanceFallback(0, 0, 1, 0);
assert.ok(oneDegree > 140 && oneDegree < 150, 'Fallback road distance must be a 1.3x straight-line estimate');
console.log('Delivery fee tests passed.');
