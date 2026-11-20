import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'rolldown';
const require=createRequire(import.meta.url),dom=new JSDOM('<div id="root"></div>',{url:'https://example.com/admin'});
for(const key of ['window','document','navigator','HTMLElement'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const calls=[];let matched=false,callbacks=0;
globalThis.__smsStatus=async(name,input)=>{assert.equal(name,'manageSmsEvidence');calls.push(input);return {receipt:{reference:'039335',amountCents:2000},result:{status:matched?'sms_corroborated':'no_sms_match',matched}};};
const output=await build({input:'app/components/admin/sms-bridge-panel.tsx',write:false,platform:'node',tsconfig:false,resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},plugins:[{name:'fixtures',resolveId(id){if(id==='react'||id.startsWith('react/'))return {id:pathToFileURL(require.resolve(id)).href,external:true};if(id.includes('telegram-serverless-client'))return '\0client';},load(id){if(id==='\0client')return 'export const callServerless=(...args)=>globalThis.__smsStatus(...args);';}}],output:{format:'esm'}});
const {ReceiptSmsEvidence}=await import('data:text/javascript;base64,'+Buffer.from(output.output[0].code).toString('base64'));
const {createElement,act}=await import('react'),{createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
let pending;
globalThis.setTimeout=(fn,ms,...args)=>ms===20000?(pending=fn,98765):originalSet(fn,ms,...args);
globalThis.clearTimeout=id=>{if(id===98765)pending=null;else originalClear(id);};
try {
 await act(async()=>root.render(createElement(ReceiptSmsEvidence,{orderId:'order',onMatched:()=>callbacks++})));
 assert.equal(calls.length,1);assert.equal(calls[0].action,'get');assert.equal(typeof pending,'function');
 matched=true;const tick=pending;pending=null;await act(async()=>tick());
 assert.equal(callbacks,1);assert.equal(pending,null,'Polling stops after a confirmed evidence match');
 assert.ok(document.body.textContent.includes('ANALYSIS PASSED'));assert.ok(document.body.textContent.includes('Staff review required'));
 assert.ok(calls.every(call=>call.action==='get'),'Background matching never invokes OCR or approval');
 await act(async()=>root.unmount());
} finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;dom.window.close();}
console.log('PASS: late SMS standby polling, analysis passed callback, no repeat OCR, no payment mutation and polling stops on match.');
