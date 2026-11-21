import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { sanitizeFingerprint, saveCustomerFingerprint } from '../tgcloud/lib/fingerprints.js';
const code = ts.transpileModule(readFileSync('lib/startup-capture.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const flush = async () => { for (let n=0;n<20;n++) await Promise.resolve(); };
function setup({ gps = null, ip = '203.0.113.4', hang = false } = {}) {
  let time=1000, stopped=0, requested=0, advancedResolve, gpsResolve, signal;
  const timers=new Map();let next=0;
  const clockSet=(fn,delay)=>{const id=++next;timers.set(id,{fn,at:time+delay});return id;};
  const advance=ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}};
  const collector={getClientFingerprint: options=>options?.advanced===false?Promise.resolve({deviceId:'DEV_test',fingerprintStatus:'Pending'}):hang?new Promise(resolve=>advancedResolve=resolve):Promise.resolve({deviceId:'DEV_test',fingerprintId:'f'.repeat(32),fingerprintStatus:'Available'}),
    startPhysicalGpsTelemetry: budget=>{requested++;assert.equal(budget,11000);},stopPhysicalGpsTelemetry:()=>stopped++,getLatestPhysicalGpsLocation:()=>gps,
    waitForPhysicalGps:()=>hang?new Promise(resolve=>gpsResolve=resolve):Promise.resolve(gps)};
  const fetch=(_url,options)=>{signal=options.signal;return hang?new Promise(()=>{}):Promise.resolve({ok:true,json:async()=>({ip})});};
  class FakeDate extends Date {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
  const exports={};new Function('exports','require','fetch','setTimeout','clearTimeout','Date','AbortController',code)(exports,()=>collector,fetch,clockSet,id=>timers.delete(id),FakeDate,AbortController);
  return {exports,advance,get stopped(){return stopped;},get requested(){return requested;},get signal(){return signal;},late:()=>{advancedResolve?.({fingerprintId:'late'});gpsResolve?.({lat:1,lon:2});}};
}
const success=setup({gps:{lat:14.5,lon:121,accuracy:12,source:'Precise GPS'}});
const first=success.exports.startStartupCapture();assert.equal(first,success.exports.startStartupCapture());await flush();
const result=await first;
assert.equal(success.requested,1);assert.equal(result.clientObservedIp,'203.0.113.4');assert.equal(result.fingerprintStatus,'Available');assert.equal(result.gpsStatus,'Available');assert.equal(success.stopped,1);
assert.equal(success.exports.startupProgress(0),0);assert.equal(success.exports.startupProgress(6000),50);assert.equal(success.exports.startupProgress(11000),91);assert.equal(success.exports.startupProgress(11999),99);assert.equal(success.exports.startupProgress(12000),100);
const failed=setup({hang:true});let released=false;const pending=failed.exports.startStartupCapture().then(value=>{released=true;return value;});await flush();failed.advance(10999);await flush();assert.equal(released,false);
failed.advance(1);await flush();assert.equal(released,true);assert.equal(failed.signal.aborted,true);assert.equal(failed.stopped,1);const partial=await pending;assert.equal(partial.deviceId,'DEV_test');assert.equal(partial.fingerprintStatus,'Unavailable');assert.equal(partial.publicIpStatus,'Unavailable');assert.equal(partial.gpsStatus,'Unavailable');
failed.late();await flush();assert.equal(failed.exports.getStartupSnapshot().fingerprintId,undefined,'Late callbacks cannot change the finalized launch record');
const missing=setup({ip:'',gps:null});const unavailable=await missing.exports.startStartupCapture();assert.equal(unavailable.publicIpStatus,'Unavailable');assert.equal(unavailable.gpsStatus,'Unavailable');
const clean=await sanitizeFingerprint({...result,ipLocation:{verified:true},deviceLocationObservation:{lat:14.5,lon:121,accuracy:12,verified:true}});
assert.equal(clean.clientObservedIp,'203.0.113.4');assert.equal(clean.deviceLocationObservation.verified,false);assert.equal(clean.ipLocation,undefined);
assert.equal((await sanitizeFingerprint({deviceLocationObservation:{lat:null,lon:121}})).deviceLocationObservation,null);
const saved=await saveCustomerFingerprint({tgUserId:'11',fingerprints:[]},{...result,sessionToken:'test'},new Date(),{ipLocation:{provider:'IPLocate',verified:false},deviceLocationObservation:clean.deviceLocationObservation});assert.equal(saved.latestFingerprint.ipLocation.provider,'IPLocate');
const entry=readFileSync('app/telegram-entry.tsx','utf8');assert.match(entry,/elapsed >= STARTUP_DURATION_MS/);assert.match(entry,/hidden={!startupDone}/);assert.match(entry,/<SplashScreen progress={captureProgress}/);
const splash=readFileSync('app/components/splash-screen.tsx','utf8');assert.match(splash,/role="progressbar"/);assert.match(splash,/aria-valuenow={displayedProgress}/);
console.log('PASS: parallel startup collection, one launch clock, 11-second failure release, frozen partial evidence, 12-second progress, GPS/IP persistence and provider provenance.');
