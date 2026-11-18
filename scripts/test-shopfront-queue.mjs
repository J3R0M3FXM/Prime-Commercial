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
assert.ok((await publicQueue()).averageReadyMinutes >= 35, 'Active orders retain the minimum');
database.exec("UPDATE orders SET status='Dispatched', ready_at=unixepoch(), created_at=unixepoch()-10800 WHERE id <> 'c'");
assert.equal((await publicQueue()).averageReadyMinutes, 0, 'Dispatched orders and expired unpaid orders leave the queue idle');
database.exec("INSERT INTO orders(id,created_at,status,payment_status,payment_proof_image) VALUES('next',unixepoch(),'Pending','Pending Review','proof')");
assert.equal((await publicQueue()).averageReadyMinutes, 35, 'The next order resets to 35 minutes despite slow historical orders');
database.exec("UPDATE orders SET status='Processing', payment_status='Paid' WHERE id='next'");
assert.equal((await publicQueue()).averageReadyMinutes, 35, 'One processing order retains the minimum');
database.exec("INSERT INTO orders(id,created_at,status,payment_status,payment_proof_image) VALUES('next-2',unixepoch(),'Confirmed','Paid','proof')");
assert.equal((await publicQueue()).averageReadyMinutes, 35, 'Two new orders do not multiply the preparation baseline');
database.exec("UPDATE orders SET status='Dispatched' WHERE id IN ('next','next-2')");
assert.equal((await publicQueue()).averageReadyMinutes, 0, 'The queue resets again after dispatch');
database.exec("DELETE FROM orders; INSERT INTO orders(id,created_at,ready_at,status,payment_status) VALUES ('first',unixepoch()-45*60,unixepoch()-8*60,'Ready','Paid'),('second',unixepoch()-41*60,NULL,'Processing','Paid')");
assert.equal((await publicQueue()).averageReadyMinutes, 39, '37 minutes to Ready and 41 elapsed minutes average to 39');
database.exec("UPDATE orders SET created_at=unixepoch()-51*60 WHERE id='second'");
assert.equal((await publicQueue()).averageReadyMinutes, 44, 'Processing time continues accumulating until Ready');
database.exec("UPDATE orders SET status='Ready', ready_at=unixepoch() WHERE id='second'");
assert.equal((await publicQueue()).averageReadyMinutes, 0, 'All Ready orders leave no queued or processing work');
database.exec("INSERT INTO orders(id,created_at,status,payment_status) VALUES('fresh',unixepoch(),'Confirmed','Paid')");
assert.equal((await publicQueue()).averageReadyMinutes, 35, 'A new busy period ignores durations from the previous period');
database.exec("UPDATE orders SET created_at=unixepoch()-310*60 WHERE id='fresh'; DELETE FROM orders WHERE id<>'fresh'");
assert.equal((await publicQueue()).averageReadyMinutes, 310, 'Long elapsed waits are not hidden by the old four-hour cap');
database.exec("DELETE FROM orders; INSERT INTO orders(id,created_at,ready_at,status,payment_status) VALUES ('slow',unixepoch()-200*60,unixepoch()-100*60,'Dispatched','Paid'),('bridge',unixepoch()-110*60,unixepoch()-5*60,'Ready','Paid'),('active',unixepoch()-10*60,NULL,'Processing','Paid')");
assert.equal((await publicQueue()).averageReadyMinutes, 72, 'Overlapping orders keep Ready samples in the same busy period');
database.close();
console.log('PASS: owned queue position, FIFO ties and excluded orders');
