import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('tgcloud/endpoints/createOrder.js','utf8'),start=source.indexOf('async function settingKey('),end=source.indexOf('const epochSeconds');
const requests=[];let ipCoordinates=true;
const db={select:()=>({from:()=>({where:()=>({get:async()=>({value:'fixture-api-key'})})})})};
const fetch=async url=>{requests.push(url);if(url.startsWith('https://www.iplocate.io/'))return {ok:true,json:async()=>({ip:'203.0.113.10',latitude:ipCoordinates?14.5:null,longitude:ipCoordinates?121:null,city:'Test City'})};assert.ok(url.startsWith('https://api.tomtom.com/search/2/reverseGeocode/'));return {ok:true,json:async()=>({addresses:[{address:{freeformAddress:'Resolved Address',municipality:'Test City'}}]})};};
const enrich=new Function('db','systemSettings','eq','fetch','text',source.slice(start,end)+';return enrichOrderLocationSignals;')(db,{},()=>null,fetch,(value,max=500)=>String(value??'').slice(0,max));
const fingerprint={clientObservedIp:'203.0.113.10',deviceGps:{lat:14.6,lon:121.1},deviceLocationObservation:{lat:14.7,lon:121.2}},address={lat:14.8,lon:121.3};
await enrich(fingerprint,address);
assert.equal(fingerprint.ipLocation.provider,'IPLocate');assert.equal(fingerprint.ipLocation.latitude,14.5);assert.equal(fingerprint.ipLocation.longitude,121);assert.equal(fingerprint.ipLocation.verified,false);assert.match(fingerprint.ipLocation.precision,/Approximate/);
for(const location of [fingerprint.ipLocation,fingerprint.deviceGps,fingerprint.deviceLocationObservation]){assert.equal(location.reverseGeocodingProvider,'TomTom');assert.equal(location.reverseGeocodedAddress,'Resolved Address');}
assert.ok(requests.some(url=>url.includes('/reverseGeocode/14.5,121.json')),'IP coordinates are resolved by TomTom');
assert.equal(requests.some(url=>url.includes('mapbox')),false,'Mapbox only displays coordinates in the client');
ipCoordinates=false;const missing={clientObservedIp:'203.0.113.10'};await enrich(missing,{});assert.equal(missing.ipLocation.latitude,null);assert.equal(missing.ipLocation.longitude,null);assert.equal(missing.ipLocation.reverseGeocodedAddress,'');
const checkout=readFileSync('app/components/checkout-modal.tsx','utf8');assert.match(checkout,/getLatestPhysicalGpsLocation\(\)/);assert.match(checkout,/clientObservedIp,/);assert.match(checkout,/deviceLocationObservation: deviceLocationObservation\?\.source === 'Precise GPS'/);
console.log('PASS: IPLocate approximate coordinates, TomTom IP/GPS address enrichment, missing coordinates, and cached launch GPS checkout capture.');

const startupSource=readFileSync('tgcloud/lib/startup-location.js','utf8');
const startupFunctions=startupSource.slice(startupSource.indexOf('async function settingKey(')).replace('export async function','async function');
const enrichStartup=new Function('db','systemSettings','eq','fetch','text',startupFunctions+';return enrichStartupLocationSignals;')(db,{},()=>null,fetch,(value,max=500)=>String(value??'').slice(0,max));
ipCoordinates=true;
const launch={clientObservedIp:'203.0.113.10',deviceLocationObservation:{lat:14.7,lon:121.2}};
await enrichStartup(launch,{});
assert.equal(launch.ipLocation.provider,'IPLocate');
assert.equal(launch.deviceLocationObservation.reverseGeocodingProvider,'TomTom');
assert.equal(launch.ipLocation.reverseGeocodingProvider,'TomTom');
console.log('PASS: startup IPLocate and TomTom enrichment uses captured launch IP and GPS.');
