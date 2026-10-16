function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function normalizeDeliveryRate(raw) {
  return {
    baseFare: money(raw?.baseFare ?? raw?.base_fare),
    firstMile: money(raw?.firstMile ?? raw?.first_mile),
    firstMileFee: money(raw?.firstMileFee ?? raw?.first_mile_fee),
    exceedingKmFee: money(raw?.exceedingKmFee ?? raw?.exceeding_km_fee),
    surcharge: money(raw?.surcharge),
    nightDifferential: money(raw?.nightDifferential ?? raw?.night_differential),
  };
}

export function calculateDeliveryFee(raw, distanceKm) {
  const rate = normalizeDeliveryRate(raw);
  const distance = Math.max(0, Number(distanceKm) || 0);
  const includedKm = Math.min(distance, rate.firstMile);
  const excessKm = Math.max(0, distance - rate.firstMile);
  const fee = rate.baseFare + includedKm * rate.firstMileFee +
    excessKm * rate.exceedingKmFee + rate.surcharge + rate.nightDifferential;
  return Math.round(Math.max(0, fee) * 100) / 100;
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
