function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function normalizeDeliveryRate(raw) {
  const bands = Array.isArray(raw?.pricingBands) ? raw.pricingBands : [];
  return {
    baseFare: money(raw?.baseFare ?? raw?.base_fare),
    firstMile: money(raw?.firstMile ?? raw?.first_mile),
    firstMileFee: money(raw?.firstMileFee ?? raw?.first_mile_fee),
    exceedingKmFee: money(raw?.exceedingKmFee ?? raw?.exceeding_km_fee),
    surcharge: money(raw?.surcharge),
    nightDifferential: money(raw?.nightDifferential ?? raw?.night_differential),
    timeBasedFeePerMinute: money(raw?.timeBasedFeePerMinute ?? raw?.time_based_fee_per_minute),
    maxDistanceKm: Number.isFinite(Number(raw?.maxDistanceKm)) && Number(raw.maxDistanceKm) > 0 ? Number(raw.maxDistanceKm) : null,
    pricingBands: bands.map((band) => ({ fromKm: Math.max(0, Number(band?.fromKm) || 0), toKm: Number.isFinite(Number(band?.toKm)) ? Number(band.toKm) : null, ratePerKm: money(band?.ratePerKm) })).filter((band) => band.ratePerKm >= 0).sort((a,b) => a.fromKm-b.fromKm),
  };
}

export function calculateDeliveryFee(raw, distanceKm, routeTimeMinutes = null) {
  const rate = normalizeDeliveryRate(raw);
  const distance = Math.max(0, Number(distanceKm) || 0);
  const routeMinutes = Number(routeTimeMinutes);
  let distanceFee;
  if (rate.pricingBands.length) {
    distanceFee = rate.pricingBands.reduce((sum, band, index) => {
      const start = Math.max(0, band.fromKm);
      const end = band.toKm == null ? distance : Math.min(distance, band.toKm);
      return sum + Math.max(0, end - start) * band.ratePerKm;
    }, 0);
  } else {
    const includedKm = Math.min(distance, rate.firstMile);
    const excessKm = Math.max(0, distance - rate.firstMile);
    distanceFee = includedKm * rate.firstMileFee + excessKm * rate.exceedingKmFee;
  }
  const fee = rate.baseFare + distanceFee + rate.surcharge + rate.nightDifferential +
    (Number.isFinite(routeMinutes) && routeMinutes > 0 ? rate.timeBasedFeePerMinute * routeMinutes : 0);
  // Delivery fares are charged in whole Philippine pesos. Round once, after
  // combining every configured component, so quote and order totals agree.
  return Math.round(Math.max(0, fee));
}

export function calculateRoadDistanceFallback(originLat, originLon, destinationLat, destinationLon) {
  const R = 6371;
  const dLat = (destinationLat - originLat) * Math.PI / 180;
  const dLon = (destinationLon - originLon) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(originLat * Math.PI / 180) * Math.cos(destinationLat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const straightLineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0, Math.round(straightLineKm * 1.3 * 100) / 100);
}
