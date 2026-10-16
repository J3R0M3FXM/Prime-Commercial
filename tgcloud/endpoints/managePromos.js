import { db, EndpointError } from 'sdk';
import { desc, eq } from 'sdk/db';
import { requireAdmin } from '../lib/auth.js';
import { deserializePromo, serializePromoDescription } from '../lib/promos.js';
import { promoRedemptions, promos } from '../schema.js';

const fields = new Set([
  'code', 'title', 'description', 'voucherType', 'discountType', 'discountValue',
  'maxDiscountAmount', 'cappedShippingDiscount', 'cashbackPercentage', 'minSpend',
  'minItemQuantity', 'customerEligibility', 'minPreviousOrders', 'eligibleTiers',
  'allowedPaymentMethods', 'allowedCourierIds', 'activeDaysOfWeek', 'isPaydayOnly',
  'flashHourStart', 'flashHourEnd', 'totalUsageLimit', 'usageCount',
  'usageLimitPerCustomer', 'isActive', 'startDate', 'endDate',
]);
const stringFields = new Set(['code', 'title', 'description', 'voucherType', 'discountType', 'customerEligibility']);
const arrayFields = new Set(['eligibleTiers', 'allowedPaymentMethods', 'allowedCourierIds', 'activeDaysOfWeek']);

function numberValue(value, field, { integer = false, nullable = false, min = 0, max = Infinity } = {}) {
  if (nullable && (value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isSafeInteger(number))) {
    throw new EndpointError(field + ' is outside its valid range.', { code: 'INVALID_INPUT' });
  }
  return number;
}

function dateValue(value, field) {
  if (value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new EndpointError(field + ' must be a valid date.', { code: 'INVALID_INPUT' });
  return date;
}

function normalize(input, current = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EndpointError('Invalid promo payload.', { code: 'INVALID_INPUT' });
  const values = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'action' || key === 'id') continue;
    if (!fields.has(key)) throw new EndpointError('Unsupported promo field: ' + key, { code: 'INVALID_FIELD' });
    if (stringFields.has(key)) {
      if (typeof value !== 'string') throw new EndpointError(key + ' must be text.', { code: 'INVALID_INPUT' });
      const text = value.trim();
      if (['code', 'title', 'voucherType', 'discountType', 'customerEligibility'].includes(key) && !text) {
        throw new EndpointError(key + ' is required.', { code: 'INVALID_INPUT' });
      }
      if (text.length > 4000) throw new EndpointError(key + ' is too long.', { code: 'INVALID_INPUT' });
      values[key] = key === 'code' ? text.toUpperCase() : text;
    } else if (arrayFields.has(key)) {
      if (!Array.isArray(value)) throw new EndpointError(key + ' must be an array.', { code: 'INVALID_INPUT' });
      if (key === 'activeDaysOfWeek') {
        values[key] = value.map((day) => numberValue(day, key, { integer: true, min: 0, max: 6 }));
      } else {
        values[key] = value.map((item) => String(item).trim()).filter(Boolean).slice(0, 100);
      }
    } else if (key === 'isPaydayOnly' || key === 'isActive') {
      if (typeof value !== 'boolean') throw new EndpointError(key + ' must be a boolean.', { code: 'INVALID_INPUT' });
      values[key] = value;
    } else if (key === 'discountValue' || key === 'minSpend') {
      values[key] = numberValue(value, key);
    } else if (key === 'maxDiscountAmount' || key === 'cappedShippingDiscount') {
      values[key] = numberValue(value, key, { nullable: true });
      if (values[key] === 0) values[key] = null;
    } else if (key === 'cashbackPercentage') {
      values[key] = numberValue(value, key, { nullable: true, max: 100 });
    } else if (key === 'minItemQuantity' || key === 'minPreviousOrders') {
      values[key] = numberValue(value, key, { integer: true, nullable: true });
      if (values[key] === 0) values[key] = null;
    } else if (key === 'flashHourStart' || key === 'flashHourEnd') {
      values[key] = numberValue(value, key, { integer: true, nullable: true, max: 23 });
    } else if (key === 'totalUsageLimit') {
      values[key] = numberValue(value, key, { integer: true, nullable: true, min: 0 });
      if (values[key] === 0) values[key] = null;
    } else if (key === 'usageCount') {
      values[key] = numberValue(value, key, { integer: true });
    } else if (key === 'usageLimitPerCustomer') {
      values[key] = numberValue(value, key, { integer: true, min: 1 });
    } else if (key === 'startDate' || key === 'endDate') {
      values[key] = dateValue(value, key);
    }
  }
  return { ...current, ...values };
}

function toDatabaseRow(promo, id, creating) {
  const now = new Date();
  return {
    id,
    code: promo.code,
    title: promo.title,
    description: serializePromoDescription(promo),
    discountType: promo.discountType || 'fixed',
    discountValue: Number(promo.discountValue) || 0,
    maxDiscountAmount: promo.maxDiscountAmount ?? null,
    minSpend: Number(promo.minSpend) || 0,
    totalUsageLimit: promo.totalUsageLimit ?? null,
    usageCount: creating ? 0 : Number(promo.usageCount) || 0,
    usageLimitPerCustomer: Number(promo.usageLimitPerCustomer) || 1,
    isActive: promo.isActive !== false,
    startDate: promo.startDate ?? null,
    endDate: promo.endDate ?? null,
    updatedAt: now,
    ...(creating ? { createdAt: now } : {}),
  };
}

async function listPromos() {
  const [rows, redemptions] = await Promise.all([
    db.select().from(promos).orderBy(desc(promos.createdAt)).all(),
    db.select().from(promoRedemptions).orderBy(desc(promoRedemptions.usedAt)).limit(200).all(),
  ]);
  return rows.map((row) => {
    const promo = deserializePromo(row);
    const related = redemptions.filter((item) => item.promoCode === promo.code || item.promoId === promo.id);
    const deviceToCustomers = new Map();
    for (const redemption of related) {
      if (!redemption.deviceId || !redemption.customerId) continue;
      if (!deviceToCustomers.has(redemption.deviceId)) deviceToCustomers.set(redemption.deviceId, new Set());
      deviceToCustomers.get(redemption.deviceId).add(redemption.customerId);
    }
    let fraudFlagsCount = 0;
    for (const customerIds of deviceToCustomers.values()) {
      if (customerIds.size > 1) fraudFlagsCount += customerIds.size;
    }
    return { ...promo, usageCount: related.length, redemptions: related.slice(0, 10), fraudFlagsCount };
  });
}

export default async function (input, ctx) {
  await requireAdmin(ctx);
  const action = input?.action;
  if (action === 'list') return await listPromos();

  if (action === 'create') {
    const code = String(input.code || ('PRIME' + Date.now().toString(36))).trim().toUpperCase();
    const duplicate = await db.select({ id: promos.id }).from(promos).where(eq(promos.code, code)).get();
    if (duplicate) throw new EndpointError('A promo with this code already exists.', { code: 'DUPLICATE_CODE' });
    const base = {
      code,
      title: String(input.title || code + ' Promo').trim(),
      description: '',
      voucherType: 'shop_voucher',
      discountType: 'fixed',
      discountValue: 0,
      minSpend: 0,
      customerEligibility: 'all',
      eligibleTiers: [],
      allowedPaymentMethods: ['all'],
      allowedCourierIds: ['all'],
      activeDaysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      isPaydayOnly: false,
      usageLimitPerCustomer: 1,
      isActive: true,
      ...input,
      code,
    };
    const promo = normalize(base);
    const id = String(input.id || 'promo_' + Date.now());
    const [created] = await db.insert(promos).values(toDatabaseRow(promo, id, true)).returning().run();
    return deserializePromo(created);
  }

  if (action === 'update') {
    const id = String(input.id || '').trim();
    if (!id) throw new EndpointError('Promo ID is required.', { code: 'INVALID_INPUT' });
    const row = await db.select().from(promos).where(eq(promos.id, id)).get();
    if (!row) throw new EndpointError('Promo not found.', { code: 'NOT_FOUND' });
    const current = deserializePromo(row);
    const promo = normalize(input, current);
    if (promo.code !== current.code) {
      const duplicate = await db.select({ id: promos.id }).from(promos).where(eq(promos.code, promo.code)).get();
      if (duplicate && duplicate.id !== id) throw new EndpointError('A promo with this code already exists.', { code: 'DUPLICATE_CODE' });
    }
    const values = toDatabaseRow(promo, id, false);
    delete values.id;
    delete values.createdAt;
    const [updated] = await db.update(promos).set(values).where(eq(promos.id, id)).returning().run();
    if (!updated) throw new EndpointError('Promo not found.', { code: 'NOT_FOUND' });
    return deserializePromo(updated);
  }

  if (action === 'delete') {
    const id = String(input.id || '').trim();
    if (!id) throw new EndpointError('Promo ID is required.', { code: 'INVALID_INPUT' });
    const [deleted] = await db.delete(promos).where(eq(promos.id, id)).returning().run();
    if (!deleted) throw new EndpointError('Promo not found.', { code: 'NOT_FOUND' });
    return { success: true, id };
  }

  throw new EndpointError('Unsupported promo action.', { code: 'INVALID_ACTION' });
}
