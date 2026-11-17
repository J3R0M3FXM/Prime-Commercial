import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(path, 'utf8').replaceAll('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const memory = new Map(), storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) };
let promptCount=0, locationCount=0;
const manager = { isInited:true, isLocationAvailable:true, isAccessRequested:false, isAccessGranted:false, init:callback=>callback(), getLocation(callback) { locationCount++; if(!this.isAccessGranted)promptCount++; this.isAccessRequested=true;this.isAccessGranted=true;callback({latitude:14.5,longitude:121,horizontal_accuracy:10}); } };
const browser = { localStorage:storage, sessionStorage:storage, setTimeout, clearTimeout, Telegram:{WebApp:{LocationManager:manager,ready(){}}} };
function collector() {
  const exports={};new Function('exports','require','window','navigator',compile('app/components/fingerprint-collector.ts'))(exports,()=>({}),browser,{});return exports;
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let gps=collector();gps.startPhysicalGpsTelemetry();await flush();
assert.equal(promptCount,1,'Launch asks once');assert.equal(locationCount,1);
gps.startPhysicalGpsTelemetry();await flush();assert.equal(locationCount,1,'Remount/resume does not request again');
gps.stopPhysicalGpsTelemetry();gps.startPhysicalGpsTelemetry();await flush();assert.equal(promptCount,1,'Restart uses already-granted native permission');
manager.isAccessGranted=false;manager.isAccessRequested=false;
gps=collector();gps.startPhysicalGpsTelemetry();await flush();assert.equal(promptCount,1,'Recreated WebView respects persisted request flag even if native state is not ready');
assert.equal(memory.get('prime_launch_location_requested_v1'),'1');
const nav={userAgent:'Android',platform:'Linux',languages:['en'],language:'en',onLine:true};
const environment={...browser,Telegram:undefined,devicePixelRatio:1};
function recognition(load,timer=setTimeout) {
  const exports={};new Function('exports','require','window','navigator','screen','document','setTimeout',compile('lib/device-recognition.ts'))(exports,()=>({load}),environment,nav,{width:390,height:844,availWidth:390,availHeight:844},{createElement:()=>({getContext:()=>null})},timer);return exports;
}
let loads=0;
const retry=recognition(async()=>{if(++loads===1)throw Error('Transient SDK failure');return {get:async()=>({visitorId:'f'.repeat(32),version:'5.3.0'})};});
assert.equal((await retry.collectRecognitionSignals()).fingerprintStatus,'Unavailable');
assert.equal((await retry.collectRecognitionSignals()).fingerprintId,'f'.repeat(32),'Transient collector failures are retried');
const slow=recognition(async()=>({get:async()=>{await new Promise(resolve=>setTimeout(resolve,20));return {visitorId:'a'.repeat(32),version:'5.3.0'};}}),(callback,delay)=>setTimeout(callback,delay===10_000?2:delay));
assert.equal((await slow.collectRecognitionSignals()).fingerprintStatus,'Unavailable');
await new Promise(resolve=>setTimeout(resolve,30));
assert.equal((await slow.collectRecognitionSignals()).fingerprintId,'a'.repeat(32),'Late SDK completion is recovered on the next capture');
let savedFallback=false;
const clientWindow={setTimeout,clearTimeout,Telegram:{WebApp:{Serverless:{call(name,input,callback){if(name==='manageDeviceSecurity')callback(Error('Security history unavailable'));else {assert.equal(name,'getTelegramSession');assert.equal(input.fingerprint.fingerprintId,'f'.repeat(32));savedFallback=true;callback(null,{authenticated:true});}}}}}};
const exports={};new Function('exports','require','window','localStorage',compile('lib/telegram-serverless-client.ts'))(exports,name=>name.includes('fingerprint-collector')?{getClientFingerprint:async()=>({fingerprintId:'f'.repeat(32)})}:{setMediaOwner(){}},clientWindow,storage);
await assert.rejects(exports.recordCurrentDeviceSession({userId:'11'}),/Security history unavailable/);
assert.equal(savedFallback,true,'Failed security enrollment still saves customer fingerprint captures');
console.log('PASS: one-time launch permission, resume/reload guard, failed and slow SDK recovery, and customer fingerprint persistence fallback.');
