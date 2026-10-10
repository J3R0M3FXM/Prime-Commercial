import { db } from 'sdk';
import { eq } from 'sdk/db';
import { promos } from '../schema.js';

/**
 * Returns active, currently valid promo metadata for display.
 * Checkout must independently revalidate limits, eligibility, and discount
 * amounts on the server; client-provided discount values are never trusted.
 */
export default async function () {
  const now = Date.now();
  const rows = await db
    .select({
      id: promos.id,
      code: promos.code,
      title: promos.title,
      description: promos.description,
      discountType: promos.discountType,
      discountValue: promos.discountValue,
      maxDiscountAmount: promos.maxDiscountAmount,
      minSpend: promos.minSpend,
      startDate: promos.startDate,
      endDate: promos.endDate,
    })
    .from(promos)
    .where(eq(promos.isActive, true))
    .all();

  const valid = rows.filter((promo) => {
    const starts = promo.startDate instanceof Date ? promo.startDate.getTime() : null;
    const ends = promo.endDate instanceof Date ? promo.endDate.getTime() : null;
    return (starts === null || starts <= now) && (ends === null || ends >= now);
  });

  return { promos: valid };
}
