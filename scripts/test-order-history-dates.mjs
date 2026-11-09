import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec("CREATE TABLE orders(id TEXT,created_at INTEGER); INSERT INTO orders VALUES ('new',1794220000),('old',1793000000),('foreign',1795000000)");
const rows = [{ id: 'new', orderNumber: '091126191100', createdAt: {} }, { id: 'old', orderNumber: '311026235319', createdAt: {} }];
const db = {
  select() { return { from() { return { where() { return { get: async () => null, orderBy() { return { limit() { return { all: async () => rows }; } }; } }; } }; } }; },
  all(sql, params) { return sqlite.prepare(sql).all(params); },
};
class EndpointError extends Error { constructor(message, options) { super(message); this.code = options?.code; } }
const source = readFileSync('tgcloud/endpoints/getMyOrders.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export default async function', 'async function handler');
const handler = new Function('db','EndpointError','asc','desc','eq','or','customers','orders','findMediaAsset', source + '\nreturn handler;')(db,EndpointError,x=>x,x=>x,()=>true,()=>true,{}, {}, async()=>null);
await assert.rejects(handler({},{}), error => error.code === 'AUTH_REQUIRED');
const result = await handler({}, { initData: { user: { id: 123 } } });
assert.deepEqual(result.map(row=>row.id), ['new','old'], 'Preserve placement order instead of comparing day-first order numbers');
assert.equal(result[0].createdAt,1794220000);
assert.equal(result[1].createdAt,1793000000);
assert.equal(result.some(row=>row.id==='foreign'),false);
sqlite.close();
console.log('PASS: order history returns scalar placement dates and preserves newest-first owned results.');
