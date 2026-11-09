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
database.exec("ALTER TABLE orders ADD COLUMN ready_at INTEGER; INSERT INTO orders(id,tg_user_id,created_at,status,payment_status,payment_proof_image) VALUES('e','11',150,'Confirmed','Paid','proof')");
assert.equal((await handler({orderId:'e'},context(11))).position,3,'Confirmed orders remain queued until Processing');
const publicSource=readFileSync('tgcloud/endpoints/getPublicOrderQueue.js','utf8').replace(/^import .*;\n/gm,'').replace('export default async function','async function handler');
const publicQueue=new Function('db',publicSource+'\nreturn handler;')(db);
assert.equal((await publicQueue()).ordersInQueue,3);
database.exec("UPDATE orders SET status='Processing' WHERE id='e'");
assert.equal((await publicQueue()).ordersInQueue,2);
assert.equal((await publicQueue()).ordersInProcessing,2);
database.close();
console.log('PASS: owned queue position, FIFO ties and excluded orders');
