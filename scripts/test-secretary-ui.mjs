import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'rolldown';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="mobile-portrait-viewport" class="admin-viewport"><div id="root"></div></div></body></html>', { url: 'https://local.example/admin' });
for (const key of ['window','document','navigator','localStorage','HTMLElement','HTMLInputElement','HTMLTextAreaElement','HTMLSelectElement','Event','MouseEvent'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [];
let broadcastResult = 'sent';
window.confirm = () => true;
const original = { id:'welcome', name:'Welcome / pRiMe', active:true, triggerType:'message', triggerValue:'hello', matchMode:'contains', responseText:'Hi {{name}}, pRiMe says hello.', mediaUrl:'', priority:100, buttons:[{id:'link',text:'pRiMe Shop',action:'url',url:'https://example.com',response:'',targetFlowId:''}] };
globalThis.__secretaryUI = async (name,input) => {
  calls.push({ name, input });
  if (name === 'sendSecretaryBroadcast') {
    if (input.action === 'list') return { broadcasts: [] };
    return { status: broadcastResult, target: '-100123', messageId: 42 };
  }
  assert.equal(name, 'manageAutomation');
  if (input.action === 'list') return { flows:[original], settings:{enabled:true,welcomeFlowId:'welcome',businessConnectionId:'connected'}, chats:[{businessConnectionId:'connected',chatId:123,first_name:'Customer'}] };
  if (input.action === 'update' || input.action === 'create') return {...input,id:input.id || 'created'};
  if (input.action === 'settings') return input;
  return {success:true};
};
const bundled = await build({
  input:resolve('app/components/admin/telegram-secretary-configurator.tsx'), platform:'node', write:false, tsconfig:false,
  transform:{jsx:{runtime:'automatic'}}, resolve:{alias:{'@':process.cwd()}},
  onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},
  plugins:[{name:'secretary-ui-fixtures', resolveId(id){
    if(id==='react'||id.startsWith('react/')||id==='lucide-react')return {id:pathToFileURL(require.resolve(id)).href,external:true};
    if(id.includes('telegram-serverless-client'))return '\0bridge';
    if(id.endsWith('.css'))return '\0css';
  },load(id){if(id==='\0css')return '';if(id==='\0bridge')return 'export const getTelegramServerlessSession=async()=>({authenticated:true,isAdmin:true,tgUserId:"111"});export const callServerless=(name,input)=>globalThis.__secretaryUI(name,input);export const uploadStaffImage=async()=>"tgmedia:fixture123";export const uploadStoryPhoto=async()=>"tgmedia:fixture123";export const resolveTelegramMedia=async v=>v;';}}], output:{format:'esm'}
});
const {default:Secretary} = await import('data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64'));
const {createElement,act} = await import('react');
const {createRoot} = await import('react-dom/client');
const style=document.createElement('style');
style.textContent=readFileSync('app/components/admin/secretary-configurator.css','utf8');document.head.append(style);
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(Secretary,{serverless:true,onBack(){}})));
const buttons=()=>[...document.querySelectorAll('button')];
const click=async label=>{const button=buttons().find(node=>node.textContent.trim()===label);assert.ok(button,'Missing button '+label);await act(async()=>button.click());};
assert.equal(document.querySelector('[aria-current=page]').textContent,'Flows');
assert.equal(document.querySelectorAll('.secretary-step-card').length,1);
assert.ok(document.body.textContent.includes('Welcome Step · Every 12 Hours'));
assert.equal(document.querySelector('.secretary-configurator').getBoundingClientRect().width<=430,true);
await click('Edit');
assert.equal(document.querySelector('[aria-current=page]').textContent,'Edit');
assert.ok(document.querySelector('.secretary-step-content'));
await click('2. Reply');
const textarea=document.querySelector('.secretary-step-fields textarea');
const message='Keep MY customer casing {{name}}';
await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,message);textarea.dispatchEvent(new Event('input',{bubbles:true}));});
await click('3. Inline Buttons');
assert.equal(document.querySelector('.secretary-button-card input').value,'pRiMe Shop');
await click('Save Step');
const saved=calls.find(c=>c.input?.action==='update');
assert.ok(saved);assert.equal(saved.input.responseText,message);assert.equal(saved.input.name,original.name);assert.equal(saved.input.buttons[0].text,'pRiMe Shop');
await click('Simulator');
assert.equal(document.querySelector('[aria-current=page]').textContent,'Simulator');
assert.ok(document.querySelector('.secretary-message-preview'));
assert.equal(document.querySelector('.secretary-display-option').closest('[hidden]'),null);
const trigger=document.querySelector('.secretary-display-option .admin-switch-row');
await act(async()=>trigger.click());
assert.equal(trigger.getAttribute('aria-pressed'),'true');
assert.ok(document.querySelector('.secretary-configurator').classList.contains('is-mono'));
for(const width of [360,390,430]){
  Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
  assert.equal(window.getComputedStyle(document.querySelector('.secretary-configurator')).maxWidth,'430px');
  assert.equal(window.getComputedStyle(document.querySelector('h1')).fontWeight,'400');
}
await click('Flows');
assert.equal(document.querySelector('[aria-current=page]').textContent,'Flows');
await act(async()=>root.unmount());
console.log('PASS: Secretary Flows/Edit/Simulator, compact preview, 430px typography, draft save and customer casing.');
