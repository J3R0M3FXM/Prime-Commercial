import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { JSDOM } from 'jsdom';
const require=createRequire(import.meta.url);
const dom=new JSDOM('<div id="root"></div>',{url:'https://local.example/'});
for(const key of ['window','document','navigator','HTMLElement','Event','MouseEvent'])Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const calls=[];
globalThis.__supportTabsCall=async(name,input)=>{calls.push({name,input});return name.includes('Faqs')?[{id:'faq-1',question:'How Do I Track My Order?',answer:'Open Your Orders.'}]:{tickets:[],total:0,unread:0,nextCursor:null};};
const result=await build({input:'app/components/support-tickets.tsx',platform:'node',write:false,tsconfig:false,transform:{jsx:{runtime:'automatic'}},resolve:{alias:{'@':process.cwd()}},
  onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},
  plugins:[{name:'support-fixtures',resolveId(id){
    if(id==='react'||id.startsWith('react/'))return {id:pathToFileURL(require.resolve(id)).href,external:true};
    if(id==='lucide-react')return '\0icons';
    if(id.includes('telegram-serverless-client'))return '\0bridge';
    if(id.endsWith('.css'))return '\0css';
  },load(id){if(id==='\0bridge')return 'export const callServerless=(name,input)=>globalThis.__supportTabsCall(name,input);';if(id==='\0icons')return 'export const ArrowLeft=()=>null,Headphones=()=>null,Loader2=()=>null,Plus=()=>null,RefreshCw=()=>null,Send=()=>null;';if(id==='\0css')return '';}}],output:{format:'esm'}});
const Component=(await import('data:text/javascript;base64,'+Buffer.from(result.output[0].code).toString('base64'))).default;
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
async function click(label){const button=[...document.querySelectorAll('nav button')].find(node=>node.textContent===label);assert.ok(button);await act(async()=>button.click());}
for(const admin of [false,true]) {
  await act(async()=>root.render(createElement(Component,{admin,key:String(admin)})));
  assert.equal(document.querySelectorAll('nav[aria-label="Support Sections"] button').length,2);
  assert.match(document.body.textContent,/Tickets/);
  assert.equal(document.querySelector('.support-faqs'),null,'FAQ content must not be appended to Tickets');
  await click('FAQ');
  assert.match(document.body.textContent,/How Do I Track My Order/);
  assert.equal(document.querySelector('.support-toolbar h3')?.textContent,'Frequently Asked Questions');
  assert.equal(document.querySelector('.support-list'),null,'Ticket workspace must not appear inside FAQ');
  assert.ok(calls.some(call=>call.name===(admin?'manageSupportFaqs':'getPublicSupportFaqs')));
  await click('Tickets');
  assert.equal(document.querySelector('.support-faqs'),null);
  assert.match(document.body.textContent,admin?/Customer Tickets/:/Your Tickets/);
}
await act(async()=>root.unmount());dom.window.close();
console.log('Support tabs: customer/staff FAQ and Tickets are separate, switch correctly and use role-appropriate APIs.');
