import { db, EndpointError } from 'sdk';
import { asc, desc, eq } from 'sdk/db';
import { couriers, warehouses } from '../schema.js';
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

  // Display-only degraded-mode estimate. Checkout must recalculate and validate
  // the fee server-side; never accept a fee supplied by the Mini App.
  const distanceKm = calculateRoadDistanceFallback(
    Number(warehouse.latitude), Number(warehouse.longitude), destinationLat, destinationLon,
  );
  return {
    courier: { id: courier.id, name: courier.name, type: courier.type, logo: courier.logo },
    distanceKm,
    deliveryFee: calculateDeliveryFee(courier, distanceKm),
    estimated: true,
  };
}
