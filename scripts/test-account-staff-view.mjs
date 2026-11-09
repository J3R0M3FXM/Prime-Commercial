import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const people = [
  { id: 'staff', tgUserId: '99', tgName: 'Staff', primeMemberId: 'STAFF' },
  { id: 'customer', tgUserId: '22', tgName: 'Customer', primeMemberId: 'CUSTOMER', points: 12 },
  { id: 'guest', tgUserId: '', tgName: 'Guest', primeMemberId: '' },
];
const lookups = [];
const db = {
  select() { return { from(table) { return {
    where(condition) { return {
      async get() { lookups.push(condition); return people.find(row => row[condition.field] === condition.value); },
      orderBy() { return { limit() { return { async all() { return []; } }; } }; },
    }; },
  }; } }; },
  async get(_sql, params) { lookups.push(params); return { orderCount: 0, successfulOrders: 0 }; },
};
class EndpointError extends Error { constructor(message, options) { super(message); this.code = options.code; } }
const requireAdmin = async ctx => { if (String(ctx.initData.user.id) !== '99') throw new EndpointError('Admin required', { code: 'ADMIN_REQUIRED' }); };
let reconciliations = 0;
const source = readFileSync('tgcloud/endpoints/getMyAccount.js', 'utf8').replace(/^import[\s\S]*?;\n/gm, '').replace('export default async function', 'async function handler');
const handler = new Function('db', 'EndpointError', 'desc', 'eq', 'or', 'customers', 'orders', 'pointTransactions', 'calculateCustomerTier', 'reconcileOrderMilestones', 'requireAdmin', source + '\nreturn handler;')(
  db, EndpointError, field => field, (field, value) => ({ field, value }), (...items) => items,
  { id: 'id', tgUserId: 'tgUserId', referredByMemberId: 'referredByMemberId', createdAt: 'createdAt' },
  { tgUserId: 'tgUserId', customerId: 'customerId', primeMemberId: 'primeMemberId', referredByMemberId: 'referredByMemberId', createdAt: 'createdAt' },
  { userId: 'userId', createdAt: 'createdAt' }, () => ({ tier: 'Silver' }), async () => { reconciliations++; }, requireAdmin,
);
const context = id => ({ initData: { user: { id } } });
await assert.rejects(handler({ customerId: 'customer' }, {}), error => error.code === 'AUTH_REQUIRED');
await assert.rejects(handler({ customerId: 'customer' }, context(22)), error => error.code === 'ADMIN_REQUIRED');
const own = await handler({}, context(22));
assert.equal(own.customer.id, 'customer'); assert.equal(own.customer.purchasingPoints, 12); assert.equal(reconciliations, 1);
const staff = await handler({ customerId: 'customer' }, context(99));
assert.deepEqual(staff, own, 'Staff sees the same account calculations and customer data');
assert.equal(reconciliations, 1, 'Staff inspection is read-only');
await handler({ customerId: 'guest' }, context(99));
assert.ok(lookups.some(item => item[':telegram_id'] === '__no_telegram_account__'), 'Missing Telegram IDs cannot match unrelated guest orders');
console.log('PASS: verified staff-only account view, customer parity, read-only inspection and guest order isolation.');
