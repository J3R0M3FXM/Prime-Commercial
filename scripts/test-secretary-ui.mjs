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
  },load(id){if(id==='\0css')return '';if(id==='\0bridge')return 'export const getTelegramServerlessSession=async()=>({authenticated:true,isAdmin:true,tgUserId:"111"});export const callServerless=(name,input)=>globalThis.__secretaryUI(name,input);export const uploadStaffImage=async()=>"tgmedia:fixture123";export const resolveTelegramMedia=async v=>v;';}}], output:{format:'esm'}
});
const {default:Secretary} = await import('data:text/javascript;base64,'+Buffer.from(bundled.output[0].code).toString('base64'));
const {createElement,act} = await import('react');
const {createRoot} = await import('react-dom/client');
const style=document.createElement('style');
style.textContent=readFileSync('app/components/admin/secretary-configurator.css','utf8');document.head.append(style);
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(Secretary,{serverless:true,onBack(){}})));
const buttons=()=>[...document.querySelectorAll('button')];
const click=async text=>{const button=buttons().find(b=>b.textContent.trim()===text);assert.ok(button,'Missing button '+text);await act(async()=>button.click());};
const visible=node=>!node.closest('[hidden]');
assert.equal(document.querySelectorAll('.secretary-step-card').length,1);
assert.equal(document.querySelector('[aria-current=page]').textContent,'Reply Steps');
assert.equal(visible(document.querySelector('.secretary-steps-section')),true);
assert.equal(visible(document.querySelector('.secretary-display-option')),false);
await click('Settings');
assert.equal(visible(document.querySelector('.secretary-display-option')),false,'Preview controls do not belong in automation settings');
await click('Preview');
const trigger=document.querySelector('.secretary-display-option .admin-switch-row');
assert.equal(window.getComputedStyle(trigger).display,'flex','Standalone module switches must not depend on .admin-shell');
await act(async()=>trigger.click());
assert.equal(trigger.getAttribute('aria-pressed'),'true');
assert.ok(document.querySelector('.secretary-configurator').classList.contains('is-mono'));
const disclosure=buttons().find(b=>b.textContent==='Auto Reply SettingsEnabled');
assert.equal(window.getComputedStyle(disclosure).display,'flex');
assert.equal(window.getComputedStyle(disclosure.querySelector('.admin-disclosure__title')).display,'block');
assert.ok(document.body.textContent.includes('Welcome Step · Every 12 Hours'));
await click('Preview');
assert.equal(visible(document.querySelector('.secretary-steps-section')),false);
assert.ok(document.querySelector('.secretary-message-preview'));
assert.equal(calls.length,1,'Navigation/preview must not send messages or save changes');
await click('Reply Steps');
await act(async()=>{const details=document.querySelector('.secretary-step-card');details.open=true;details.dispatchEvent(new Event('toggle'));});
await click('2. Reply');
const textarea=document.querySelector('.secretary-step-fields textarea');
const message='Keep MY customer casing {{name}}';
await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(textarea,message);textarea.dispatchEvent(new Event('input',{bubbles:true}));});
await click('3. Inline Buttons');
assert.ok(document.body.textContent.includes('Button Action'));
assert.equal(document.querySelector('.secretary-button-card input').value,'pRiMe Shop');
await click('Settings');await click('Reply Steps');
await click('Save Step');
const saved=calls.find(c=>c.input.action==='update');
assert.ok(saved);assert.equal(saved.input.responseText,message);assert.equal(saved.input.name,original.name);assert.equal(saved.input.buttons[0].text,'pRiMe Shop');assert.equal(saved.input.buttons[0].url,'https://example.com');
for(const width of [360,390,430]){
  Object.defineProperty(window,'innerWidth',{value:width,configurable:true});
  assert.equal(window.getComputedStyle(document.querySelector('.secretary-configurator')).maxWidth,'430px');
  assert.equal(window.getComputedStyle(document.querySelector('h1')).fontWeight,'400');
  assert.equal(window.getComputedStyle(document.querySelector('.secretary-configurator button')).textTransform,'none');
}
await click('New Step');assert.equal(document.querySelector('[aria-current=page]').textContent,'Reply Steps');
await click('Guide');assert.ok(buttons().some(b=>b.textContent==='How The Secretary WorksQuick Guide'));
await click('Broadcast');
const broadcast = () => document.querySelector('[aria-label="Secretary Broadcast"]');
assert.ok(broadcast());
const fill = async (element,value) => { await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value').set.call(element,value);element.dispatchEvent(new Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));}); };
await fill(broadcast().querySelector('input'), '@prime_channel');
await fill(broadcast().querySelector('textarea'), 'Preserve My Broadcast Casing');
await click('Add Inline Button');
const formInputs = broadcast().querySelectorAll('input');
await fill(formInputs[1], 'Open Shop');await fill(formInputs[2], 'https://example.com/shop');
await act(async()=>{const form=broadcast().querySelector('form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
const broadcastSends = () => calls.filter(call=>call.name==='sendSecretaryBroadcast'&&call.input.action==='send');
assert.equal(broadcastSends().length,1,'Repeated submit taps make one broadcast request');
assert.equal(broadcastSends()[0].input.message,'Preserve My Broadcast Casing');
assert.deepEqual(broadcastSends()[0].input.buttons,[{text:'Open Shop',url:'https://example.com/shop',row:1}]);
assert.equal(localStorage.getItem('prime_secretary_broadcast_v1:111'),null,'Confirmed delivery clears the local attempt');
assert.ok(broadcast().textContent.includes('Message 42'));
broadcastResult='uncertain';
await fill(broadcast().querySelector('input'), '-100123');
await fill(broadcast().querySelector('select'), 'photo');
await fill(broadcast().querySelector('input:not([type=file]):not([placeholder])'), 'https://example.com/photo.jpg');
await fill(broadcast().querySelector('textarea'), 'Photo Caption');
await act(async()=>broadcast().querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
assert.equal(broadcastSends().length,2);
const pending=JSON.parse(localStorage.getItem('prime_secretary_broadcast_v1:111'));
assert.equal(pending.draft.mediaType,'photo');assert.equal(pending.draft.message,'Photo Caption');
assert.equal(broadcast().querySelector('fieldset').disabled,true);
await click('Reply Steps');await click('Broadcast');
assert.equal(broadcast().querySelector('textarea').value,'Photo Caption','Reloading broadcast restores unresolved send');
await click('Check Send Status');assert.equal(broadcastSends().length,2,'Status checks never resend');
assert.ok(broadcast().textContent.includes('Delivery Not Confirmed'));
await act(async()=>root.unmount());
console.log('PASS: Secretary sections, Title Case/430px/font contracts, draft preservation, real save payload, broadcast inline rows, repeated-tap guard and unresolved-send recovery.');
