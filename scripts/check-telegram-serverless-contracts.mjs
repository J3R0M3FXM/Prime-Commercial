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
  'health.js', 'getCatalog.js', 'getActivePromos.js', 'getPublicPaymentMethods.js',
  'getPublicCharges.js', 'getPublicCouriers.js', 'getPublicVideos.js', 'getDeliveryQuote.js',
  'getMyOrders.js', 'manageCharges.js', 'manageCouriers.js', 'manageWarehouses.js',
  'managePaymentMethods.js', 'manageProducts.js', 'managePromos.js', 'manageVideos.js',
  'manageAutomation.js',
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
  ['manageVideos.js', 'video metadata'],
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

const requiredIndexes = [
  'customers_prime_member_id_key', 'customers_referral_code_key', 'customers_tg_user_id_key',
  'idx_customers_prime_member_id', 'idx_customers_referral_code', 'idx_customers_tg_user_id',
  'maya_webhook_events_event_key_key', 'maya_webhook_events_order_id_idx', 'maya_webhook_events_payment_id_idx',
  'maya_webhook_events_received_at_idx', 'maya_webhook_events_request_reference_idx',
  'idx_orders_created_at', 'idx_orders_customer_id', 'idx_orders_order_number', 'idx_orders_payment_expiry',
  'idx_orders_payment_status', 'idx_orders_status', 'idx_orders_tg_user_id', 'orders_customer_status_created_idx',
  'orders_maya_payment_id_idx', 'orders_maya_payment_id_uidx', 'orders_maya_receipt_number_idx',
  'orders_maya_request_reference_number_idx', 'orders_maya_request_reference_uidx', 'orders_referral_pending_idx',
  'idx_products_active', 'idx_products_category',
  'promo_redemptions_active_customer_idx', 'promo_redemptions_active_device_fp_idx',
  'promo_redemptions_active_device_idx', 'promo_redemptions_active_hardware_idx',
  'promo_redemptions_active_promo_idx', 'promo_redemptions_active_server_fp_idx',
  'promo_redemptions_promo_customer_idx', 'promo_redemptions_promo_device_idx',
  'promos_code_key', 'telegram_automation_chats_pkey', 'telegram_automation_chats_activity_idx',
  'telegram_automation_flows_active_priority_idx', 'warehouses_is_default_idx', 'warehouses_single_default_idx',
];
for (const name of requiredIndexes) {
  assert.ok(schema.includes("index('" + name + "')") || schema.includes("uniqueIndex('" + name + "')"),
    'Missing target index mapping: ' + name);
}

const automationCore = readFileSync('tgcloud/lib/telegram-automation.js', 'utf8');
assert.match(automationCore, /onConflictDoUpdate/, 'Automation chat state must use upsert semantics');
assert.match(automationCore, /humanTakeoverUntil/, 'Automation must preserve human takeover state');
assert.match(automationCore, /botPaused/, 'Automation must preserve per-chat pause state');
assert.doesNotMatch(automationCore, /botPaused: false/, 'Customer activity must not unpause an explicitly paused bot');
for (const file of ['business_message.js', 'business_connection.js', 'callback_query.js']) {
  assert.ok(existsSync('tgcloud/handlers/' + file), 'Missing Telegram automation handler: ' + file);
}
const businessMessageHandler = readFileSync('tgcloud/handlers/business_message.js', 'utf8');
assert.match(businessMessageHandler, /recordHumanTakeover/, 'Business owner messages must enable human takeover');
assert.match(businessMessageHandler, /recordCustomerMessage/, 'Business messages must update customer activity');
const callbackHandler = readFileSync('tgcloud/handlers/callback_query.js', 'utf8');
assert.match(callbackHandler, /answerSecretaryCallback/, 'Secretary callbacks must always answer the callback query');
assert.match(callbackHandler, /executeSecretaryAction/, 'Secretary callbacks must execute configured actions');

const manageAutomation = readFileSync('tgcloud/endpoints/manageAutomation.js', 'utf8');
assert.match(manageAutomation, /await requireAdmin\(ctx\)/, 'Automation configuration must require admin authorization');
assert.match(manageAutomation, /getAutomationSettings/, 'Automation endpoint must preserve settings reads');
assert.match(manageAutomation, /getAutomationFlows/, 'Automation endpoint must preserve flow reads');
assert.match(manageAutomation, /setAutomationChatPaused/, 'Automation endpoint must preserve per-chat pause controls');
assert.match(automationCore, /updateAutomationSettings/, 'Automation core must persist configuration updates');
assert.match(automationCore, /createAutomationFlow/, 'Automation core must persist flow creation');
assert.match(automationCore, /updateAutomationFlow/, 'Automation core must persist flow edits');
assert.match(automationCore, /deleteAutomationFlow/, 'Automation core must persist flow deletion');

const myOrders = readFileSync('tgcloud/endpoints/getMyOrders.js', 'utf8');
assert.match(myOrders, /ctx\?\.initData\?\.user/, 'Order history must use platform-verified Telegram identity');
assert.match(myOrders, /orders\.tgUserId, telegramId/, 'Order history must always scope results to the verified Telegram user');
assert.match(myOrders, /ownership\.push\(eq\(orders\.customerId/, 'Order history may include customer-owned legacy orders');
assert.match(myOrders, /limit\(100\)/, 'Order history must be bounded');

const activePromos = readFileSync('tgcloud/endpoints/getActivePromos.js', 'utf8');
assert.match(activePromos, /totalUsageLimit/, 'Public promo display must respect total usage limits');
assert.match(activePromos, /usageCount/, 'Public promo display must compare current usage with the limit');

assert.match(activePromos, /underUsageLimit/, 'Public promo display must hide exhausted promos');
assert.match(activePromos, /return valid\.map\(\(\{ totalUsageLimit, usageCount/, 'Public promo responses must not expose internal usage counters');

const publicCouriers = readFileSync('tgcloud/endpoints/getPublicCouriers.js', 'utf8');
assert.match(publicCouriers, /eq\(couriers\.isActive, true\)/, 'Public courier options must exclude inactive couriers');
assert.doesNotMatch(publicCouriers, /db\.(insert|update|delete)/, 'Public courier endpoint must remain read-only');
assert.doesNotMatch(publicCouriers, /latitude|longitude|address/, 'Public courier endpoint must not expose warehouse location data');

const deliveryQuote = readFileSync('tgcloud/endpoints/getDeliveryQuote.js', 'utf8');
assert.match(deliveryQuote, /calculateRoadDistanceFallback/, 'Delivery quote must calculate distance server-side');
assert.match(deliveryQuote, /calculateDeliveryFee/, 'Delivery quote must calculate fees server-side');
assert.doesNotMatch(deliveryQuote, /input\?\.deliveryFee|input\.deliveryFee/, 'Delivery quote must not trust a client-supplied fee');
assert.doesNotMatch(deliveryQuote, /return \{[^}]*latitude|return \{[^}]*longitude/, 'Delivery quote must not return warehouse coordinates');

const publicVideos = readFileSync('tgcloud/endpoints/getPublicVideos.js', 'utf8');
assert.match(publicVideos, /eq\(videos\.isPublished, true\)/, 'Public video gallery must exclude unpublished media');
assert.doesNotMatch(publicVideos, /input\.includeAll|input\?\.includeAll/, 'Public video gallery must not allow clients to expose unpublished media');
assert.doesNotMatch(publicVideos, /db\.(insert|update|delete)/, 'Public video gallery must remain read-only');

const manageVideos = readFileSync('tgcloud/endpoints/manageVideos.js', 'utf8');
assert.doesNotMatch(manageVideos, /'views'\s*,|'views'\]/, 'Video views must not be writable through metadata CRUD');
assert.match(manageVideos, /await requireAdmin\(ctx\)/, 'Video metadata mutations must require admin authorization');

const promoCodec = readFileSync('tgcloud/lib/promos.js', 'utf8');
assert.match(promoCodec, /realDescription/, 'Promo description metadata must preserve the human-readable description');
assert.match(promoCodec, /activeDaysOfWeek/, 'Promo metadata must preserve active-day restrictions');
assert.match(promoCodec, /allowedPaymentMethods/, 'Promo metadata must preserve payment restrictions');
assert.match(promoCodec, /allowedCourierIds/, 'Promo metadata must preserve courier restrictions');
const managePromos = readFileSync('tgcloud/endpoints/managePromos.js', 'utf8');
assert.match(managePromos, /await requireAdmin\(ctx\)/, 'Promo mutations must require admin authorization');
assert.match(managePromos, /serializePromoDescription/, 'Promo mutations must preserve advanced metadata in description JSON');
assert.match(managePromos, /action === 'create'/, 'Promo CRUD must support create');
assert.match(managePromos, /action === 'update'/, 'Promo CRUD must support update');
assert.match(managePromos, /action === 'delete'/, 'Promo CRUD must support delete');
assert.match(activePromos, /deserializePromo/, 'Public promo display must decode the stored metadata JSON');
