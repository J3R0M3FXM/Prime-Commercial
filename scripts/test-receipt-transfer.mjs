import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('lib/telegram-serverless-client.ts','utf8').replaceAll('import.meta.env','({})');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const bytes=Buffer.alloc(192*1024*2+31);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
let calls=0,broken=false;
const browser={setTimeout,clearTimeout,Telegram:{WebApp:{Serverless:{call(name,input,callback){assert.equal(name,'getMediaContent');calls++;const start=input.chunkIndex*192*1024;callback(null,{contentType:'image/jpeg',size:bytes.length,chunkIndex:input.chunkIndex,chunkCount:3,base64:(broken?bytes.subarray(start,start+10):bytes.subarray(start,start+192*1024)).toString('base64')});}}}}};
const client={};new Function('exports','require','window',code)(client,()=>({}),browser);
const first=await client.resolveTelegramMedia('tgmedia:proof');assert.match(first,/^data:image\/jpeg;base64,/);assert.deepEqual(Buffer.from(first.split(',')[1],'base64'),bytes);assert.equal(calls,3);
URL.revokeObjectURL(first);assert.equal(await client.resolveTelegramMedia('tgmedia:proof'),first);assert.equal(calls,3,'Reopening a receipt uses a stable URL after another consumer releases it');
await client.resolveTelegramMedia('tgmedia:proof',{fresh:true});assert.equal(calls,6,'Explicit retry performs a fresh authorized transfer');
broken=true;await assert.rejects(client.resolveTelegramMedia('tgmedia:bad'),/Incomplete image transfer/);broken=false;assert.match(await client.resolveTelegramMedia('tgmedia:bad'),/^data:/,'Failed transfers are retryable');
assert.equal(await client.resolveTelegramMedia('https://example.test/image.jpg'),'https://example.test/image.jpg');
const endpoint=readFileSync('tgcloud/endpoints/getMediaContent.js','utf8');assert.ok(endpoint.indexOf('canReadPrivateAsset(asset, ctx)')<endpoint.indexOf('input?.chunkIndex'),'Private media authorization precedes chunk handling');
console.log('PASS: multi-part receipt reconstruction, stable reopen URLs, fresh retries, incomplete-transfer rejection and retained authorization.');
const asset={id:'proof',fileId:'inline:proof',contentType:'image/jpeg',size:bytes.length,visibility:'private',orderId:'order'};
let contentReads=0;
let proofOrder={id:'order',tgUserId:'123'};
const tables={mediaAssets:{},mediaAssetContents:{},orders:{},customers:{},videos:{}};
const db={select(){let table;return {from(value){table=value;return this;},where(){return this;},async get(){if(table===tables.mediaAssets)return asset;if(table===tables.orders)return proofOrder;if(table===tables.mediaAssetContents){contentReads++;return {bytes:new Uint8Array(bytes)};}return null;}};}};
class EndpointError extends Error{constructor(message,options){super(message);this.code=options.code;}}
const body=endpoint.replace(/^import[^\n]*\n/gm,'').replace('export default async function','async function handler');
const read=new Function('api','db','EndpointError','eq','and','isAdminUser',...Object.keys(tables),body+';return handler;')({},db,EndpointError,()=>null,()=>null,async ctx=>Boolean(ctx.staff),...Object.values(tables));
await assert.rejects(read({id:'proof',chunkIndex:0},{initData:{user:{id:999}}}),{code:'NOT_FOUND'});assert.equal(contentReads,0,'Foreign users cannot read even the first receipt part');
const admin=await read({id:'proof',chunkIndex:1},{staff:true});assert.equal(admin.chunkCount,3);assert.deepEqual(Buffer.from(admin.base64,'base64'),bytes.subarray(192*1024,384*1024));
const owner=await read({id:'proof',chunkIndex:2},{initData:{user:{id:123}}});assert.deepEqual(Buffer.from(owner.base64,'base64'),bytes.subarray(384*1024));
await assert.rejects(read({id:'proof',chunkIndex:3},{staff:true}),{code:'INVALID_INPUT'});
console.log('PASS: authorized admin/owner receipt chunks, foreign-user denial before content reads and invalid-part rejection.');

// Existing checkout receipts use unpadded base64url stored directly on orders.
for (const length of [bytes.length, bytes.length+1, bytes.length+2]) {
  const original=Buffer.alloc(length,251);
  proofOrder={id:'order',tgUserId:'123',paymentProofImage:'inline-payment-proof:operation',paymentProofData:original.toString('base64url'),paymentProofContentType:'image/png'};
  const chunks=[];
  for(let index=0;index<Math.ceil(length/(192*1024));index++) {
    const part=await read({id:'order-payment-proof:order',chunkIndex:index},{staff:true});
    assert.equal(part.size,length);assert.equal(part.chunkIndex,index);assert.equal(part.contentType,'image/png');
    assert.ok(part.base64.length<=262144);chunks.push(part.base64);
  }
  assert.deepEqual(Buffer.from(chunks.join(''),'base64'),original);
}
await assert.rejects(read({id:'order-payment-proof:order',chunkIndex:0},{initData:{user:{id:999}}}),{code:'NOT_FOUND'});
assert.ok((await read({id:'order-payment-proof:order',chunkIndex:0},{initData:{user:{id:123}}})).base64);
await assert.rejects(read({id:'order-payment-proof:order',chunkIndex:99},{staff:true}),{code:'INVALID_INPUT'});
proofOrder.paymentProofImage='tgmedia:replacement';
await assert.rejects(read({id:'order-payment-proof:order'},{staff:true}),{code:'NOT_FOUND'});
console.log('PASS: saved inline checkout receipts, base64url padding, bounded chunks, staff/owner access and foreign-user denial.');
