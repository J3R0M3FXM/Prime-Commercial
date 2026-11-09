import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'rolldown';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://local.example/' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const require = createRequire(import.meta.url);
const calls = []; let locationCalls = 0, networkCalls = 0;
const history = { devices: [], sessions: [], events: [], retentionDays: 90, preciseCoordinatesStored: false, serverIpAvailable: false };
globalThis.__deviceSecurityUi = {
  call: async (name, input) => { calls.push({ name, input }); return input.action === 'capabilities' ? { contextKeys: ['initData'], requestKeys: [], metadataKeys: [], ipStatus: 'No documented trusted client-IP field.' } : history; },
  record: async () => ({ sessionId: 'a'.repeat(64), deviceId: 'own-device' }),
  location: async () => { locationCalls++; return { lat: 14.5, lon: 121, accuracy: 10, source: 'Precise GPS' }; },
  network: async () => { networkCalls++; return '1.1.1.1'; },
};
async function bundle(entry) {
  const output = await build({ input: resolve(entry), platform: 'node', write: false, tsconfig: false, transform: { jsx: { runtime: 'automatic' } }, resolve: { alias: { '@': process.cwd() } },
    onLog(level, log, handler) { if (log.code !== 'MODULE_LEVEL_DIRECTIVE') handler(level, log); },
    plugins: [{ name: 'device-security-fixtures', resolveId(id) {
      if (id === 'react' || id.startsWith('react/')) return { id: pathToFileURL(require.resolve(id)).href, external: true };
      if (id.includes('telegram-serverless-client')) return '\0bridge';
      if (id.includes('fingerprint-collector')) return '\0location';
      if (id.endsWith('.css')) return '\0css';
    }, load(id) {
      if (id === '\0css') return '';
      if (id === '\0location') return 'export const getConsentedDeviceLocation=()=>globalThis.__deviceSecurityUi.location();';
      if (id === '\0bridge') return 'export const callServerless=(name,input)=>globalThis.__deviceSecurityUi.call(name,input);export const recordCurrentDeviceSession=()=>globalThis.__deviceSecurityUi.record();export const getClientObservedPublicIp=()=>globalThis.__deviceSecurityUi.network();';
    } }], output: { format: 'esm' } });
  return import('data:text/javascript;base64,' + Buffer.from(output.output[0].code).toString('base64'));
}
const { createElement, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const customer = (await bundle('app/components/device-security-panel.tsx')).default;
const admin = (await bundle('app/components/admin/device-security-dossier.tsx')).default;
const root = createRoot(document.getElementById('root'));
await act(async () => root.render(createElement(customer)));
assert.equal(locationCalls, 0); assert.equal(networkCalls, 0); assert.equal(calls.length, 0);
await act(async () => { const details = document.querySelector('details'); details.open = true; details.dispatchEvent(new Event('toggle')); });
const click = async text => { const button = [...document.querySelectorAll('button')].find(node => node.textContent === text); assert.ok(button, text); await act(async () => button.click()); };
await click('Verify My Location');
assert.equal(locationCalls, 1); assert.equal(networkCalls, 0);
const location = calls.find(call => call.input.action === 'location'); assert.ok(location);
assert.equal(location.input.consent, true); assert.equal(location.input.sessionId, 'a'.repeat(64));
assert.match(document.body.textContent, /Precise coordinates were not retained/);
await click('Check Public IP');
assert.equal(networkCalls, 1);
assert.equal(calls.find(call => call.input.action === 'network').input.reportedIp, '1.1.1.1');
assert.equal(locationCalls, 1);
await act(async () => root.render(createElement(admin, { customerId: 'customer-123' })));
await act(async () => { const details = document.querySelector('details'); details.open = true; details.dispatchEvent(new Event('toggle')); });
assert.equal(calls.find(call => call.input.action === 'staffDetail').input.customerId, 'customer-123');
await click('Inspect Runtime');
assert.match(document.body.textContent, /Context Fields: initData/);
assert.equal(document.querySelectorAll('table').length, 0);
await act(async () => root.unmount());
dom.window.close();
console.log('PASS: rendered account/staff controls, no automatic GPS or IP lookup, consent-bound actions, scoped dossier and runtime inspector');
