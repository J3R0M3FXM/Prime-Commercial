import { db, EndpointError } from 'sdk';

const key = (id) => `courier_pricing_${String(id)}`;

export async function getCourierPricing(id) {
  const row = await db.get('SELECT value FROM system_settings WHERE key=:key', { ':key': key(id) });
  try { return row?.value ? JSON.parse(row.value) : {}; } catch { return {}; }
}

export function validateCourierPricing(value) {
  const rawMax = value?.maxDistanceKm;
  const maxDistanceKm = rawMax == null || rawMax === '' ? null : Number(rawMax);
  if (maxDistanceKm !== null && (!Number.isFinite(maxDistanceKm) || maxDistanceKm <= 0)) {
    throw new EndpointError('Maximum distance must be greater than zero.', { code: 'INVALID_COURIER_PRICING' });
  }
  if (!Array.isArray(value?.pricingBands) || !value.pricingBands.length || value.pricingBands.length > 30) {
    throw new EndpointError('Add at least one distance band.', { code: 'INVALID_COURIER_PRICING' });
  }
  const pricingBands = value.pricingBands.map((band) => ({
    fromKm: Number(band?.fromKm),
    toKm: band?.toKm == null || band.toKm === '' ? null : Number(band.toKm),
    ratePerKm: Number(band?.ratePerKm),
  }));
  let end = 0;
  for (let index = 0; index < pricingBands.length; index += 1) {
    const band = pricingBands[index];
    if (value.pricingBands[index]?.fromKm == null || value.pricingBands[index]?.ratePerKm == null ||
        !Number.isFinite(band.fromKm) || band.fromKm !== end ||
        !Number.isFinite(band.ratePerKm) || band.ratePerKm < 0 ||
        (band.toKm !== null && (!Number.isFinite(band.toKm) || band.toKm <= band.fromKm)) ||
        (band.toKm === null && index !== pricingBands.length - 1)) {
      throw new EndpointError('Distance bands must start at 0 km, be continuous, and have valid rates.', { code: 'INVALID_COURIER_PRICING' });
    }
    end = band.toKm;
  }
  if (maxDistanceKm === null && end !== null) {
    throw new EndpointError('The last distance band needs an open end when there is no maximum distance.', { code: 'INVALID_COURIER_PRICING' });
  }
  if (maxDistanceKm !== null && end !== null && end < maxDistanceKm) {
    throw new EndpointError('Distance bands must cover the maximum distance.', { code: 'INVALID_COURIER_PRICING' });
  }
  return { maxDistanceKm, pricingBands };
}

export async function saveCourierPricing(id, value) {
  const pricing = validateCourierPricing(value);
  await db.run(`INSERT INTO system_settings(key,value,updated_at) VALUES(:key,:value,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=:value,updated_at=unixepoch()`,
    { ':key': key(id), ':value': JSON.stringify(pricing) });
  return pricing;
}
