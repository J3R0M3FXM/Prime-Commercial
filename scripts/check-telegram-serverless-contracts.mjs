import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const schema = readFileSync('tgcloud/schema.js', 'utf8');
const requiredTables = [
  'products', 'customers', 'orders', 'paymentMethods', 'promos',
  'promoRedemptions', 'warehouses', 'couriers', 'videos', 'charges',
  'pointTransactions', 'systemSettings', 'telegramAutomationFlows',
  'telegramAutomationSettings', 'telegramAutomationChats', 'mayaWebhookEvents',
  'deviceRegistrations', 'deviceSecuritySessions', 'deviceSecurityEvents',
];
for (const name of requiredTables) {
  assert.match(schema, new RegExp('export\\s+const\\s+' + name + '\\s*=\\s*table\\('), 'Missing schema table export: ' + name);
}

const requiredEndpoints = [
  'health.js', 'getCatalog.js', 'getActivePromos.js', 'getPublicPaymentMethods.js',
  'getPublicCharges.js', 'getPublicCouriers.js', 'getPublicVideos.js', 'getDeliveryQuote.js',
  'getMyOrders.js', 'validatePromo.js', 'manageCharges.js', 'manageCouriers.js', 'manageWarehouses.js',
  'managePaymentMethods.js', 'manageProducts.js', 'managePromos.js', 'manageVideos.js',
  'manageAutomation.js', 'getMediaContent.js', 'manageMediaAssets.js',
];
for (const name of requiredEndpoints) {
  assert.ok(existsSync('tgcloud/endpoints/' + name), 'Missing public endpoint: ' + name);
}

const paymentMethods = readFileSync('tgcloud/endpoints/getPublicPaymentMethods.js', 'utf8');
assert.match(paymentMethods, /publicKey:\s*paymentMethods\.publicKey/, 'Public payment key must remain available to the Mini App');
assert.doesNotMatch(paymentMethods, /secretKey:\s*paymentMethods\.secretKey/, 'Never expose payment secret keys from a public endpoint');
assert.doesNotMatch(paymentMethods, /webhookUrl:\s*paymentMethods\.webhookUrl/, 'Never expose payment webhook URLs from a public endpoint');
assert.match(paymentMethods, /eq\(paymentMethods\.isActive, true\)/, 'Public payment methods must filter inactive rows');
assert.match(paymentMethods, /return rows\.map\(/, 'Payment methods endpoint must preserve the existing array response shape');

const catalog = readFileSync('tgcloud/endpoints/getCatalog.js', 'utf8');
assert.match(catalog, /eq\(products\.isActive, true\)/, 'Public catalog must filter inactive products');
assert.doesNotMatch(catalog, /db\.(insert|update|delete)/, 'Public catalog endpoint must remain read-only');
assert.match(catalog, /return await Promise\.all\(rows\.map/, 'Catalog endpoint must preserve the array response shape while resolving media references');

const charges = readFileSync('tgcloud/endpoints/getPublicCharges.js', 'utf8');
assert.match(charges, /eq\(charges\.isActive, true\)/, 'Public charges must filter inactive rows');
assert.doesNotMatch(charges, /db\.(insert|update|delete)/, 'Public charges endpoint must remain read-only');
assert.match(charges, /amount:\s*charges\.rate/, 'Public charges must map rate to the Mini App amount field');
assert.match(charges, /value:\s*charges\.rate/, 'Public charges must map rate to the Mini App value field');
assert.match(charges, /schedules,/, 'Public charges must expose decoded schedule metadata to the Shopfront');
assert.match(charges, /isDefault,/, 'Public charges must expose the configured default-charge flag');

const paymentSession = readFileSync('tgcloud/endpoints/createPaymentSession.js', 'utf8');
assert.match(paymentSession, /existing\.status === 'consumed'/, 'Consumed payment sessions must be replaced with a distinct proof-session ID');
assert.match(paymentSession, /Number\(existing\.expiresAt\) <= now/, 'Expired payment sessions must be replaced');
assert.match(paymentSession, /previousOperation\?\.status === 'failed'/, 'A fully compensated failed attempt must receive a fresh operation key on retry');
assert.match(paymentSession, /operation_key TEXT NOT NULL DEFAULT ''/, 'Payment sessions must persist their effective operation key');
assert.match(paymentSession, /const saved = await db\.get/, 'Payment session creation must verify persistence');
assert.match(paymentSession, /PAYMENT_SESSION_CREATE_FAILED/, 'Invalid session persistence must fail explicitly');
const createOrder = readFileSync('tgcloud/endpoints/createOrder.js', 'utf8');
assert.match(createOrder, /Resolve an earlier submission before validating a retry/, 'Order retries must recover before validating a new payment session');
assert.match(createOrder, /const prior = await findCheckoutOperation\(\{ customerId: customer\.id, requestKey \}\)/, 'Order retry recovery must use the authenticated customer and operation key');
assert.match(createOrder, /if \(prior\.status === 'failed'\)/, 'Failed attempts must not be replayed under the same key');
assert.match(createOrder, /customer_id AS customerId[\s\S]*request_snapshot AS requestSnapshot[\s\S]*proof_data AS proofData[\s\S]*expires_at AS expiresAt/, 'Order submission must explicitly map payment-session database columns');
assert.match(createOrder, /operation_key AS operationKey[\s\S]*FROM payment_sessions WHERE id=:id AND customer_id=:customer_id/, 'Order submission must use the authenticated payment session operation key');
assert.match(createOrder, /const sessionRequest = parseJson\(session\.requestSnapshot, null\)/, 'Order submission must parse the JSON-text request snapshot from its payment session');
const proofUpload = readFileSync('tgcloud/endpoints/uploadPaymentProof.js', 'utf8');
assert.match(proofUpload, /customer_id AS customerId[\s\S]*expires_at AS expiresAt/, 'Proof upload must explicitly map payment-session ownership and expiry columns');
const publicPayments = readFileSync('tgcloud/endpoints/getPublicPaymentMethods.js', 'utf8');
assert.match(publicPayments, /paymentLinkUrl: row\.paymentType === 'secured_payment_link' \? String\(row\.publicKey \|\| ''\)/, 'Public payment methods must return the customer-facing HTTPS link from the existing public_key column');
const paymentAdmin = readFileSync('tgcloud/endpoints/managePaymentMethods.js', 'utf8');
assert.match(paymentAdmin, /key === 'paymentLinkUrl'[\s\S]*parsed\.protocol !== 'https:'/,'Admin payment links must be validated as HTTPS before saving');

console.log('Telegram Serverless contracts OK: ' + requiredTables.length + ' tables, ' + requiredEndpoints.length + ' endpoint modules, public-field safeguards.');

const secretaryAutomation = readFileSync('tgcloud/lib/telegram-automation.js', 'utf8');
assert.match(secretaryAutomation, /WELCOME_COOLDOWN_MS\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Secretary welcome cooldown must remain 12 hours');
assert.match(secretaryAutomation, /triggerType === 'message' && welcomeFlowId && String\(item\.id\) === welcomeFlowId/, 'Generic message matching must not bypass the welcome cooldown');

const adminGuard = readFileSync('tgcloud/lib/auth.js', 'utf8');
assert.match(adminGuard, /ctx\?\.initData\?\.user/, 'Admin guard must use platform-verified initData');
assert.match(adminGuard, /admin_telegram_user_id/, 'Admin guard must use a server-side allowlist');
assert.match(adminGuard, /configuredAdminIds\(row\?\.value\)/, 'Admin guard must normalize configured admin identities');
assert.match(adminGuard, /if \(!adminIds\.includes\(userId\)\)/, 'Admin guard must fail closed when an identity is not allowlisted');

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
const customerMessageRecorder = automationCore.match(/export async function recordCustomerMessage\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(customerMessageRecorder, 'Customer activity recorder must exist');
assert.doesNotMatch(customerMessageRecorder, /botPaused\s*:\s*false/, 'Customer activity must not unpause an explicitly paused bot');
const automationGate = automationCore.match(/export function shouldStartAutomation\([\s\S]*?\n\}/)?.[0] || '';
assert.ok(automationGate, 'Secretary automation gate must exist');
assert.doesNotMatch(automationGate, /humanTakeoverUntil/, 'Human takeover must not suppress the 12-hour welcome cooldown policy');
assert.match(automationCore, /WELCOME_COOLDOWN_MS\s*=\s*12\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'Secretary welcome cooldown must be 12 hours');
for (const file of ['business_message.js', 'business_connection.js', 'callback_query.js']) {
  assert.ok(existsSync('tgcloud/handlers/' + file), 'Missing Telegram automation handler: ' + file);
}
const businessMessageHandler = readFileSync('tgcloud/handlers/business_message.js', 'utf8');
assert.doesNotMatch(businessMessageHandler, /recordHumanTakeover/, 'Business owner replies must not activate a takeover suppression timer');
assert.match(businessMessageHandler, /Admin replies are not a welcome cooldown or automation suppression gate/, 'Business owner replies must not override the bot-send-based welcome cooldown');
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
assert.match(deliveryQuote, /quoteDelivery\(input\.destinationLat, input\.destinationLon, input\.courierId \|\| ''\)/, 'Delivery quote must return all active courier options without requiring a preselected courier');
assert.doesNotMatch(deliveryQuote, /!courierId/, 'Initial delivery quote must not require a courier selection');
const deliveryCore = readFileSync('tgcloud/lib/delivery.js', 'utf8');
assert.match(deliveryCore, /couriers: computedCouriers/, 'Delivery quote must return all computed courier options');
assert.match(deliveryCore, /routeTimeMinutes/, 'Delivery quote must return the route-time field consumed by checkout');
assert.match(deliveryCore, /calculateRoadDistanceFallback/, 'Delivery quote must calculate distance server-side');
assert.match(deliveryCore, /calculateDeliveryFee/, 'Delivery quote must calculate fees server-side');
assert.match(deliveryCore, /ensureCourierTimeRateColumn/, 'Delivery quote must safely additively provision the time-rate column');
const manageCouriers = readFileSync('tgcloud/endpoints/manageCouriers.js', 'utf8');
assert.match(manageCouriers, /timeBasedFeePerMinute/, 'Courier settings must persist the time-based fee');
assert.match(manageCouriers, /ensureCourierTimeRateColumn/, 'Courier settings must provision the additive time-rate column');
assert.match(deliveryCore, /eq\(couriers\.isActive, true\)/, 'Delivery quote must use active couriers only');
assert.doesNotMatch(deliveryQuote, /input\?\.deliveryFee|input\.deliveryFee/, 'Delivery quote must not trust a client-supplied fee');
assert.doesNotMatch(deliveryQuote, /return \{[^}]*latitude|return \{[^}]*longitude/, 'Delivery quote must not return warehouse coordinates');

const publicVideos = readFileSync('tgcloud/endpoints/getPublicVideos.js', 'utf8');
assert.match(publicVideos, /eq\(videos\.isPublished, true\)/, 'Public video gallery must exclude unpublished media');
assert.doesNotMatch(publicVideos, /input\.includeAll|input\?\.includeAll/, 'Public video gallery must not allow clients to expose unpublished media');
assert.doesNotMatch(publicVideos, /db\.(insert|update|delete)/, 'Public video gallery must remain read-only');

const manageVideos = readFileSync('tgcloud/endpoints/manageVideos.js', 'utf8');
assert.doesNotMatch(manageVideos, /'views'\s*,|'views'\]/, 'Video views must not be writable through metadata CRUD');
assert.match(manageVideos, /await requireAdmin\(ctx\)/, 'Video metadata mutations must require admin authorization');

const mediaManager = readFileSync('tgcloud/endpoints/manageMediaAssets.js', 'utf8');
assert.match(mediaManager, /action === 'uploadPublicImage' \|\| action === 'uploadProductImage'/, 'Catalog image upload actions must be implemented');
assert.match(mediaManager, /mediaAssetContents\)\.values\(\{ id, bytes/, 'Uploaded image bytes must be stored with the media reference');
assert.match(mediaManager, /fileId: 'inline:' \+ id/, 'Inline media references must not depend on a Telegram file_id');
const mediaReader = readFileSync('tgcloud/endpoints/getMediaContent.js', 'utf8');
assert.match(mediaReader, /mediaAssetContents\)\.where\(eq\(mediaAssetContents\.id, asset\.id\)\)/, 'Media reader must serve locally stored image bytes');
assert.match(mediaReader, /api\.getFileContent\(asset\.fileId\)/, 'Legacy Telegram-hosted media must remain supported');
const serverlessClient = readFileSync('lib/telegram-serverless-client.ts', 'utf8');
assert.match(serverlessClient, /export async function downloadTelegramMedia[\s\S]*resolveTelegramMedia\(reference\)/, 'Media downloads must resolve Telegram-backed references first');
const checkoutUi = readFileSync('app/components/checkout-modal.tsx', 'utf8');
const qrModal = checkoutUi.split('{/* Enlarged Payment QR Code Pop-up Modal */}')[1].split('{isReceiptModalOpen')[0];
assert.match(qrModal, /<TelegramMediaImage[\s\S]*zoomedPaymentMethod\.qrCodeImage/, 'Payment QR must resolve Telegram-backed images');
assert.doesNotMatch(qrModal, /downloadTelegramMedia|>Download</, 'Payment QR must not offer the unavailable download control');

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

const validatePromo = readFileSync('tgcloud/endpoints/validatePromo.js', 'utf8');
assert.match(validatePromo, /ctx\?\.initData\?\.user/, 'Promo validation must use platform-verified Telegram identity');
assert.match(validatePromo, /isNull\(promoRedemptions\.releasedAt\)/, 'Promo limits must ignore released redemptions');
assert.match(validatePromo, /resolveTrustedFingerprint/, 'Promo validation must use stored trusted fingerprint resolution');
assert.match(validatePromo, /calculatePromoDiscount/, 'Promo validation must use shared discount rules');
assert.doesNotMatch(validatePromo, /db\.(insert|update|delete)/, 'Promo validation must remain read-only');

const mediaTransfer = readFileSync('scripts/migrate-media-to-telegram.mjs', 'utf8');
assert.match(mediaTransfer, /EXPECTED_TELEGRAM_BOT_USERNAME/, 'Media transfer must verify expected bot identity');
assert.match(mediaTransfer, /chat\.type !== 'private'/, 'Media transfer must refuse non-private storage chats');
assert.match(mediaTransfer, /sha256\(bytes\) !== object\.sha256/, 'Media transfer must verify every source object checksum');
assert.match(mediaTransfer, /PCMMAP1/, 'Media transfer map must be encrypted separately');
assert.doesNotMatch(mediaTransfer, /console\.log\([^\n]*botToken/, 'Media transfer must never log the bot token');

const mediaContent = readFileSync('tgcloud/endpoints/getMediaContent.js', 'utf8');
assert.match(mediaContent, /asset\.visibility !== 'public'/, 'Private media must require ownership/admin authorization');
assert.match(mediaContent, /canReadPrivateAsset/, 'Receipt media must be scoped to an owning order or admin');
assert.doesNotMatch(mediaContent, /return \{[^}]*fileId/, 'Media responses must never disclose Telegram file IDs');
const mediaAssetsAdmin = readFileSync('tgcloud/endpoints/manageMediaAssets.js', 'utf8');
assert.match(mediaAssetsAdmin, /await requireAdmin\(ctx\)/, 'Media mapping changes must require admin authorization');
assert.match(mediaAssetsAdmin, /bucket === 'receipt-proofs' \? 'private'/, 'Receipt proof mappings must always remain private');
assert.match(mediaAssetsAdmin, /target: \[mediaAssets\.bucket, mediaAssets\.path\]/, 'Media import must be idempotent by source bucket/path');
const mediaCore = readFileSync('tgcloud/lib/media.js', 'utf8');
assert.match(mediaCore, /asset\.visibility === 'public' \? 'tgmedia:'/, 'Only public media assets may become public Mini App references');
assert.match(mediaCore, /value\.includes\('\/storage\/v1\/object\/'\)\) return ''/, 'Unmapped Supabase storage URLs must not leak into the target Mini App');
assert.match(readFileSync('tgcloud/schema.js', 'utf8'), /table\('media_assets'/, 'Target schema must include the media asset index');

const mediaImporter = readFileSync('scripts/import-telegram-media-map.mjs', 'utf8');
assert.match(mediaImporter, /String\(botPayload\.result\?\.id\) !== String\(manifest\.botId\)/, 'Media importer must verify the map belongs to the configured bot');
assert.match(mediaImporter, /chatPayload\.result\?\.type !== 'private'/, 'Media importer must recheck private storage chat');
assert.match(mediaImporter, /endpoints\/manageMediaAssets/, 'Media importer must use the admin-only idempotent mapping endpoint');
assert.match(mediaImporter, /TELEGRAM_ADMIN_USER_ID/, 'Media importer must require the configured admin identity');

assert.match(mediaTransfer, /publicVideoMediaPaths/, 'Media transfer must retain visibility for published gallery assets');
assert.match(mediaImporter, /entry\.visibility === 'public'/, 'Media importer must preserve the manifest visibility classification');

assert.doesNotMatch(publicVideos, /telegramFileId|telegramMessageId/, 'Public video gallery must not expose raw Telegram identifiers');
