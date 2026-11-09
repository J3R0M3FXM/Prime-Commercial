import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class EndpointError extends Error { constructor(message, options) { super(message); this.code = options?.code; } }
let saved;
const db = { update: () => ({ set: values => { saved = values; return { where: () => ({ returning: () => ({ run: async () => [{ id: 'method', ...values }] }) }) }; } }) };
const requireAdmin = async ctx => { if (!ctx?.admin) throw new EndpointError('Admin required', { code: 'ADMIN_REQUIRED' }); };
const source = readFileSync('tgcloud/endpoints/managePaymentMethods.js', 'utf8').replace(/^import[^\n]*\n/gm, '').replace('export default async function', 'async function handler');
const handler = new Function('URL', 'db', 'EndpointError', 'requireAdmin', 'paymentMethods', 'eq', source + '\nreturn handler;')(undefined, db, EndpointError, requireAdmin, { id: 'id' }, () => true);
const update = link => ({ action: 'update', id: 'method', paymentType: 'secured_payment_link', paymentLinkUrl: link, publicKey: '', isActive: false });
await assert.rejects(handler(update('https://paymaya.me/BTXN'), {}), error => error.code === 'ADMIN_REQUIRED');
for (const link of ['https://paymaya.me/BTXN', 'https://checkout.example.com/pay?id=123&ref=a%2Fb#receipt', 'HTTPS://example.com:443/pay']) {
  await handler(update(link), { admin: true });
  assert.equal(saved.publicKey, link, 'Link must survive the legacy publicKey field and missing URL global');
  assert.equal(saved.isActive, false);
  await handler({ publicKey: '', ...update(link) }, { admin: true });
  assert.equal(saved.publicKey, link);
}
for (const link of ['http://paymaya.me/BTXN', 'javascript:alert(1)', 'https://', 'https://user:password@example.com', 'https://example.com\\@evil.com', 'https://exa mple.com', 'https://example.com:99999', 'https://-example.com', 'https://example.com/\npath']) {
  await assert.rejects(handler(update(link), { admin: true }), error => error.code === 'INVALID_PAYMENT_LINK');
}
await handler({ action: 'update', id: 'method', name: 'Renamed' }, { admin: true });
assert.equal(Object.hasOwn(saved, 'publicKey'), false, 'Unrelated changes must preserve the saved link');
await handler({ action: 'update', id: 'method', paymentType: 'api', publicKey: 'provider-key', paymentLinkUrl: '' }, { admin: true });
assert.equal(saved.publicKey, 'provider-key', 'An empty link field must not erase an API key');
console.log('PASS: payment links save without browser globals, preserve availability and reject unsafe URLs.');
