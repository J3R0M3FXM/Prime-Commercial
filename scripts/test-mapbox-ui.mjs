import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'rolldown';
import {JSDOM} from 'jsdom';
const require=createRequire(import.meta.url),dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
for(const key of ['window','document','navigator','HTMLElement','Element','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const maps=[],markers=[];let supported=true,disconnects=0;
class Map {constructor(options){this.options=options;this.events={};maps.push(this);}addControl(){return this;}on(name,cb){this.events[name]=cb;return this;}resize(){}jumpTo(value){this.center=value.center;}setStyle(value){this.style=value;}remove(){this.removed=true;}}
class Marker {constructor(options){this.options=options;this.events={};markers.push(this);}setLngLat(value){this.position=value;return this;}addTo(map){this.map=map;return this;}remove(){this.map=null;return this;}on(name,cb){this.events[name]=cb;return this;}getLngLat(){return {lat:this.position[1],lng:this.position[0]};}setDraggable(value){this.draggable=value;}}
globalThis.__mapSdk={Map,Marker,NavigationControl:class{},AttributionControl:class{},supported:()=>supported};
globalThis.ResizeObserver=class{observe(){}disconnect(){disconnects++;}};
const built=await build({input:'app/components/admin/snapshot-location-map.tsx',write:false,platform:'node',tsconfig:false,resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},plugins:[{name:'map-test',resolveId(id){if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};if(id==='mapbox-gl/esm')return '\0sdk';},load(id){if(id==='\0sdk')return 'export const {Map,Marker,NavigationControl,AttributionControl,supported}=globalThis.__mapSdk;';}}],output:{format:'esm',inlineDynamicImports:true}});
const Snapshot=(await import('data:text/javascript;base64,'+Buffer.from(built.output[0].code).toString('base64'))).default;
// Bundle the picker through the same mocked SDK so tests exercise actual pin controls.
const picker=await build({input:'app/components/mapbox-view.tsx',write:false,platform:'node',tsconfig:false,resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},plugins:[{name:'map-test',resolveId(id){if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};if(id==='mapbox-gl/esm')return '\0sdk';},load(id){if(id==='\0sdk')return 'export const {Map,Marker,NavigationControl,AttributionControl,supported}=globalThis.__mapSdk;';}}],output:{format:'esm',inlineDynamicImports:true}});
const View=(await import('data:text/javascript;base64,'+Buffer.from(picker.output[0].code).toString('base64'))).default;
const {createElement,act}=await import('react'),{createRoot}=await import('react-dom/client'),root=createRoot(document.getElementById('root'));
const render=async(Component,props)=>act(async()=>root.render(createElement(Component,props)));
await render(Snapshot,{lat:null,lon:null,label:'IP Location'});assert.match(document.body.textContent,/Coordinates Not Captured/);assert.equal(maps.length,0);
await render(Snapshot,{lat:0,lon:0,label:'IP Location',approximate:true});assert.deepEqual(maps[0].options.center,[0,0]);assert.equal(maps[0].options.zoom,10);assert.match(document.body.textContent,/Approximate Network Area/);
let selected=[],armed=[];const props={lat:14.5,lon:121,pinDropArmed:false,onLocationChange:(...p)=>selected.push(p),onPinDropArmedChange:p=>armed.push(p)};
await render(View,props);let map=maps.at(-1),marker=markers.at(-1);assert.deepEqual(map.options.center,[121,14.5]);assert.match(map.options.style,/mapbox\/streets-v12/);
await act(async()=>map.events.load());assert.doesNotMatch(document.body.textContent,/Loading Map/);
await act(async()=>map.events.click({lngLat:{lat:15,lng:122}}));assert.equal(selected.length,0);
await act(async()=>document.querySelector('[aria-label="Drop Pin"]').click());assert.deepEqual(armed,[true]);
await render(View,{...props,pinDropArmed:true});assert.equal(marker.draggable,true);
await act(async()=>map.events.click({lngLat:{lat:15,lng:122}}));assert.deepEqual(selected,[[15,122]]);assert.equal(armed.at(-1),false);
const control=document.createElement('div');control.className='mapboxgl-control-container';await act(async()=>map.events.click({originalEvent:{target:control},lngLat:{lat:1,lng:1}}));assert.equal(selected.length,1);
marker.setLngLat([123,16]);await act(async()=>marker.events.dragend());assert.deepEqual(selected.at(-1),[16,123]);
await render(View,{...props,lat:0,lon:0,mapStyle:'satellite'});assert.deepEqual(map.center,[0,0]);assert.match(map.style,/satellite-streets-v12/);assert.equal(maps.at(-1),map,'Coordinate updates reuse the map');
await act(async()=>map.events.error());assert.ok(document.querySelector('[aria-label="Retry Map"]'));
supported=false;await act(async()=>document.querySelector('[aria-label="Retry Map"]').click());assert.equal(map.removed,true);assert.match(document.body.textContent,/WebGL Support/);
await act(async()=>root.unmount());assert.ok(disconnects>=2);
console.log('PASS: Mapbox coordinates, snapshot guards, approximate zoom, pin arming, clicks/dragging, recentering, styles, retry and cleanup.');
