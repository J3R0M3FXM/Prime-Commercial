import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'rolldown';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://local.example/admin' });
for (const key of ['window','document','navigator','HTMLElement','Event','HTMLTextAreaElement'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let confirm = true, uncertain = false, refreshed = 0;
window.confirm = () => confirm;
const calls = [];
const post = { status: 'sent', revision: 0, target: '-100123', messageId: 42, canDelete: true,
  draft: { message: 'Original Caption', mediaType: 'video', buttons: [{text:'Shop',url:'https://example.com',row:1}] } };
globalThis.__postCall = async (name, input) => {
  assert.equal(name, 'sendSecretaryBroadcast'); calls.push(input);
  if (input.action === 'detail') return structuredClone(post);
  if (input.action === 'edit') {
    post.status = uncertain ? 'edit_uncertain' : 'sent';
    if (!uncertain) { post.draft.message = input.message; post.draft.buttons = input.buttons; post.revision++; }
  } else if (input.action === 'retry_edit') { post.status = 'sent'; post.revision++; }
  else if (input.action === 'delete') { post.status = 'deleted'; post.revision++; }
  else assert.fail('Unexpected action');
  return { status: post.status };
};
const bundle = await build({ input:'app/components/admin/broadcast-post-controls.tsx', platform:'node',write:false,tsconfig:false,
  resolve:{alias:{'@':process.cwd()}},transform:{jsx:{runtime:'automatic'}},
  onLog(level,log,handler){if(log.code!=='MODULE_LEVEL_DIRECTIVE')handler(level,log);},
  plugins:[{name:'fixtures',resolveId(id){
    if(id==='react'||id.startsWith('react/'))return {id:pathToFileURL(require.resolve(id)).href,external:true};
    if(id.includes('telegram-serverless-client'))return '\0client';
  },load(id){if(id==='\0client')return 'export const callServerless=(...args)=>globalThis.__postCall(...args);';}}],output:{format:'esm'} });
const Controls = (await import('data:text/javascript;base64,'+Buffer.from(bundle.output[0].code).toString('base64'))).default;
const {createElement,act}=await import('react');
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
await act(async()=>root.render(createElement(Controls,{operationKey:'a'.repeat(32),onChanged:async()=>{refreshed++;}})));
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent===text);
const click=async text=>{assert.ok(button(text),'Missing '+text);await act(async()=>button(text).click());};
assert.equal(calls.length,0,'Details are lazy loaded');
await click('Edit / Delete Post');
assert.equal(document.querySelector('textarea').value,'Original Caption');
assert.ok(document.body.textContent.includes('existing photo or video stays attached'));
await act(async()=>{
 const field=document.querySelector('textarea');
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Changed Caption');
 field.dispatchEvent(new Event('input',{bubbles:true}));
});
await click('Remove Post Button 1');
confirm=false;await click('Save Post Changes');
assert.equal(calls.filter(row=>row.action==='edit').length,0,'Cancelled edits do not touch Telegram');
confirm=true;
await act(async()=>{button('Save Post Changes').click();button('Save Post Changes').click();});
const edits=calls.filter(row=>row.action==='edit');assert.equal(edits.length,1,'Double tap creates one edit');
assert.equal(edits[0].message,'Changed Caption');assert.deepEqual(edits[0].buttons,[]);assert.equal(edits[0].revision,0);
assert.equal(edits[0].media,undefined,'Editing never reuploads media');
assert.equal(refreshed,1);
uncertain=true;await click('Save Post Changes');
assert.ok(button('Save Post Changes').closest('fieldset').disabled,'Unconfirmed edits lock new changes');
await click('Retry Saved Edit');
assert.equal(calls.filter(row=>row.action==='retry_edit').length,1);
confirm=false;await click('Delete Post');
assert.equal(calls.filter(row=>row.action==='delete').length,0,'Deletion requires confirmation');
confirm=true;await click('Delete Post');
assert.equal(calls.filter(row=>row.action==='delete').length,1);
assert.ok(document.body.textContent.includes('Post deleted.'));assert.equal(document.querySelector('textarea'),null);
assert.equal(button('Delete Post'),undefined);
await click('Close Post Editor');
post.status='sent';post.canDelete=false;
await click('Edit / Delete Post');assert.equal(button('Delete Post').disabled,true);
assert.ok(document.body.textContent.includes('48-hour deletion window'));
await act(async()=>root.unmount());
console.log('PASS: lazy post editor, caption/button edits, confirmation, double-tap lock, saved-edit recovery, deletion and expired deletion window.');
