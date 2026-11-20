import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {JSDOM} from 'jsdom';
import {build} from 'rolldown';
const require=createRequire(import.meta.url);
const helper=ts.transpileModule(readFileSync('lib/receipt-scan-presentation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {waitForReceiptScanPresentation}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
const originalNow=Date.now,originalTimeout=globalThis.setTimeout;
let now=100000,scheduled;
Date.now=()=>now;globalThis.setTimeout=(callback,delay)=>{scheduled={callback,delay};return 1};
try {
 const fast=waitForReceiptScanPresentation(now);assert.equal(scheduled.delay,23000,'Fast analysis keeps the requested 23-second display');
 scheduled.callback();await fast;scheduled=null;
 now+=30000;await waitForReceiptScanPresentation(100000);assert.equal(scheduled,null,'Slow real analysis is never padded further');
} finally {Date.now=originalNow;globalThis.setTimeout=originalTimeout;}
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.com'});
for(const key of ['window','document','navigator','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const output=await build({input:'app/components/receipt-analysis-card.tsx',write:false,platform:'node',tsconfig:false,resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},plugins:[{name:'react',resolveId(id){if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};}}],output:{format:'esm'}});
const {default:Card}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const {createElement,act}=await import('react');const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const originalInterval=globalThis.setInterval,originalClear=globalThis.clearInterval;
let interval,previews=0,rescans=0,replacements=0,submits=0;
Date.now=()=>now;globalThis.setInterval=callback=>{interval=callback;return 1};globalThis.clearInterval=()=>{interval=null};
const props={image:'data:image/png;base64,AAAA',analysis:null,busy:true,error:'',scanVersion:1,submitting:false,canSubmit:true,onPreview:()=>previews++,onRescan:()=>rescans++,onReplace:()=>replacements++,onSubmit:()=>submits++,onClose:()=>{}};
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
const render=async patch=>{Object.assign(props,patch);await act(async()=>root.render(createElement(Card,props)));};
try {
 await render({});assert.ok(document.body.textContent.includes('FORENSICS IMAGE ANALYSIS'));assert.ok(document.body.textContent.includes('up to 45 seconds'));
 for(const name of ['PREVIEW','RE-SCAN','REPLACE','SUBMIT']){assert.equal(button(name).disabled,true);button(name).click();}
 assert.equal(previews+rescans+replacements+submits,0);
 now+=23000;await act(async()=>interval());
 assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'95','Elapsed animation alone does not report completed analysis');
 assert.ok(document.body.textContent.includes('Waiting for analysis results'));assert.equal(document.querySelector('table'),null);
 await render({busy:false,analysis:{matchStatus:'ANALYSIS_COMPLETED',paymentEvidence:{paidAt:'2026-11-20T00:16:42Z',amountCents:2700,fullReference:'000344491'}}});
 assert.equal(interval,null,'Progress timer is cleaned up');
 assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'100');
 assert.ok(document.querySelector('table').textContent.includes('₱27.00'));assert.ok(document.querySelector('table').textContent.includes('000344491'));assert.ok(document.querySelector('table').textContent.includes('Nov'));
 for(const name of ['PREVIEW','RE-SCAN','REPLACE','SUBMIT']){assert.equal(button(name).disabled,false);await act(async()=>button(name).click());}
 assert.equal(previews,1);assert.equal(rescans,1);assert.equal(replacements,1);assert.equal(submits,1);
 await render({busy:false,analysis:null});assert.ok(document.body.textContent.includes('saved receipt needs analysis'));assert.equal(button('SUBMIT').disabled,true);
 await render({busy:true,scanVersion:2,analysis:null});assert.equal(button('SUBMIT').disabled,true);
 assert.equal(document.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'),'0','Re-scan restarts progress');
 await render({busy:false,error:'Unreadable image'});assert.equal(button('SUBMIT').disabled,true);assert.ok(document.querySelector('[role="alert"]'));
 await render({error:'',analysis:{matchStatus:'ANALYSIS_COMPLETED',ocrStatus:'unavailable'}});
 assert.ok(document.querySelector('table').textContent.includes('Not found'),'Missing OCR data is never invented');
 await render({submitting:true});assert.equal(button('SUBMITTING…').disabled,true);
} finally {
 await act(async()=>root.unmount());Date.now=originalNow;globalThis.setInterval=originalInterval;globalThis.clearInterval=originalClear;
}
const source=readFileSync('app/components/checkout-modal.tsx','utf8');
assert.ok(source.includes('await waitForReceiptScanPresentation(analysisStartedAt)'));
assert.ok(source.includes('if (isAnalyzingReceipt || ocrAnalysis?.matchStatus !== "ANALYSIS_COMPLETED")'));
console.log('PASS: 23-second minimum, real-result completion, disabled actions, metadata precision, missing-data disclosure, re-scan, errors and submit locks.');
