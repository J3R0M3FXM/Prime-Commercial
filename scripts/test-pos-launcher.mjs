import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {build} from 'rolldown';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const manifest=JSON.parse(readFileSync('public/pos/manifest.webmanifest','utf8'));
assert.equal(manifest.start_url,'/pos/?launch=1');
assert.equal(manifest.scope,'/pos/');assert.equal(manifest.display,'standalone');
assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
for(const size of [192,512]){const png=readFileSync(`public/pos/icon-${size}.png`);assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);}
const source=readFileSync('public/pos/launcher.js','utf8');
async function launcher({standalone=false,search=''}={}){
 const dom=new JSDOM(readFileSync('public/pos/index.html','utf8'),{url:'https://local.example/pos/index.html'});
 const events={},navigations=[],registrations=[];
 const browser={matchMedia:()=>({matches:standalone}),location:{search,assign:value=>navigations.push(value)},addEventListener:(name,handler)=>events[name]=handler};
 vm.runInNewContext(source,{window:browser,document:dom.window.document,navigator:{serviceWorker:{register:async(...args)=>registrations.push(args)}},URLSearchParams});
 assert.deepEqual(JSON.parse(JSON.stringify(registrations)),[['/pos/worker.js',{scope:'/pos/'}]]);
 return {dom,events,navigations};
}
const setup=await launcher();assert.equal(setup.navigations.length,0,'The install page must stay open');
let prompts=0;setup.events.beforeinstallprompt({preventDefault(){},prompt:async()=>prompts++,userChoice:Promise.resolve({outcome:'accepted'})});
assert.equal(setup.dom.window.document.getElementById('install').hidden,false);
setup.dom.window.document.getElementById('install').click();await new Promise(resolve=>setImmediate(resolve));
assert.equal(prompts,1);assert.match(setup.dom.window.document.getElementById('install-help').textContent,/Installed/);
for(const options of [{standalone:true},{search:'?launch=1'}]){
 const app=await launcher(options);assert.deepEqual(app.navigations,['https://t.me/primenetworkphbot?startapp=pos']);app.dom.window.close();
}
setup.dom.window.close();
// The launch worker must leave business requests outside its fetch handler.
const handlers={};vm.runInNewContext(readFileSync('public/pos/worker.js','utf8'),{self:{location:{origin:'https://local.example'},addEventListener:(name,handler)=>handlers[name]=handler},URL});
for(const path of ['/admin','/api/orders','/pos/worker.js','/pos/launcher.js?token=private'])handlers.fetch({request:{method:'GET',url:'https://local.example'+path,mode:'cors'},respondWith(){assert.fail('Non-launcher data must not be cached');}});

const dom=new JSDOM('<div id="root"></div>',{url:'https://local.example/admin?view=pos'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.requestAnimationFrame=callback=>setTimeout(callback,0);globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__staffAllowed=true;
const require=createRequire(import.meta.url);
const result=await build({input:'app/admin/page.tsx',write:false,platform:'node',tsconfig:false,transform:{jsx:{runtime:'automatic'}},resolve:{alias:{'@':process.cwd()}},onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},plugins:[{name:'admin-gate-test',resolveId(id){if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};if(id.includes('telegram-serverless-client'))return '\0client';if(id.startsWith('@/app/components/'))return '\0component:'+id;},load(id){if(id==='\0client')return `export const getTelegramServerlessSession=async()=>({authenticated:globalThis.__staffAllowed,isAdmin:globalThis.__staffAllowed});export const callServerless=async()=>[];`;if(id.startsWith('\0component:'))return `import React from 'react';export default function Stub(){return React.createElement('div',{'data-component':${JSON.stringify(id.split('/').at(-1))}});}`;}}],output:{format:'esm'}});
const Page=(await import('data:text/javascript;base64,'+Buffer.from(result.output[0].code).toString('base64'))).default;
const {createElement,act}=await import('react'),{createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
const render=async key=>{await act(async()=>root.render(createElement(Page,{key})));await act(async()=>new Promise(resolve=>setTimeout(resolve,30)));};
await render('staff');assert.ok(document.querySelector('[data-component="telegram-serverless-pos-panel"]'),'Staff deep link opens directly in POS');
globalThis.__staffAllowed=false;await render('guest');assert.equal(document.querySelector('[data-component="telegram-serverless-pos-panel"]'),null);assert.match(document.body.textContent,/Verified Telegram staff access is required/);
await act(async()=>root.unmount());dom.window.close();
console.log('PASS: install prompt, direct Telegram launch, scoped public-only worker and authorized/unauthorized POS entry.');
