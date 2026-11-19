import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'rolldown';

const require = createRequire(import.meta.url);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://local.example/admin' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'localStorage'])
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.confirm = () => true;
const calls = [];
let uploads = 0, grants = 0, status = 'sent', failGrant = false;
globalThis.__broadcastCall = async (name, input) => {
  calls.push({ name, input });
  if (input.action === 'list') return { broadcasts: [] };
  const saved = JSON.parse(localStorage.getItem('prime_secretary_broadcast_v1:111'));
  assert.equal(saved.operationKey, input.operationKey, 'Attempt persisted before delivery');
  return { status, target: '-100123', messageId: 42 };
};
globalThis.__uploadVideo = async (file, progress) => {
  uploads++; progress(50);
  return { id: 'a'.repeat(32), name: file.name, contentType: 'video/mp4', storageType: 'r2', isPublic: false, reference: 'https://media.example/private' };
};
globalThis.__videoGrant = async () => {
  if (failGrant) throw Error('Access link unavailable');
  return `https://media.example/video.mp4?token=${++grants}`;
};
const bundle = await build({
  input: 'app/components/admin/secretary-broadcast-panel.tsx', platform: 'node', write: false, tsconfig: false,
  resolve: { alias: { '@': process.cwd() } }, transform: { jsx: { runtime: 'automatic' } },
  onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log); },
  plugins: [{ name: 'fixtures', resolveId(id) {
    if (id === 'react' || id.startsWith('react/')) return { id: pathToFileURL(require.resolve(id)).href, external: true };
    if (id.endsWith('/lib/telegram-serverless-client')) return '\0client';
    if (id.endsWith('/lib/asset-library')) return '\0assets';
  }, load(id) {
    if (id === '\0client') return `export const getTelegramServerlessSession=async()=>({authenticated:true,isAdmin:true,tgUserId:'111'});export const callServerless=(...args)=>globalThis.__broadcastCall(...args);export const uploadStaffImage=async()=>'tgmedia:fixture123';export const resolveTelegramMedia=async v=>v;`;
    if (id === '\0assets') return 'export const uploadLibraryAsset=(...args)=>globalThis.__uploadVideo(...args);export const assetAccessUrl=(...args)=>globalThis.__videoGrant(...args);';
  } }], output: { format: 'esm' },
});
const Panel = (await import('data:text/javascript;base64,' + Buffer.from(bundle.output[0].code).toString('base64'))).default;
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(createElement(Panel)));
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent === text);
async function click(text) { await act(async () => button(text).click()); }
async function fill(el, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function upload(file) {
  const input = document.querySelector('[aria-label="Upload broadcast video"]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
assert.ok(button('Video'), 'Video choice is visible without a dropdown');
assert.equal(document.querySelector('textarea').required, true, 'Text-only messages are required');
await click('Video');
assert.equal(document.querySelector('textarea').maxLength, 1024);
await upload(new File(['bad'], 'clip.mov', { type: 'video/quicktime' }));
assert.match(document.querySelector('[role="alert"]').textContent, /MP4/);
assert.equal(uploads, 0);
await upload(new File([new Uint8Array(20_000_001)], 'large.mp4', { type: 'video/mp4' }));
assert.equal(uploads, 0, 'Oversized video rejected before upload');
await upload(new File(['video'], 'offer.mp4', { type: 'video/mp4' }));
assert.equal(uploads, 1);
assert.equal(document.querySelector('video').getAttribute('src'), 'https://media.example/video.mp4?token=1');
await fill(document.querySelector('input[placeholder="@channelname or -100…"]'), '@primegroup');
assert.equal(document.querySelector('textarea').required, false, 'Media caption is optional');
assert.equal(button('Send Broadcast').disabled, false, 'Video without caption can be sent');
failGrant = true;
await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
assert.equal(calls.filter(call => call.input.action === 'send').length, 0, 'Grant failure cannot send');
assert.equal(localStorage.getItem('prime_secretary_broadcast_v1:111'), null);
failGrant = false; status = 'uncertain';
await act(async () => {
  const form = document.querySelector('form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
});
const sent = calls.filter(call => call.input.action === 'send');
assert.equal(sent.length, 1, 'Rapid submits cannot duplicate delivery');
assert.equal(sent[0].input.mediaType, 'video');
assert.equal(sent[0].input.message, '', 'Video can be sent without a caption');
assert.equal(sent[0].input.media, 'https://media.example/video.mp4?token=2', 'Refresh access link immediately before send');
assert.ok(button('Check Send Status'));
await click('Check Send Status');
assert.equal(calls.filter(call => call.input.action === 'send').length, 1, 'Status check never resends video');
await act(async () => root.unmount());
dom.window.close();
console.log('PASS: visible video choice, MP4 upload/limits, preview, caption, fresh access link, pre-send failure and duplicate/uncertain-send locks.');
