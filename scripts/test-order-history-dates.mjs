import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
const sqlite=new DatabaseSync(':memory:');
sqlite.exec("CREATE TABLE orders(id TEXT,order_number TEXT,tg_user_id TEXT,created_at INTEGER); INSERT INTO orders VALUES ('new','091126191100','123',1794220000),('old','311026235319','123',1793000000),('foreign','FOREIGN','999',1795000000)");
const eq=(field,value)=>({text:field+'=?',values:[value]});
const or=(...conditions)=>({text:'('+conditions.map(c=>c.text).join(' OR ')+')',values:conditions.flatMap(c=>c.values)});
const table=name=>new Proxy({_table:name},{get:(t,k)=>k==='_table'?name:String(k).replace(/[A-Z]/g,c=>'_'+c.toLowerCase())});
const db={
  select(){let name,conditions,maximum=100;const chain={from(t){name=t._table;return chain;},where(...items){conditions=items;return chain;},orderBy(){return chain;},limit(n){maximum=n;return chain;},async get(){return null;},async all(){return sqlite.prepare('SELECT * FROM '+name+' WHERE '+conditions.map(c=>c.text).join(' AND ')+' ORDER BY created_at DESC LIMIT ?').all(...conditions.flatMap(c=>c.values),maximum).map(row=>({id:row.id,orderNumber:row.order_number,tgUserId:row.tg_user_id,createdAt:{}}));}};return chain;},
  all(sql,params){return sqlite.prepare(sql).all(params);}
};
class EndpointError extends Error{constructor(message,options){super(message);this.code=options?.code;}}
const source=readFileSync('tgcloud/endpoints/getMyOrders.js','utf8').replace(/^import[^\n]*\n/gm,'').replace('export default async function','async function handler');
const handler=new Function('db','EndpointError','asc','desc','eq','or','customers','orders','findMediaAsset','ensureOrderWorkflow','attachWorkflow','expireReceiptResubmissions',source+'\nreturn handler;')(db,EndpointError,x=>x,x=>x,eq,or,table('customers'),table('orders'),async()=>null,async()=>{},async()=>({}),async()=>({cancelled:0}));
const ctx={initData:{user:{id:123}}};
await assert.rejects(handler({},{}),{code:'AUTH_REQUIRED'});
const result=await handler({},ctx);
assert.deepEqual(result.map(row=>row.id),['new','old']);
assert.equal(result[0].createdAt,1794220000);assert.equal(result[1].createdAt,1793000000);
assert.equal((await handler({orderId:'FOREIGN'},ctx)).length,0,'Deep links cannot bypass order ownership');
for(let index=0;index<101;index++)sqlite.prepare('INSERT INTO orders VALUES(?,?,?,?)').run('recent-'+index,'recent-'+index,'123',1796000000+index);
assert.equal((await handler({},ctx)).length,100);
assert.deepEqual((await handler({orderId:'311026235319'},ctx)).map(row=>row.id),['old'],'Notification links recover owned orders beyond the first 100');
assert.deepEqual((await handler({orderId:'old'},ctx)).map(row=>row.id),['old'],'Both saved IDs and displayed order numbers resolve');
sqlite.close();
console.log('PASS: scalar placement dates, newest-first ownership, old-order notification links and foreign-order denial.');
