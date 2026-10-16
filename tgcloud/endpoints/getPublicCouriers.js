import { db } from 'sdk';
import { asc, eq } from 'sdk/db';
import { couriers } from '../schema.js';

/** Public delivery options and price parameters; never returns inactive couriers. */
export default async function () {
  return await db.select({
    id: couriers.id,
    name: couriers.name,
    trackingUrlPattern: couriers.trackingUrlPattern,
    logo: couriers.logo,
    type: couriers.type,
    baseFare: couriers.baseFare,
    firstMile: couriers.firstMile,
    firstMileFee: couriers.firstMileFee,
    exceedingKmFee: couriers.exceedingKmFee,
    surcharge: couriers.surcharge,
    nightDifferential: couriers.nightDifferential,
    sortOrder: couriers.sortOrder,
  }).from(couriers)
    .where(eq(couriers.isActive, true))
    .orderBy(asc(couriers.sortOrder))
    .all();
}
