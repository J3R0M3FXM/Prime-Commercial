import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = readFileSync('tgcloud/endpoints/manageCustomers.js','utf8').replace(/^import[\s\S]*?;\n/gm,'').replace('export default async function','async function handler');
const people = [{id:'member',tgName:'Member',primeMemberId:'ABC123',totalOrders:3},{id:'visitor',tgName:'Visitor',primeMemberId:'',totalOrders:0}];
const calls=[];
const customers = new Proxy({}, {get:(_t,key)=>String(key)});
const orders = new Proxy({}, {get:(_t,key)=>String(key)});
const pointTransactions = {};
const accountHistory = new Proxy({}, {get:(_t,key)=>String(key)});
const db={async all(sql){assert.match(sql,/count\(\*\)/);return [{customerId:'member',totalOrders:3}]},select(fields){return {from(table){calls.push({fields,table}); const query={orderBy(){return query},limit(){return query},where(){return query},async all(){if(table===customers)return people;return []},async get(){return people[0]}};return query}}}};
const handler = new Function('db','EndpointError','desc','eq','or','accountHistory','customers','orders','pointTransactions','requireAdmin',source+'\nreturn handler;')(db,Error,x=>x,(...x)=>x,(...x)=>x,accountHistory,customers,orders,pointTransactions,async ctx=>{if(!ctx.admin)throw Error('Admin required')});
await assert.rejects(handler({action:'list'},{}),/Admin required/);
const rows=await handler({action:'list'},{admin:true});
assert.equal(rows.length,2);assert.equal(rows[1].isVisitor,true);assert.equal(rows[0].totalOrders,3);
assert.equal(calls.length,1,'List must not fetch full orders');assert.ok(calls[0].fields);assert.ok(!('fingerprints' in calls[0].fields),'List excludes device blobs');assert.ok(!('latestFingerprint' in rows[0]));
calls.length=0;
const detail=await handler({action:'detail',id:'member'},{admin:true});
assert.equal(detail.id,'member');assert.ok(Array.isArray(detail.orders));
assert.ok(calls.filter(call=>call.table===orders).every(call=>call.fields&&!('paymentProofImage' in call.fields)&&!('fingerprintSnapshot' in call.fields)),'Profile orders use compact projections');
console.log('PASS: Customer profiles retain visitors, enforce admin access, avoid order scans and project profile orders.');

const sql = source.match(/const matches = await db.all\(`([\s\S]*?)`,/)[1];
const sqlite = spawnSync('python', ['-c', `
import sqlite3,json,sys
sql=sys.stdin.read()
c=sqlite3.connect(':memory:')
c.execute('create table customers(id,tg_name,tg_username,prime_member_id,fingerprints)')
for id,fp in [('own',[{'deviceId':'DEV_12345678901'}]),('match',[{'device_id':'DEV_12345678901'},{'deviceId':'DEV_12345678901'}]),('other',[{'deviceId':'DEV_99999999999'}]),('bad','invalid'),('scalar',['not an object',None,123])]:
 c.execute('insert into customers values(?,?,?,?,?)',(id,id,'','',json.dumps(fp) if not isinstance(fp,str) else fp))
r=c.execute(sql,{'id':'own','identifiers':json.dumps([{'type':'deviceId','value':'DEV_12345678901'}])}).fetchall()
assert len(r)==1 and r[0][0]=='match',r
`], {input: sql, encoding: 'utf8'});
assert.equal(sqlite.status,0,sqlite.stderr);
console.log('PASS: SQLite shared-device matching, legacy keys, deduplication, self exclusion and invalid JSON safety.');
