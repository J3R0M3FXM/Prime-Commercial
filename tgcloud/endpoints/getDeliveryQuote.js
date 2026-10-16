import { db, EndpointError } from 'sdk';
import { fetch } from 'sdk/fetch';
import { asc, desc, eq } from 'sdk/db';
import { couriers, systemSettings, warehouses } from '../schema.js';
import { calculateDeliveryFee, calculateRoadDistanceFallback } from '../lib/delivery-fee.js';

export default async function (input) {
  const destinationLat = Number(input?.destinationLat);
  const destinationLon = Number(input?.destinationLon);
  const courierId = String(input?.courierId || '').trim();
  if (input?.destinationLat == null || input?.destinationLon == null ||
      !Number.isFinite(destinationLat) || destinationLat < -90 || destinationLat > 90 ||
      !Number.isFinite(destinationLon) || destinationLon < -180 || destinationLon > 180 || !courierId) {
    throw new EndpointError('A valid destination and courier are required.', { code: 'INVALID_INPUT' });
  }

  const [warehouseRows, courierRows] = await Promise.all([
    db.select().from(warehouses).where(eq(warehouses.isActive, true))
      .orderBy(desc(warehouses.isDefault), asc(warehouses.sortOrder)).all(),
    db.select().from(couriers).where(eq(couriers.isActive, true))
      .orderBy(asc(couriers.sortOrder)).all(),
  ]);
  const warehouse = warehouseRows.find((row) =>
    row.latitude != null && row.longitude != null &&
    Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))
  );
  if (!warehouse) throw new EndpointError('No active warehouse with valid coordinates is configured.', { code: 'WAREHOUSE_UNCONFIGURED' });

  const courier = courierRows.find((row) => String(row.id) === courierId);
  if (!courier) throw new EndpointError('Selected courier is no longer available.', { code: 'COURIER_UNAVAILABLE' });

  // Keep the routing key server-side in system_settings; never return it to the Mini App.
  const keyRow = await db.select({ value: systemSettings.value }).from(systemSettings)
    .where(eq(systemSettings.key, 'geoapify_api_key')).get();
  const keyValue = keyRow?.value;
  const apiKey = typeof keyValue === 'string' ? keyValue.trim()
    : keyValue && typeof keyValue === 'object' ? String(keyValue.apiKey || '').trim() : '';
  let distanceKm = null;

  if (apiKey) {
    try {
      const waypoints = encodeURIComponent(
        String(Number(warehouse.latitude)) + ',' + String(Number(warehouse.longitude)) + '|' +
        String(destinationLat) + ',' + String(destinationLon),
      );
      const response = await fetch(
        'https://api.geoapify.com/v1/routing?waypoints=' + waypoints +
        '&mode=drive&apiKey=' + encodeURIComponent(apiKey),
      );
      if (response.ok) {
        const routeData = await response.json();
        const meters = Number(routeData?.features?.[0]?.properties?.distance);
        if (Number.isFinite(meters) && meters >= 0) distanceKm = meters / 1000;
      }
    } catch {
      // Provider outage or timeout: return an explicitly marked estimate below.
    }
  }

  const estimated = distanceKm === null;
  if (distanceKm === null) {
    distanceKm = calculateRoadDistanceFallback(
      Number(warehouse.latitude), Number(warehouse.longitude), destinationLat, destinationLon,
    );
  }
  distanceKm = Math.round(Math.max(0, distanceKm) * 100) / 100;
  return {
    courier: { id: courier.id, name: courier.name, type: courier.type, logo: courier.logo },
    distanceKm,
    deliveryFee: calculateDeliveryFee(courier, distanceKm),
    estimated,
  };
}
