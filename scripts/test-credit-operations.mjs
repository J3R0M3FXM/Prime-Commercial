import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'rolldown';

const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE customers(id TEXT PRIMARY KEY,tg_user_id TEXT,prime_member_id TEXT,points NUMERIC DEFAULT 0,referral_points NUMERIC DEFAULT 0,store_credits NUMERIC DEFAULT 0,received_transfer_balance NUMERIC DEFAULT 0,store_credits_operation_id TEXT,updated_at INTEGER);
CREATE TABLE point_transactions(id TEXT PRIMARY KEY,user_id TEXT,type TEXT,amount NUMERIC,description TEXT,created_at INTEGER DEFAULT(unixepoch()),order_id TEXT);
CREATE TABLE store_credit_transfers(id TEXT PRIMARY KEY,sender_id TEXT,recipient_id TEXT,amount_cents INTEGER,created_at INTEGER DEFAULT(unixepoch()));
INSERT INTO customers(id,tg_user_id,prime_member_id,points,referral_points,store_credits) VALUES ('alice','111','ALICE001',1403.5,20,100),('bob','222','BOB00001',0,0,0);`);
const columns = { id:'id',tgUserId:'tg_user_id',primeMemberId:'prime_member_id',userId:'user_id',points:'points',referralPoints:'referral_points',storeCredits:'store_credits',receivedTransferBalance:'received_transfer_balance',senderId:'sender_id',recipientId:'recipient_id',amountCents:'amount_cents',createdAt:'created_at',type:'type',amount:'amount',description:'description',orderId:'order_id' };
const table = name => ({ name, ...columns });
const customers=table('customers'), pointTransactions=table('point_transactions'), storeCreditTransfers=table('store_credit_transfers');
const convert = row => row ? Object.fromEntries(Object.entries(row).map(([key,value])=>[Object.keys(columns).find(field=>columns[field]===key)||key,key==='created_at'?new Date(value*1000):value])) : undefined;
let ddl=0;
const db = {
  async get(sql,params={}) { return database.prepare(sql).get(params); },
  async run(sql,params={}) { if (/CREATE TRIGGER/i.test(sql)) { assert.doesNotMatch(sql,/\bSELECT\b/i,'Runtime rejects SELECT in write-mode trigger definitions'); ddl++; database.exec(sql); return {rowsAffected:0}; } const statement=database.prepare(sql); const result=statement.run(params); return {rowsAffected:Number(result.changes)}; },
  select() { return { from(t) { return { where(condition) { return { async get() { return convert(database.prepare(`SELECT * FROM ${t.name} WHERE ${condition.field}=?`).get(condition.value)); } }; } }; } }; },
  insert(t) { return { values(values) { return { async run() { const fields=Object.keys(values); database.prepare(`INSERT INTO ${t.name} (${fields.map(key=>columns[key]).join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).run(...fields.map(key=>values[key])); } }; } }; },
};
class EndpointError extends Error { constructor(message,options){super(message);this.code=options?.code;} }
const load = file => { const source=readFileSync(`tgcloud/endpoints/${file}.js`,'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default async function','async function handler');return new Function('db','EndpointError','eq','customers','pointTransactions','storeCreditTransfers',source+'\nreturn handler;')(db,EndpointError,(field,value)=>({field,value}),customers,pointTransactions,storeCreditTransfers); };
const conversion=load('convertPointsToCredits'), transfer=load('transferStoreCredits');
const ctx=id=>({initData:{user:{id}}});
const input={pointsType:'purchasing',amount:100,operationId:'a'.repeat(32)};
await assert.rejects(conversion(input,{}),error=>error.code==='AUTH_REQUIRED');
const converted=await conversion(input,ctx(111));assert.equal(converted.newPointsBalance,1303.5);assert.equal(converted.newCreditsBalance,200);
await conversion(input,ctx(111));assert.equal(ddl,1,'Installed conversion triggers must not be recreated');
await assert.rejects(conversion({...input,amount:101},ctx(111)),error=>error.code==='OPERATION_ID_CONFLICT');
await assert.rejects(conversion({...input,amount:5000,operationId:'b'.repeat(32)},ctx(111)),error=>error.code==='INSUFFICIENT_POINTS');
await conversion({pointsType:'referral',amount:20,operationId:'c'.repeat(32)},ctx(111));
const request={recipientMemberId:'BOB00001',amount:19.99,operationId:'d'.repeat(32)};
await assert.rejects(transfer(request,{}),error=>error.code==='AUTH_REQUIRED');
await Promise.all([transfer(request,ctx(111)),transfer(request,ctx(111))]);
assert.ok(ddl>=2);const setupCalls=ddl;await transfer(request,ctx(111));assert.equal(ddl,setupCalls,'Confirmed retries do not rerun trigger setup');assert.equal(database.prepare('SELECT count(*) AS n FROM store_credit_transfers').get().n,1);
assert.equal(database.prepare("SELECT store_credits AS n FROM customers WHERE id='alice'").get().n,200.01);
assert.equal(database.prepare("SELECT store_credits AS n FROM customers WHERE id='bob'").get().n,19.99);
assert.equal(database.prepare("SELECT sum(amount) AS n FROM point_transactions WHERE type LIKE 'store_credit_transfer_%'").get().n,0);
assert.equal(database.prepare("SELECT count(*) AS n FROM point_transactions WHERE type LIKE 'store_credit_transfer_%'").get().n,2);
await assert.rejects(transfer({...request,amount:20},ctx(111)),error=>error.code==='TRANSFER_CONFLICT');
await assert.rejects(transfer({recipientMemberId:'ALICE001',amount:1,operationId:'e'.repeat(32)},ctx(222)),error=>error.code==='INSUFFICIENT_TRANSFERABLE_CREDITS');
database.exec("UPDATE customers SET store_credits_operation_id='checkout' WHERE id='alice'");
await assert.rejects(transfer({...request,amount:1,operationId:'f'.repeat(32)},ctx(111)),error=>error.code==='INSUFFICIENT_TRANSFERABLE_CREDITS');
assert.equal(database.prepare('SELECT count(*) AS n FROM store_credit_transfers').get().n,1,'Failed transfers must roll back record, balances and ledger together');
database.exec("UPDATE customers SET store_credits_operation_id=NULL WHERE id='alice'");
assert.throws(()=>database.prepare("INSERT INTO store_credit_transfers VALUES ('missing-recipient','alice','missing',100,unixepoch())").run(),/Recipient/);
assert.equal(database.prepare("SELECT store_credits AS n FROM customers WHERE id='alice'").get().n,200.01,'Recipient failure rolls back sender debit');
const competing=await Promise.allSettled(['1','2'].map(character=>transfer({...request,amount:150,operationId:character.repeat(32)},ctx(111))));
assert.equal(competing.filter(result=>result.status==='fulfilled').length,1,'Only one competing transfer can spend the available balance');
assert.equal(database.prepare('SELECT sum(store_credits) AS n FROM customers').get().n,220,'Transfers conserve total credits');
assert.equal(database.prepare("SELECT sum(amount) AS n FROM point_transactions WHERE type LIKE 'store_credit_transfer_%'").get().n,0);
database.close();

const bundled=await build({input:'lib/credit-operation.ts',write:false,platform:'node',output:{format:'esm'}});
const code='data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64');
const storage=new Map();globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
const operations=await import(code);
const first=operations.beginCreditOperation('alice','transfer',{recipientMemberId:'BOB00001',amount:19.99});
assert.equal(operations.beginCreditOperation('alice','transfer',{recipientMemberId:'BOB00001',amount:19.99}).operationId,first.operationId);
const reloaded=await import(code+'#reload');
assert.equal(reloaded.beginCreditOperation('alice','transfer',{recipientMemberId:'BOB00001',amount:19.99}).operationId,first.operationId,'Reloaded sessions reuse unconfirmed requests');
assert.throws(()=>reloaded.beginCreditOperation('alice','transfer',{recipientMemberId:'BOB00001',amount:20}),/previous request/);
assert.notEqual(reloaded.beginCreditOperation('bob','transfer',{recipientMemberId:'ALICE001',amount:19.99}).operationId,first.operationId);
reloaded.finishCreditOperation(first);
assert.notEqual(reloaded.beginCreditOperation('alice','transfer',{recipientMemberId:'BOB00001',amount:19.99}).operationId,first.operationId,'Confirmed transfers may be deliberately repeated with a new ID');
console.log('PASS: runtime-safe trigger setup, atomic conversion and paired transfer ledgers, duplicate/conflict/checkout-lock safety, and account-scoped reload-stable requests.');
