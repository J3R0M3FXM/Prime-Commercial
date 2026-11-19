import { parseMayaSms } from '../../../tgcloud/lib/payment-evidence.js';
const encoder = new TextEncoder();
const BASE = 'payment-sms/';
const RETENTION = 30 * 86400000;
const hex = value => [...new Uint8Array(value)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value))); }
async function token(env, value) {
  const key = await crypto.subtle.importKey('raw',encoder.encode(env.STREAM_SIGNING_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));
}
function same(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
async function get(env,key) { const object=await env.MEDIA_BUCKET.get(BASE+key);return object?{value:await object.json(),etag:object.etag}:null; }
async function put(env,key,value,condition) { return env.MEDIA_BUCKET.put(BASE+key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},...(condition?{onlyIf:condition}:{})}); }
async function body(request) {const raw=await request.text();if(raw.length>6000)throw Error('Request too large');return JSON.parse(raw);}
function safeDevice(row) { return {id:row.id,label:row.label,revoked:Boolean(row.revoked),createdAt:row.createdAt,lastSeen:row.lastSeen||null}; }
export async function handleSmsBridge(request,env,{url,admin,respond}) {
  if(!url.pathname.startsWith('/sms/'))return null;
  const now=Date.now();
  const server=same(request.headers.get('X-Prime-Sms-Service')||'',await token(env,'prime-sms-server-read-v1'));
  if(url.pathname==='/sms/pair'&&request.method==='POST') {
    let input;try{input=await body(request)}catch{return respond({error:'Invalid pairing request.'},400)}
    const code=String(input.code||''),id=String(input.deviceId||'');
    if(!/^[a-f0-9]{32}$/.test(code)||!/^[a-f0-9]{32}$/.test(id))return respond({error:'Invalid pairing code.'},400);
    const key='pair/'+await digest(code)+'.json',pair=await get(env,key);
    if(!pair||pair.value.expiresAt<now||(pair.value.deviceId&&pair.value.deviceId!==id))return respond({error:'Pairing code expired or already used.'},403);
    const nonce=await digest(code+':'+id),existing=await get(env,'devices/'+id+'.json');
    if(pair.value.deviceId && existing && (existing.value.nonce!==nonce||existing.value.revoked))return respond({error:'Pairing was revoked. Create a new code.'},403);
    if(!pair.value.deviceId){
      const consumed=await put(env,key,{...pair.value,deviceId:id},{etagMatches:pair.etag});
      if(!consumed)return respond({error:'Pairing changed. Retry.'},409);
    }
    if(!pair.value.deviceId || !existing) await put(env,'devices/'+id+'.json',{id,label:pair.value.label,nonce,createdAt:now,revoked:false});
    return respond({deviceId:id,token:await token(env,'sms-device:'+id+':'+nonce),sender:'MayaBiz'});
  }
  if(url.pathname==='/sms/ingest'&&request.method==='POST') {
    const auth=/^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'');
    const device=auth?await get(env,'devices/'+auth[1]+'.json'):null;
    if(!device||device.value.revoked||!same(auth[2],await token(env,'sms-device:'+auth[1]+':'+device.value.nonce)))return respond({error:'Device is not paired or was revoked.'},403);
    let input;try{input=await body(request)}catch{return respond({error:'Invalid SMS payload.'},400)}
    const sender=String(input.sender||''),text=String(input.body||'').trim();
    const parsed=parseMayaSms(sender,text);
    const receivedAt=Number(input.receivedAt);
    if(!parsed||!Number.isSafeInteger(receivedAt)||receivedAt>now+300000||receivedAt<now-RETENTION||Date.parse(parsed.paidAt)>receivedAt+300000||Date.parse(parsed.paidAt)<receivedAt-86400000)return respond({error:'Only a valid recent MayaBiz payment confirmation is accepted.'},422);
    const id=await digest('MayaBiz\n'+text),record={id,deviceId:auth[1],sender:'MayaBiz',body:text,receivedAt,ingestedAt:now,expiresAt:now+RETENTION,...parsed};
    // Canonical object and reference indexes have deterministic names: network retries are idempotent.
    const old=await get(env,'events/'+id+'.json');
    if(old&&old.value.expiresAt<now)return respond({error:'Confirmation expired.'},410);
    await put(env,'events/'+id+'.json',record,{etagDoesNotMatch:'*'});
    for(const [kind,value] of [['invoice',parsed.qrPhInvoice],['trn',parsed.mayaTrn]])await put(env,'index/'+kind+'/'+value+'/'+id+'.json',{id,expiresAt:record.expiresAt});
    // Credential revocation lives in its own object; ingestion never rewrites it.
    await put(env,'last-seen/'+auth[1]+'.json',{lastSeen:now});
    return respond({accepted:true,id,duplicate:Boolean(old)});
  }
  if(!admin&&!server)return respond({error:'Verified staff access required.'},403);
  if(url.pathname==='/sms/devices'&&request.method==='GET') {
    const page=await env.MEDIA_BUCKET.list({prefix:BASE+'devices/',limit:50});const devices=[];
    for(const object of page.objects){const row=(await get(env,object.key.slice(BASE.length)))?.value;if(!row)continue;const seen=(await get(env,'last-seen/'+row.id+'.json'))?.value;devices.push(safeDevice({...row,lastSeen:seen?.lastSeen}));}
    return respond({devices,sender:'MayaBiz',retentionDays:30});
  }
  if(url.pathname==='/sms/pairing'&&request.method==='POST') {
    if(!admin)return respond({error:'Telegram staff access required.'},403);
    let input;try{input=await body(request)}catch{return respond({error:'Invalid request.'},400)}
    const label=String(input.label||'Payment phone').trim().slice(0,80),code=hex(crypto.getRandomValues(new Uint8Array(16)));
    await put(env,'pair/'+await digest(code)+'.json',{label,expiresAt:now+600000});
    return respond({code,expiresAt:now+600000,sender:'MayaBiz'});
  }
  const revoke=/^\/sms\/devices\/([a-f0-9]{32})$/.exec(url.pathname);
  if(revoke&&request.method==='DELETE') {
    if(!admin)return respond({error:'Telegram staff access required.'},403);
    const row=await get(env,'devices/'+revoke[1]+'.json');if(!row)return respond({error:'Device not found.'},404);
    const saved=await put(env,'devices/'+revoke[1]+'.json',{...row.value,revoked:true},{etagMatches:row.etag});
    return saved?respond({revoked:true}):respond({error:'Device changed. Retry revocation.'},409);
  }
  if(url.pathname==='/sms/match'&&request.method==='POST'&&server) {
    let input;try{input=await body(request)}catch{return respond({error:'Invalid query.'},400)}
    const type=input.type,value=String(input.value||'');
    if(!((type==='qrph_invoice'&&/^\d{6}$/.test(value))||(type==='maya_trn'&&/^[A-Za-z0-9]{12}$/.test(value))))return respond({error:'Use an exact typed reference.'},400);
    const prefix=BASE+'index/'+(type==='qrph_invoice'?'invoice':'trn')+'/'+value+'/';
    const page=await env.MEDIA_BUCKET.list({prefix,limit:100});const events=[];
    for(const object of page.objects){const index=(await get(env,object.key.slice(BASE.length)))?.value;if(!index)continue;const event=(await get(env,'events/'+index.id+'.json'))?.value;
      if(event?.expiresAt>now){const {body:raw,...summary}=event;events.push(summary)}else if(event){await env.MEDIA_BUCKET.delete([BASE+'events/'+index.id+'.json',object.key]);}}
    return respond({events,truncated:Boolean(page.truncated)});
  }
  return respond({error:'Not found.'},404);
}
