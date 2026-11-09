import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'rolldown';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://local.example/admin' });
for (const key of ['window','document','navigator','HTMLElement','HTMLCanvasElement','HTMLAnchorElement','Event','MouseEvent','File','Blob','FileReader']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(document, 'fonts', { value: { load: async () => [{}] }, configurable: true });
globalThis.Image = class { set src(value) { this.url = value; queueMicrotask(() => this.onload?.()); } };
const contexts = new WeakMap();
HTMLCanvasElement.prototype.getContext = function () {
  if (!contexts.has(this)) {
    const context = { operations: [], scale(...args) { this.operations.push(['scale',...args]); }, clearRect(...args) { this.operations.push(['clearRect',...args]); }, fillRect(...args) { this.operations.push(['fillRect',...args]); }, drawImage(...args) { this.operations.push(['drawImage',...args]); }, fillText(...args) { this.operations.push(['fillText',this.font,...args]); }, measureText(text) { return { width: Array.from(text).length * Number((this.font || '72px').match(/(\d+)px/)?.[1] || 72) * .6 }; } };
    contexts.set(this, context);
  }
  return contexts.get(this);
};
HTMLCanvasElement.prototype.toBlob = function (callback) { callback(new Blob([new Uint8Array([137,80,78,71,13,10,26,10,1,2,3])], { type: 'image/png' })); };
let download, blobFile;
HTMLAnchorElement.prototype.click = function () { download = { href: this.href, filename: this.download }; };
URL.createObjectURL = file => { blobFile = file; return 'blob:fixture-voucher'; };
URL.revokeObjectURL = () => {};
const calls = [];
globalThis.__voucherBridge = async (name, input) => { calls.push({name,input}); return input.action === 'send' ? {success:true,messageId:42} : {success:true}; };
const require = createRequire(import.meta.url);
const result = await build({ input: resolve('app/components/admin/voucher-generator.tsx'), platform: 'node', write: false, tsconfig: false,
  transform: { jsx: { runtime: 'automatic' } },
  plugins: [{ name: 'fixture', resolveId(id) {
    if (id === 'react' || id.startsWith('react/') || id === 'lucide-react') return { id: pathToFileURL(require.resolve(id)).href, external: true };
    if (id.includes('telegram-serverless-client')) return '\0bridge';
    if (id.endsWith('.css')) return '\0css';
  }, load(id) { if (id === '\0css') return ''; if (id === '\0bridge') return 'export const callServerless=(name,input)=>globalThis.__voucherBridge(name,input);'; } }], output: { format: 'esm' } });
const { default: VoucherGenerator, makeVoucherCode, drawVoucher } = await import('data:text/javascript;base64,' + Buffer.from(result.output[0].code).toString('base64'));
const codes = new Set(Array.from({ length: 100 }, makeVoucherCode));
assert.equal(codes.size, 100); assert.ok([...codes].every(code => /^PRIME-[0-9A-F]{16}$/.test(code)));
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(createElement(VoucherGenerator, { code: 'PRIME-TEST2026', active: true, onClose() {} })));
const preview = document.querySelector('.voucher-generator__render');
assert.ok(document.querySelector('img.voucher-generator__preview'), 'The generated image can be long-pressed where the browser supports it');
const qr = document.querySelector('.voucher-generator__qr');
const paint = contexts.get(preview).operations;
assert.deepEqual([preview.width,preview.height],[1836,857]);
assert.ok(paint.some(op => op[0] === 'fillText' && op[1].includes('700') && op[1].includes('IBM Plex Mono') && op[2] === 'PRIME-TEST2026'));
assert.ok(paint.some(op => op[0] === 'drawImage' && op[1] === qr && op[2] === 1052 && op[3] === 418), 'QR canvas goes inside the designated placeholder');
assert.ok(contexts.get(qr).operations.filter(op => op[0] === 'fillRect').length > 100, 'A real QR matrix is drawn');
const longCode = 'A'.repeat(80), longContext = { ...contexts.get(preview), operations: [] };
drawVoucher(longContext, {}, {}, longCode);
assert.equal(longContext.operations.filter(op => op[0] === 'fillText').map(op => op[2]).join(''), longCode, 'Long saved codes remain complete');
assert.ok(longContext.operations.filter(op => op[0] === 'fillText').length <= 3);
window.setTimeout = () => 1;
const click = async text => { const button = [...document.querySelectorAll('button')].find(node => node.textContent.includes(text)); assert.ok(button && !button.disabled, text); await act(async () => button.click()); };
await click('Download PNG');
assert.equal(download.filename, 'PRIME-Voucher-PRIME-TEST2026.png'); assert.equal(blobFile.type, 'image/png');
let shared;
Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.length === 1 });
Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { shared = data; } });
await click('Share File');
assert.equal(shared.files[0].name, download.filename);
assert.equal(shared.files[0].type, 'image/png');
assert.match(document.body.textContent, /Check your selected app to confirm delivery/);
const send = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Send to Telegram'));
await act(async () => { send.click(); await new Promise(resolve => setTimeout(resolve, 50)); });
assert.deepEqual(calls.map(call => call.input.action), ['start','chunk','send']);
assert.equal(calls[0].input.fileName, download.filename);
assert.equal(calls[2].name, 'sendVoucherToTelegram');
assert.match(document.body.textContent, /Voucher sent to your PRIME bot chat/);
await act(async () => root.unmount()); dom.window.close();
console.log('PASS: voucher composition, QR placement, long codes, PNG download and confirmed Telegram delivery flow.');
