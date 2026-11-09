import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculatePromoDiscount, deserializePromo, generatePromoCode, serializePromoDescription } from '../tgcloud/lib/promos.js';

function load(path, dependencies) {
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace(/export default async function\s*\(/, 'async function handler(');
  return new Function(...Object.keys(dependencies), source + '\nreturn handler;')(...Object.values(dependencies));
}
const fields = names => Object.fromEntries(names.map(name => [name, name]));
const customers = fields(['id', 'tgUserId', 'primeMemberId']);
const orders = fields(['customerId', 'primeMemberId', 'status', 'subtotal', 'createdAt', 'deliveredAt']);
const promos = fields(['id', 'code', 'createdAt', 'isActive']);
const promoRedemptions = fields(['promoCode', 'promoId', 'usedAt', 'releasedAt']);
const rows = new Map([[customers, [{ id: 'alice', tgUserId: '111', primeMemberId: 'ABC123' }, { id: 'bob', tgUserId: '222', primeMemberId: 'DEF456' }]], [orders, []], [promos, []], [promoRedemptions, []]]);
const eq = (field, value) => row => row[field] === value;
const and = (...checks) => row => checks.every(check => check(row));
const or = (...checks) => row => checks.some(check => check(row));
const db = {
  select() { return { from(table) {
    let condition = () => true;
    const query = { where(check) { condition = check; return query; }, orderBy() { return query; }, limit() { return query; }, async get() { return rows.get(table).find(condition); }, async all() { return rows.get(table).filter(condition); } };
    return query;
  } }; },
  insert(table) { return { values(value) { return { returning() { return { async run() { rows.get(table).push(value); return [value]; } }; } }; } }; },
  update(table) { return { set(value) { return { where(condition) { return { returning() { return { async run() { const row = rows.get(table).find(condition); if (!row) return []; Object.assign(row, value); return [row]; } }; } }; } }; } }; },
};
class EndpointError extends Error { constructor(message, info) { super(message); this.code = info.code; } }
const requireAdmin = async ctx => { if (ctx?.initData?.user?.id !== 999) throw new EndpointError('Admin required', { code: 'ADMIN_REQUIRED' }); };
const manage = load('tgcloud/endpoints/managePromos.js', { db, EndpointError, desc: field => field, eq, requireAdmin, deserializePromo, generatePromoCode, serializePromoDescription, promoRedemptions, promos });
const validate = load('tgcloud/endpoints/validatePromo.js', { db, and, asc: field => field, eq, isNull: field => row => row[field] == null, or, calculateCustomerTier: () => ({ tier: 'Silver' }), resolveTrustedFingerprint: () => ({}), calculatePromoDiscount, deserializePromo, customers, orders, promoRedemptions, promos });
const publicPromos = load('tgcloud/endpoints/getActivePromos.js', { db, desc: field => field, eq, deserializePromo, promos });
const context = id => ({ initData: { user: { id } } });
const input = { action: 'create', id: 'promo-1', code: 'PRIVATE', title: 'Private Offer', description: 'Private description', voucherType: 'shop_voucher', discountType: 'fixed', discountValue: 50, maxDiscountAmount: null, cappedShippingDiscount: null, cashbackPercentage: null, minSpend: 0, minItemQuantity: null, customerEligibility: 'specific_customer', eligibleCustomerId: ' abc123 ', minPreviousOrders: null, eligibleTiers: [], allowedPaymentMethods: ['all'], allowedCourierIds: ['all'], activeDaysOfWeek: [0,1,2,3,4,5,6], isPaydayOnly: false, flashHourStart: null, flashHourEnd: null, totalUsageLimit: null, usageLimitPerCustomer: 1, isActive: true, startDate: null, endDate: null };
await assert.rejects(manage(input, context(111)), error => error.code === 'ADMIN_REQUIRED');
const created = await manage(input, context(999));
assert.equal(created.eligibleCustomerId, 'abc123');
assert.equal(created.customerEligibility, 'specific_customer');
const publicOffer = (await publicPromos()).find(promo => promo.code === 'PRIVATE');
assert.ok(publicOffer); assert.equal(publicOffer.eligibleCustomerId, undefined, 'Assigned customer identifier is not public');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, true, 'Assigned PRIME member can redeem');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500, eligibleCustomerId: 'ABC123' }, context(222))).valid, false, 'Client input cannot impersonate the assigned customer');
const stored = rows.get(promos)[0];
const originalDescription = stored.description;
stored.description = JSON.stringify({ ...JSON.parse(originalDescription), eligibleCustomerId: '' });
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false, 'Legacy malformed restrictions fail closed');
stored.description = originalDescription;
let updated = await manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '222', title: 'Updated' }, context(999));
assert.equal(updated.eligibleCustomerId, '222');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(222))).valid, true, 'Assigned Telegram ID can redeem');
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false);
updated = await manage({ action: 'update', id: 'promo-1', description: 'Changed' }, context(999));
assert.equal(updated.eligibleCustomerId, '222', 'Unrelated updates preserve the restriction');
await assert.rejects(manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '' }, context(999)), error => error.code === 'INVALID_INPUT');
await manage({ action: 'update', id: 'promo-1', eligibleCustomerId: '', isActive: false }, context(999));
assert.equal((await validate({ code: 'PRIVATE', itemsSubtotal: 500 }, context(111))).valid, false);
await assert.rejects(manage({ ...input, id: 'promo-2', code: 'MISSING', eligibleCustomerId: '' }, context(999)), error => error.code === 'INVALID_INPUT');
const general = await manage({ ...input, id: 'promo-3', code: 'GENERAL', customerEligibility: 'all', eligibleCustomerId: '' }, context(999));
assert.equal(general.eligibleCustomerId, '');
assert.equal((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(111))).valid, true);
assert.equal((await validate({ code: 'GENERAL', itemsSubtotal: 500 }, context(222))).valid, true);
const orderSource = readFileSync('tgcloud/endpoints/createOrder.js', 'utf8');
assert.match(orderSource, /promo = await validatePromo\([\s\S]*?id: customer\.tgUserId[\s\S]*?if \(!promo\?\.valid\)/, 'Order submission repeats promo validation using the authenticated customer');
console.log('PASS: promo create/update round-trip, admin authorization, customer-specific enforcement and order revalidation.');
