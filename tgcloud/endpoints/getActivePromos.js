import { db } from 'sdk';
import { desc, eq } from 'sdk/db';
import { deserializePromo } from '../lib/promos.js';
import { promos } from '../schema.js';

/**
 * Public display metadata only. The checkout endpoint must independently
 * enforce customer eligibility, payment/courier restrictions, and redemption
 * limits using authoritative data.
 */
export default async function () {
  const now = Date.now();
  const rows = await db.select().from(promos)
    .where(eq(promos.isActive, true))
    .orderBy(desc(promos.createdAt))
    .all();

  const valid = rows.map(deserializePromo).filter((promo) => {
    const starts = promo.startDate instanceof Date ? promo.startDate.getTime() : null;
    const ends = promo.endDate instanceof Date ? promo.endDate.getTime() : null;
    const underUsageLimit = promo.totalUsageLimit == null ||
      Number(promo.usageCount || 0) < Number(promo.totalUsageLimit);
    return (starts === null || starts <= now) &&
      (ends === null || ends >= now) && underUsageLimit;
  });

  // Do not expose global usage counters or limits to public callers.
  return valid.map(({ totalUsageLimit, usageCount, ...promo }) => promo);
}
