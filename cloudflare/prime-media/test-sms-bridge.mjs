import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleSmsBridge} from './src/sms-bridge.mjs';
const objects=new Map();let serial=0;
const env={STREAM_SIGNING_KEY:'test-server-key',MEDIA_BUCKET:{
 async get(key){const row=objects.get(key);return row?{etag:row.etag,json:async()=>JSON.parse(row.value)}:null},
 async put(key,value,options){const old=objects.get(key),condition=options?.onlyIf;if(condition?.etagMatches&&old?.etag!==condition.etagMatches)return null;if(condition?.etagDoesNotMatch==='*'&&old)return null;const etag=String(++serial);objects.set(key,{value,etag});return {etag}},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key)},
 async list({prefix,limit=100}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).slice(0,limit).map(key=>({key})),truncated:false}},
}};
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
async function call(path,{admin=false,body,headers={}}={}){const request=new Request('https://worker.example'+path,{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return handleSmsBridge(request,env,{url:new URL(request.url),admin,respond})}
assert.equal((await call('/sms/devices')).status,403);
const pair=await (await call('/sms/pairing',{admin:true,body:{label:'Owner phone'}})).json();
const phone='a'.repeat(32),paired=await (await call('/sms/pair',{body:{code:pair.code,deviceId:phone}})).json();assert.match(paired.token,/^[a-f0-9]{64}$/);
assert.equal((await call('/sms/pair',{body:{code:pair.code,deviceId:'b'.repeat(32)}})).status,403);
assert.equal((await (await call('/sms/pair',{body:{code:pair.code,deviceId:phone}})).json()).token,paired.token,'Lost pairing response is retryable');
const stamp=new Date(Date.now()+8*3600000).toISOString().slice(0,19).replace('T',' ');
const message=`${stamp}\nPayment received: PHP 946.00 via QRPH.\nTotal QR sales since 12:00 am is PHP 5,946.00.\nQR Ph Invoice No: 435346\nTRN: oTxbv7Zvyd18`;
const input={sender:'MayaBiz',body:message,receivedAt:Date.now()},headers={Authorization:'Bearer '+phone+'.'+paired.token};
assert.equal((await call('/sms/ingest',{body:input})).status,403);
assert.equal((await call('/sms/ingest',{body:{...input,sender:'Maya'},headers})).status,422);
const accepted=await (await call('/sms/ingest',{body:input,headers})).json();assert.equal(accepted.accepted,true);
assert.equal((await (await call('/sms/ingest',{body:input,headers})).json()).duplicate,true);
const service=createHmac('sha256',env.STREAM_SIGNING_KEY).update('prime-sms-server-read-v1').digest('hex');
const match=await (await call('/sms/match',{body:{type:'qrph_invoice',value:'435346'},headers:{'X-Prime-Sms-Service':service}})).json();assert.equal(match.events.length,1);assert.equal(match.events[0].amountCents,94600);assert.equal(match.events[0].body,undefined,'Raw message is not in matching responses');
assert.equal((await call('/sms/match',{admin:true,body:{type:'qrph_invoice',value:'435346'}})).status,404,'Client admin identity cannot run authoritative matching');
const row=objects.get('payment-sms/devices/'+phone+'.json');const value=JSON.parse(row.value);objects.set('payment-sms/devices/'+phone+'.json',{value:JSON.stringify({...value,revoked:true}),etag:'revoked'});
assert.equal((await call('/sms/ingest',{body:input,headers})).status,403);assert.equal((await call('/sms/pair',{body:{code:pair.code,deviceId:phone}})).status,403,'Old pairing does not reactivate revoked credentials');
console.log('PASS: SMS device pairing, scoped credentials, idempotent ingestion, exact sender, server-only matching, daily-sales exclusion and revocation.');
