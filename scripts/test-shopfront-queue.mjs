import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, tg_user_id TEXT, created_at INTEGER, status TEXT, payment_status TEXT, payment_proof_image TEXT, payment_deadline_at INTEGER);
  INSERT INTO orders VALUES
    ('a','11',100,'Pending','Pending Review','proof',NULL),
    ('b','22',100,'Pending','Pending Review','proof',NULL),
    ('c','11',200,'Pending','Unpaid','',1),
    ('d','11',300,'Processing','Paid','proof',NULL);`);
const db = { get: async (sql, params) => database.prepare(sql).get(params || {}) };
class EndpointError extends Error { constructor(message, details) { super(message); this.code = details.code; } }
const source = readFileSync('tgcloud/endpoints/getMyOrderQueuePosition.js', 'utf8')
  .replace(/^import .*;\n/gm, '').replace('export default async function', 'async function handler');
const handler = new Function('db', 'EndpointError', `${source}\nreturn handler;`)(db, EndpointError);
const context = id => ({ initData: { user: { id } } });
await assert.rejects(handler({ orderId: 'a' }, {}), e => e.code === 'AUTH_REQUIRED');
await assert.rejects(handler({ orderId: 'b' }, context(11)), e => e.code === 'NOT_FOUND');
assert.equal((await handler({ orderId: 'a' }, context(11))).position, 1);
assert.equal((await handler({ orderId: 'b' }, context(22))).position, 2);
assert.equal((await handler({ orderId: 'c' }, context(11))).position, null);
assert.equal((await handler({ orderId: 'd' }, context(11))).position, null);
database.close();
console.log('PASS: owned queue position, FIFO ties and excluded orders');
