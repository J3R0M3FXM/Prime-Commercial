export interface DeliveryRateConfig {
  baseFare: number;
  firstMile: number;
  firstMileFee: number;
  exceedingKmFee: number;
  surcharge: number;
  nightDifferential: number;
}

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function normalizeDeliveryRate(raw: any): DeliveryRateConfig {
  return {
    baseFare: money(raw?.baseFare ?? raw?.base_fare),
    firstMile: money(raw?.firstMile ?? raw?.first_mile),
    firstMileFee: money(raw?.firstMileFee ?? raw?.first_mile_fee),
    exceedingKmFee: money(raw?.exceedingKmFee ?? raw?.exceeding_km_fee),
    surcharge: money(raw?.surcharge),
    nightDifferential: money(raw?.nightDifferential ?? raw?.night_differential),
  };
}

/**
 * Delivery pricing rule:
 * base fare
 * + per-km rate for distance inside the configured first-mile band
 * + per-km excess rate for distance beyond that band
 * + configured fixed surcharges.
 *
 * A zero first-mile threshold means the entire route is charged at the
 * exceeding-km rate.
 */
export function calculateDeliveryFee(raw: any, distanceKm: number): number {
  const rate = normalizeDeliveryRate(raw);
  const distance = Math.max(0, Number(distanceKm) || 0);

  const includedKm = Math.min(distance, rate.firstMile);
  const excessKm = Math.max(0, distance - rate.firstMile);

  const fee =
    rate.baseFare +
    includedKm * rate.firstMileFee +
    excessKm * rate.exceedingKmFee +
    rate.surcharge +
    rate.nightDifferential;

  return Math.round(Math.max(0, fee) * 100) / 100;
}

export function calculateRoadDistanceFallback(
  originLat: number,
  originLon: number,
  destinationLat: number,
  destinationLon: number,
): number {
  const R = 6371;
  const dLat = (destinationLat - originLat) * Math.PI / 180;
  const dLon = (destinationLon - originLon) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(originLat * Math.PI / 180) *
      Math.cos(destinationLat * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
  const straightLineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Road routes are normally longer than straight-line distance. This is only
  // a degraded-mode estimate when the routing provider is unavailable.
  return Math.max(0, Math.round(straightLineKm * 1.3 * 100) / 100);
}
