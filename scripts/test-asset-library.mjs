import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { build } from 'rolldown';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
const dom=new JSDOM('<div id="root"></div>',{url:'https://local.example/admin'}),require=createRequire(import.meta.url);
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const image={id:'a'.repeat(32),name:'Reusable Logo.png',contentType:'image/png',size:2048,isPublic:true,storageType:'r2',createdAt:'2026-11-18',reference:'https://prime-media-gateway.pages.dev/assets/'+'a'.repeat(32)+'/content'};
const video={...image,id:'b'.repeat(32),name:'Product Demo.mp4',contentType:'video/mp4',isPublic:false};
const calls=[],uploads=[];
globalThis.__assetTest={
  list:async()=>({assets:[image,video],warning:''}),
  upload:async(file,progress)=>{uploads.push(file.name);progress(100);return {...image,id:'c'.repeat(32),name:file.name,contentType:file.type};},
  call:async(name,input)=>{calls.push({name,input});if(name==='manageProducts')return input.action==='list'?[{id:'coffee',name:'Coffee',price:100,stock:10,imageUrl:'',variants:[{id:'v1',name:'Large',price:110,stock:5}]}]:{success:true};return [];},
};
const fixtures={name:'asset-fixtures',resolveId(id){if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};if(id.includes('telegram-serverless-client'))return '\0bridge';if(id.includes('/lib/asset-library'))return '\0assets';if(id.endsWith('.css'))return '\0css';},load(id){if(id==='\0css')return '';if(id==='\0bridge')return 'export const callServerless=(n,i)=>globalThis.__assetTest.call(n,i);export const getTelegramServerlessSession=async()=>({authenticated:true,isAdmin:true});export const resolveTelegramMedia=async x=>x;export const uploadProductImage=async()=>{throw Error("Reusing an asset must not upload");};';if(id==='\0assets')return 'export const listLibraryAssets=()=>globalThis.__assetTest.list();export const isReusableImage=a=>a.isPublic&&a.contentType.startsWith("image/");export const assetAccessUrl=async a=>a.reference;export const uploadLibraryAsset=(f,p)=>globalThis.__assetTest.upload(f,p);';}};
async function bundle(entry){const output=await build({input:entry,write:false,platform:'node',tsconfig:false,resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},plugins:[fixtures],output:{format:'esm'}});return import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));}
const Catalog=(await bundle('app/components/admin/telegram-serverless-catalog-panel.tsx')).default;
const Assets=(await bundle('app/components/admin/asset-library-panel.tsx')).default;
const {createElement,act}=await import('react'),{createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
const button=text=>[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===text);
await act(async()=>root.render(createElement(Catalog,{onBack(){}})));
await act(async()=>document.querySelector('[aria-label="Edit Coffee"]').click());
await act(async()=>button('Choose from Assets').click());
assert.ok(document.querySelector('[aria-label="Asset image picker"]'));
assert.equal(document.querySelectorAll('.asset-row').length,1,'Image picker excludes videos and private files');
await act(async()=>document.querySelector('[aria-label="Use Reusable Logo.png"]').click());
assert.equal(document.querySelector('[aria-label="Asset image picker"]'),null);
assert.equal(document.querySelector('img[alt="Product image preview"]').src,image.reference,'Selection attaches the permanent R2 URL to the product draft');
await act(async()=>document.querySelectorAll('.asset-picker-trigger')[1].click());
await act(async()=>document.querySelector('[aria-label="Use Reusable Logo.png"]').click());
assert.equal(document.querySelector('img[alt="Large image preview"]').src,image.reference,'Variants reuse the same stored image');
await act(async()=>document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const saved=calls.find(call=>call.input.action==='update');assert.equal(saved.input.imageUrl,image.reference);assert.equal(saved.input.variants[0].imageUrl,image.reference);assert.equal(uploads.length,0);
await act(async()=>root.unmount());root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(Assets,{onBack(){}})));
assert.equal(document.querySelectorAll('.asset-row').length,2,'Storage lists images and general files together');
const input=document.querySelector('[aria-label="Upload asset file"]');Object.defineProperty(input,'files',{value:[new dom.window.File(['pdf'],'Invoice.pdf',{type:'application/pdf'})]});
await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
assert.deepEqual(uploads,['Invoice.pdf']);assert.match(document.querySelector('.asset-list').textContent,/Invoice.pdf/);
await act(async()=>root.unmount());dom.window.close();
// Exercise the real library merge/filter and reference checks without live uploads.
const source=readFileSync('lib/asset-library.ts','utf8').replaceAll('import.meta.env','({})');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};new Function('exports','require','window','fetch',code)(exports,()=>({callServerless:async()=>[{id:'img-public123',path:'old.png',contentType:'image/png',size:100,visibility:'public',bucket:'product-images'},{id:'receipt123',path:'receipt.png',contentType:'image/png',visibility:'private',bucket:'receipt-proofs'}]}),{Telegram:{WebApp:{initData:'signed-telegram'}}},async()=>({ok:true,json:async()=>({assets:[image],cursor:null})}));
const listed=await exports.listLibraryAssets();assert.equal(listed.assets.length,2);assert.equal(listed.assets.some(asset=>asset.id==='receipt123'),false,'Payment proofs cannot enter the reuse picker');
assert.equal(exports.isReusableImageReference(image.reference),true);assert.equal(exports.isReusableImageReference(image.reference+'?token=expired'),false);assert.equal(exports.isReusableImageReference('https://evil.example/assets/'+image.id+'/content'),false);
console.log('PASS: Assets storage, general-file upload, image-only picker, persisted product/variant reuse without upload, Telegram merge and receipt exclusion.');
