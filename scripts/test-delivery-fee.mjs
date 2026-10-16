import assert from 'node:assert/strict';
import { calculateDeliveryFee, calculateRoadDistanceFallback, normalizeDeliveryRate } from '../tgcloud/lib/delivery-fee.js';

assert.equal(calculateDeliveryFee({
  baseFare: 10, firstMile: 2, firstMileFee: 3, exceedingKmFee: 5, surcharge: 2, nightDifferential: 0,
}, 3), 23, 'Fee must combine base, first-mile, excess distance, and surcharge');
assert.equal(calculateDeliveryFee({
  baseFare: 10, firstMile: 2, firstMileFee: 3, exceedingKmFee: 5, surcharge: 2, nightDifferential: 0,
}, 0), 12, 'Zero distance still includes configured base fare and surcharge');
assert.equal(calculateDeliveryFee({
  baseFare: -10, firstMile: -2, firstMileFee: -3, exceedingKmFee: -5, surcharge: -2, nightDifferential: -1,
}, -4), 0, 'Negative rates and distance must never produce a negative fee');
assert.equal(normalizeDeliveryRate({ base_fare: 8, first_mile: 1, first_mile_fee: 2, exceeding_km_fee: 4 }).baseFare, 8,
  'Rate normalizer must accept the existing snake_case field shape');
assert.equal(calculateRoadDistanceFallback(14.5, 121, 14.5, 121), 0, 'Same origin and destination must return zero distance');
const oneDegree = calculateRoadDistanceFallback(0, 0, 1, 0);
assert.ok(oneDegree > 140 && oneDegree < 150, 'Fallback road distance must be a 1.3x straight-line estimate');
console.log('Delivery fee tests passed.');
