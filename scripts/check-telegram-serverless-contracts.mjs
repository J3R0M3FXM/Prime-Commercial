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
  'getPublicPaymentMethods.js', 'getPublicCharges.js', 'manageCharges.js', 'manageCouriers.js', 'manageWarehouses.js', 'managePaymentMethods.js', 'manageProducts.js',
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

const adminGuard = readFileSync('tgcloud/lib/auth.js', 'utf8');
assert.match(adminGuard, /ctx\?\.initData\?\.user/, 'Admin guard must use platform-verified initData');
assert.match(adminGuard, /admin_telegram_user_id/, 'Admin guard must use a server-side allowlist');
assert.match(adminGuard, /if \(!adminId[\s\S]*userId !== adminId\)/, 'Admin guard must fail closed when allowlist is absent or mismatched');

const manageCharges = readFileSync('tgcloud/endpoints/manageCharges.js', 'utf8');
assert.match(manageCharges, /await requireAdmin\(ctx\)/, 'Charge mutations must require admin authorization');
assert.match(manageCharges, /const writable = new Set/, 'Charge CRUD must use an explicit field allowlist');
assert.match(manageCharges, /action === 'create'/, 'Charge configurator must support create');
assert.match(manageCharges, /action === 'update'/, 'Charge configurator must support update');
assert.match(manageCharges, /action === 'delete'/, 'Charge configurator must support delete');

const adminEndpoints = [
  ['manageCharges.js', 'charges'],
  ['manageCouriers.js', 'courier'],
  ['manageWarehouses.js', 'warehouse'],
  ['managePaymentMethods.js', 'payment method'],
];
for (const [file, label] of adminEndpoints) {
  const source = readFileSync('tgcloud/endpoints/' + file, 'utf8');
  assert.match(source, /await requireAdmin\(ctx\)/, file + ' must require admin authorization');
  assert.match(source, /action === 'create'/, file + ' must support create');
  assert.match(source, /action === 'update'/, file + ' must support update');
  assert.match(source, /action === 'delete'/, file + ' must support delete');
  assert.match(source, /const writable = new Set/, file + ' must use a field allowlist');
}
const managePayments = readFileSync('tgcloud/endpoints/managePaymentMethods.js', 'utf8');
assert.match(managePayments, /secretKeyConfigured/, 'Admin payment list must indicate whether a secret exists');
assert.doesNotMatch(managePayments, /return \{[^}]*secretKey[,}]/, 'Payment CRUD must not return raw secret keys');

const manageProducts = readFileSync('tgcloud/endpoints/manageProducts.js', 'utf8');
assert.match(manageProducts, /await requireAdmin\(ctx\)/, 'Product CRUD must require admin authorization');
assert.match(manageProducts, /action === 'reorder'/, 'Product configurator must support reorder');
assert.match(manageProducts, /Deliberately update only sort_order; never replace\/delete the product collection/, 'Reorder must only update sort_order');
assert.match(manageProducts, /BUNDLE_STOCK_MISMATCH/, 'Product writes must validate bundle stock totals');

const backupExporter = readFileSync('scripts/export-supabase-snapshot.mjs', 'utf8');
assert.match(backupExporter, /createCipheriv/, 'Snapshot export must encrypt data');
assert.match(backupExporter, /aes-256-gcm/, 'Snapshot export must use authenticated encryption');
assert.match(backupExporter, /receipt-proofs/, 'Snapshot export must include receipt proof storage');
assert.match(backupExporter, /SUPABASE_SERVICE_ROLE_KEY/, 'Snapshot export must require a server-side service key');
const backupVerifier = readFileSync('scripts/verify-supabase-snapshot.mjs', 'utf8');
assert.match(backupVerifier, /setAuthTag/, 'Snapshot verifier must authenticate the encrypted file');
assert.match(backupVerifier, /Table checksum mismatch/, 'Snapshot verifier must validate table checksums');
assert.match(backupVerifier, /Storage checksum mismatch/, 'Snapshot verifier must validate media checksums');
