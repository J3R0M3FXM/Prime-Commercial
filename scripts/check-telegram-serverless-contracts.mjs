import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const schema = readFileSync('tgcloud/schema.js', 'utf8');
const requiredTables = [
  'products', 'customers', 'orders', 'paymentMethods', 'promos',
  'promoRedemptions', 'warehouses', 'couriers', 'videos', 'charges',
  'pointTransactions', 'systemSettings', 'telegramAutomationFlows',
  'telegramAutomationSettings', 'telegramAutomationChats', 'mayaWebhookEvents',
];
for (const name of requiredTables) {
  assert.match(schema, new RegExp('export\\s+const\\s+' + name + '\\s*=\\s*table\\('), 'Missing schema table export: ' + name);
}

const requiredEndpoints = [
  'health.js', 'getCatalog.js', 'getActivePromos.js',
  'getPublicPaymentMethods.js', 'getPublicCharges.js',
];
for (const name of requiredEndpoints) {
  assert.ok(existsSync('tgcloud/endpoints/' + name), 'Missing public endpoint: ' + name);
}

const paymentMethods = readFileSync('tgcloud/endpoints/getPublicPaymentMethods.js', 'utf8');
assert.match(paymentMethods, /publicKey:\s*paymentMethods\.publicKey/, 'Public payment key must remain available to the Mini App');
assert.doesNotMatch(paymentMethods, /secretKey:\s*paymentMethods\.secretKey/, 'Never expose payment secret keys from a public endpoint');
assert.doesNotMatch(paymentMethods, /webhookUrl:\s*paymentMethods\.webhookUrl/, 'Never expose payment webhook URLs from a public endpoint');
assert.match(paymentMethods, /eq\(paymentMethods\.isActive, true\)/, 'Public payment methods must filter inactive rows');
assert.match(paymentMethods, /return rows;/, 'Payment methods endpoint must preserve the existing array response shape');

const catalog = readFileSync('tgcloud/endpoints/getCatalog.js', 'utf8');
assert.match(catalog, /eq\(products\.isActive, true\)/, 'Public catalog must filter inactive products');
assert.doesNotMatch(catalog, /db\.(insert|update|delete)/, 'Public catalog endpoint must remain read-only');
assert.match(catalog, /return rows;/, 'Catalog endpoint must preserve the existing array response shape');

const charges = readFileSync('tgcloud/endpoints/getPublicCharges.js', 'utf8');
assert.match(charges, /eq\(charges\.isActive, true\)/, 'Public charges must filter inactive rows');
assert.doesNotMatch(charges, /db\.(insert|update|delete)/, 'Public charges endpoint must remain read-only');

console.log('Telegram Serverless contracts OK: ' + requiredTables.length + ' tables, ' + requiredEndpoints.length + ' endpoint modules, public-field safeguards.');
