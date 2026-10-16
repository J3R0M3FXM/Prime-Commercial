import { db } from 'sdk';
import { asc, eq } from 'sdk/db';
import { charges } from '../schema.js';

/**
 * Public, read-only charge configuration.
 *
 * Mirrors the existing GET /api/charges response shape (an array) and exposes
 * only calculation/display fields. Checkout must calculate its own totals from
 * authoritative server-side configuration; never trust a client-supplied fee.
 */
export default async function () {
  return await db
    .select({
      id: charges.id,
      name: charges.name,
      type: charges.type,
      rate: charges.rate,
      isActive: charges.isActive,
      sortOrder: charges.sortOrder,
      description: charges.description,
    })
    .from(charges)
    .where(eq(charges.isActive, true))
    .orderBy(asc(charges.sortOrder))
    .all();
}
