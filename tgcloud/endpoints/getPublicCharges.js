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
  const rows = await db
    .select({
      id: charges.id,
      name: charges.name,
      type: charges.type,
      rate: charges.rate,
      // The Mini App charge normalizer consumes amount/value. Keep rate as
      // the canonical Admin field, while exposing compatible read aliases.
      amount: charges.rate,
      value: charges.rate,
      isActive: charges.isActive,
      sortOrder: charges.sortOrder,
      description: charges.description,
    })
    .from(charges)
    .where(eq(charges.isActive, true))
    .orderBy(asc(charges.sortOrder))
    .all();
  return rows.map((row) => {
    let metadata = {};
    try {
      const parsed = typeof row.description === 'string' ? JSON.parse(row.description) : null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
    } catch {}
    const days = Array.isArray(metadata.days) ? metadata.days
      : Array.isArray(metadata.daysOfWeek) ? metadata.daysOfWeek : [];
    const schedules = {
      ...metadata,
      days,
      daysOfWeek: days,
      isOvernight: Boolean(metadata.isOvernight ?? metadata.overnight ?? false),
      isRecurring: Boolean(metadata.isRecurring ?? metadata.recurring ?? false),
    };
    const hasSchedule = schedules.isOvernight || days.length > 0 || Boolean(metadata.date) || Boolean(metadata.time);
    const isDefault = typeof metadata.isDefault === 'boolean' ? metadata.isDefault : !hasSchedule;
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      rate: row.rate,
      amount: row.rate,
      value: row.rate,
      isActive: row.isActive,
      isDefault,
      defaultAddToBill: isDefault,
      schedules,
      sortOrder: row.sortOrder,
      description: row.description,
    };
  });
}
