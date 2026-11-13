import { db, EndpointError } from 'sdk';
import { fetch } from 'sdk/fetch';
import { asc, desc, eq } from 'sdk/db';
import { couriers, systemSettings, warehouses } from '../schema.js';
import { calculateDeliveryFee, calculateRoadDistanceFallback } from './delivery-fee.js';
import { getCourierTimeRates, ensureCourierTimeRateColumn } from './ensure-courier-time-rate.js';
import { getCourierPricing } from './courier-pricing.js';

function pricingForCourier(courier) {
  const name = String(courier.name || '').toLowerCase();
  if (name.includes('grab')) return { maxDistanceKm: 30, pricingBands: [{ fromKm: 0, toKm: 3, ratePerKm: 10 }, { fromKm: 3, toKm: null, ratePerKm: 12 }] };
  if (name.includes('lalamove')) return { pricingBands: [{ fromKm: 0, toKm: 3, ratePerKm: 6.5 }, { fromKm: 3, toKm: 7, ratePerKm: 6.2 }, { fromKm: 7, toKm: 10, ratePerKm: 6 }, { fromKm: 10, toKm: 15, ratePerKm: 5.5 }, { fromKm: 15, toKm: null, ratePerKm: 5 }] };
  if (name.includes('move it') || name.includes('moveit')) return { pricingBands: [{ fromKm: 2, toKm: 7, ratePerKm: 10 }, { fromKm: 7, toKm: null, ratePerKm: 15 }] };
  return {};
}

export async function quoteDelivery(destinationLatValue, destinationLonValue, courierId = '') {
  await ensureCourierTimeRateColumn();
  const destinationLat = Number(destinationLatValue);
  const destinationLon = Number(destinationLonValue);
  if (destinationLatValue == null || destinationLonValue == null ||
      !Number.isFinite(destinationLat) || destinationLat < -90 || destinationLat > 90 ||
      !Number.isFinite(destinationLon) || destinationLon < -180 || destinationLon > 180) {
    throw new EndpointError('A valid destination is required.', { code: 'INVALID_INPUT' });
  }
  const [warehouseRows, courierRows] = await Promise.all([
    db.select().from(warehouses).where(eq(warehouses.isActive, true))
      .orderBy(desc(warehouses.isDefault), asc(warehouses.sortOrder)).all(),
    db.select().from(couriers).where(eq(couriers.isActive, true))
      .orderBy(asc(couriers.sortOrder)).all(),
  ]);
  const warehouse = warehouseRows.find((row) => row.latitude != null && row.longitude != null &&
    Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)));
  if (!warehouse) throw new EndpointError('No active warehouse with valid coordinates is configured.', { code: 'WAREHOUSE_UNCONFIGURED' });
  if (!courierRows.length) throw new EndpointError('No active couriers are configured.', { code: 'COURIERS_UNAVAILABLE' });
  const courierTimeRates = await getCourierTimeRates();

  const [tomtomKeyRow] = await Promise.all([
    db.select({ value: systemSettings.value }).from(systemSettings)
      .where(eq(systemSettings.key, 'tomtom_api_key')).get(),
  ]);
  const readApiKey = (row) => {
    const value = row?.value;
    return typeof value === 'string' ? value.trim()
      : value && typeof value === 'object' ? String(value.apiKey || '').trim() : '';
  };
  const tomtomApiKey = readApiKey(tomtomKeyRow);
  let distanceKm = null;
  let routeTimeMinutes = null;
  let baselineTimeMinutes = null;
  let trafficModel = 'unavailable';
  let routingSource = 'geodesic-fallback';
  if (tomtomApiKey) {
    try {
      const origin = encodeURIComponent(String(Number(warehouse.latitude)) + ',' + String(Number(warehouse.longitude)));
      const destination = encodeURIComponent(String(destinationLat) + ',' + String(destinationLon));
      const response = await fetch('https://api.tomtom.com/routing/1/calculateRoute/' + origin + ':' + destination +
        '/json?travelMode=motorcycle&traffic=true&computeTravelTimeFor=all&routeType=fastest&key=' + encodeURIComponent(tomtomApiKey));
      if (response.ok) {
        const routeData = await response.json();
        const summary = routeData?.routes?.[0]?.summary;
        const meters = Number(summary?.lengthInMeters);
        const seconds = Number(summary?.travelTimeInSeconds);
        if (Number.isFinite(meters) && meters >= 0 && Number.isFinite(seconds) && seconds > 0) {
          distanceKm = meters / 1000;
          routeTimeMinutes = Math.max(1, Math.round(seconds / 60));
          const historicalSeconds = Number(summary?.historicTrafficTravelTimeInSeconds);
          if (Number.isFinite(historicalSeconds) && historicalSeconds > 0) {
            baselineTimeMinutes = Math.max(1, Math.round(historicalSeconds / 60));
          }
          routingSource = 'route-service';
          const liveDelay = summary?.trafficDelayInSeconds;
          trafficModel = liveDelay != null && Number.isFinite(Number(liveDelay))
            ? 'current-traffic' : 'typical-traffic';
        }
      }
    } catch {
      // Fall back to the existing route source if the live traffic request fails.
    }
  }
  if (distanceKm === null) {
    distanceKm = calculateRoadDistanceFallback(Number(warehouse.latitude), Number(warehouse.longitude), destinationLat, destinationLon);
  }
  distanceKm = Math.round(Math.max(0, distanceKm) * 100) / 100;
  const computedCouriers = (await Promise.all(courierRows.map(async (courier) => {
    const saved = await getCourierPricing(courier.id);
    const pricing = Object.keys(saved).length ? saved : pricingForCourier(courier);
    const covered = pricing.maxDistanceKm == null || distanceKm <= pricing.maxDistanceKm;
    return ({
    id: courier.id,
    name: courier.name,
    logo: courier.logo || '',
    type: courier.type || 'Standard',
    baseFare: Number(courier.baseFare) || 0,
    firstMile: Number(courier.firstMile) || 0,
    firstMileFee: Number(courier.firstMileFee) || 0,
    exceedingKmFee: Number(courier.exceedingKmFee) || 0,
    surcharge: Number(courier.surcharge) || 0,
    nightDifferential: Number(courier.nightDifferential) || 0,
    timeBasedFeePerMinute: courierTimeRates.get(String(courier.id)) || 0,
    estimatedTravelMinutes: routeTimeMinutes,
    calculatedTimeFee: routeTimeMinutes == null ? 0 : Math.round((courierTimeRates.get(String(courier.id)) || 0) * routeTimeMinutes * 100) / 100,
    maxDistanceKm: pricing.maxDistanceKm,
    coverageAvailable: covered,
    calculatedFee: covered ? calculateDeliveryFee({ ...courier, ...pricing, timeBasedFeePerMinute: courierTimeRates.get(String(courier.id)) || 0 }, distanceKm, routeTimeMinutes) : null,
    distanceKm,
  }); }));
  const selectedId = String(courierId || '').trim();
  const selectedCourier = selectedId ? computedCouriers.find((row) => String(row.id) === selectedId) : computedCouriers.find((row) => row.coverageAvailable !== false) || computedCouriers[0];
  if (selectedId && (!selectedCourier || selectedCourier.coverageAvailable === false)) throw new EndpointError('The selected courier does not cover this distance.', { code: 'COURIER_OUTSIDE_COVERAGE' });
  return {
    warehouse: { id: warehouse.id, name: warehouse.name, address: warehouse.address, lat: Number(warehouse.latitude), lon: Number(warehouse.longitude) },
    distanceKm,
    fee: selectedCourier?.calculatedFee,
    courier: selectedCourier,
    couriers: computedCouriers,
    routingSource,
    routeTimeMinutes,
    baselineTimeMinutes,
    trafficModel,
    trafficPricingApplied: selectedCourier.calculatedTimeFee > 0,
    estimated: trafficModel !== 'current-traffic',
    trafficEstimateType: trafficModel,
  };
}
