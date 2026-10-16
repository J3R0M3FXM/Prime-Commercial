/**
 * Telegram Serverless SQLite target schema for Prime Commercial.
 * This is a target mapping, not a live-data migration or production deployment.
 * Preserve source IDs. The importer must reconcile this with all applied
 * Supabase migrations and the live schema before any data is imported.
 * Telegram Serverless SQLite does not enforce foreign keys: validate references
 * in endpoint logic and in migration reconciliation.
 */
import { table, text, integer, numeric, json, boolean, uniqueIndex, sql } from 'sdk/db';

const createdAt = () => integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`);
const updatedAt = () => integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`);

export const products = table('products', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  price: numeric('price').notNull().default(0), stock: integer('stock').notNull().default(0),
  category: text('category').default('General'), imageUrl: text('image_url'),
  description: text('description'), isActive: boolean('is_active').default(true),
  isFeatured: boolean('is_featured').default(false), sortOrder: integer('sort_order').default(0),
  bundleConfig: json('bundle_config').default({}), tags: json('tags').default([]),
  gallery: json('gallery').default([]), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const customers = table('customers', {
  id: text('id').primaryKey(), tgUserId: text('tg_user_id').unique(),
  tgName: text('tg_name'), tgUsername: text('tg_username'), phoneNumber: text('phone_number'),
  primeMemberId: text('prime_member_id').unique(), points: numeric('points').default(0),
  storeCredits: numeric('store_credits').default(0), referralCode: text('referral_code').unique(),
  referredBy: text('referred_by'), totalOrders: integer('total_orders').default(0),
  lifetimeSpent: numeric('lifetime_spent').default(0), isBanned: boolean('is_banned').default(false),
  fingerprints: json('fingerprints').default([]),
  referralPoints: numeric('referral_points').notNull().default(0),
  referredByUserId: text('referred_by_user_id'), referredByMemberId: text('referred_by_member_id'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const orders = table('orders', {
  id: text('id').primaryKey(), orderNumber: text('order_number').notNull().unique(),
  customerId: text('customer_id'), customerName: text('customer_name'), customerPhone: text('customer_phone'),
  tgUserId: text('tg_user_id'), primeMemberId: text('prime_member_id'),
  items: json('items').notNull().default([]), subtotal: numeric('subtotal').notNull().default(0),
  deliveryFee: numeric('delivery_fee').default(0), discountAmount: numeric('discount_amount').default(0),
  appliedPromoCode: text('applied_promo_code'), pointsDiscount: numeric('points_discount').default(0),
  chargesBreakdown: json('charges_breakdown').default([]), totalAmount: numeric('total_amount').notNull().default(0),
  payableNow: numeric('payable_now').notNull().default(0), payableOnDelivery: numeric('payable_on_delivery').default(0),
  status: text('status').notNull().default('Processing'), paymentStatus: text('payment_status').notNull().default('Unpaid'),
  paymentMethodId: text('payment_method_id'), paymentMethodName: text('payment_method_name'),
  paymentProofImage: text('payment_proof_image'), ocrAnalysis: json('ocr_analysis'),
  reviewStatus: text('review_status').default('Pending Manual Review'),
  requiresManualReview: boolean('requires_manual_review').default(true),
  deliveryAddress: json('delivery_address').default({}), courierId: text('courier_id'),
  courierName: text('courier_name'), trackingNumber: text('tracking_number'), notes: text('notes'),
  fingerprintSnapshot: json('fingerprint_snapshot'),
  // Migration-added payment, expiry, inventory-release, credits, and loyalty fields.
  mayaPaymentId: text('maya_payment_id'), mayaRequestReferenceNumber: text('maya_request_reference_number'),
  mayaReceiptNumber: text('maya_receipt_number'), mayaPaymentScheme: text('maya_payment_scheme'),
  mayaFundSourceType: text('maya_fund_source_type'), mayaLastWebhookStatus: text('maya_last_webhook_status'),
  mayaLastWebhookAt: integer('maya_last_webhook_at', { mode: 'timestamp' }),
  storeCreditsUsed: numeric('store_credits_used').notNull().default(0),
  promoShippingSubsidy: numeric('promo_shipping_subsidy').notNull().default(0),
  cashbackPointsAmount: numeric('cashback_points_amount').notNull().default(0),
  cashbackPointsAwardedAt: integer('cashback_points_awarded_at', { mode: 'timestamp' }),
  cashbackPointsReversedAt: integer('cashback_points_reversed_at', { mode: 'timestamp' }),
  purchasingPointsAmount: numeric('purchasing_points_amount').notNull().default(0),
  purchasingPointsAwardedAt: integer('purchasing_points_awarded_at', { mode: 'timestamp' }),
  purchasingPointsReversedAt: integer('purchasing_points_reversed_at', { mode: 'timestamp' }),
  customerAggregateUpdatedAt: integer('customer_aggregate_updated_at', { mode: 'timestamp' }),
  deliveredAt: integer('delivered_at', { mode: 'timestamp' }),
  referredByUserId: text('referred_by_user_id'), referredByMemberId: text('referred_by_member_id'),
  referralPointsStatus: text('referral_points_status').notNull().default('none'),
  referralPointsCreditAfter: integer('referral_points_credit_after', { mode: 'timestamp' }),
  referralPointsCreditedAt: integer('referral_points_credited_at', { mode: 'timestamp' }),
  referralPointsAmount: numeric('referral_points_amount').notNull().default(0),
  paymentDeadlineAt: integer('payment_deadline_at', { mode: 'timestamp' }),
  paymentProofSubmittedAt: integer('payment_proof_submitted_at', { mode: 'timestamp' }),
  expiredAt: integer('expired_at', { mode: 'timestamp' }),
  inventoryReleasedAt: integer('inventory_released_at', { mode: 'timestamp' }),
  inventoryReleaseError: text('inventory_release_error'),
  storeCreditsReleasedAt: integer('store_credits_released_at', { mode: 'timestamp' }),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const paymentMethods = table('payment_methods', {
  id: text('id').primaryKey(), name: text('name').notNull(), logo: text('logo'),
  paymentType: text('payment_type').notNull(), qrCodeImage: text('qr_code_image'),
  webhookUrl: text('webhook_url'), publicKey: text('public_key'),
  // Server-only secret. Never expose this table directly to the Mini App.
  secretKey: text('secret_key'), walletAddress: text('wallet_address'),
  accountName: text('account_name'), accountNumber: text('account_number'),
  sortOrder: integer('sort_order').default(0), isActive: boolean('is_active').default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const promos = table('promos', {
  id: text('id').primaryKey(), code: text('code').notNull().unique(), title: text('title'),
  description: text('description'), discountType: text('discount_type').notNull(),
  discountValue: numeric('discount_value').notNull().default(0),
  maxDiscountAmount: numeric('max_discount_amount'), minSpend: numeric('min_spend').default(0),
  totalUsageLimit: integer('total_usage_limit'), usageCount: integer('usage_count').default(0),
  usageLimitPerCustomer: integer('usage_limit_per_customer').default(1),
  isActive: boolean('is_active').default(true),
  startDate: integer('start_date', { mode: 'timestamp' }), endDate: integer('end_date', { mode: 'timestamp' }),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const promoRedemptions = table('promo_redemptions', {
  id: text('id').primaryKey(), promoCode: text('promo_code').notNull(), promoId: text('promo_id'),
  customerId: text('customer_id'), orderId: text('order_id'), deviceId: text('device_id'),
  discountAmount: numeric('discount_amount').default(0),
  usedAt: integer('used_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  releasedAt: integer('released_at', { mode: 'timestamp' }),
  hardwareId: text('hardware_id'), deviceFingerprintId: text('device_fingerprint_id'),
  serverFingerprintId: text('server_fingerprint_id'),
});

export const warehouses = table('warehouses', {
  id: text('id').primaryKey(), name: text('name').notNull(), code: text('code'), address: text('address'),
  isActive: boolean('is_active').default(true), sortOrder: integer('sort_order').default(0),
  isDefault: boolean('is_default').notNull().default(false),
  latitude: numeric('latitude'), longitude: numeric('longitude'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const couriers = table('couriers', {
  id: text('id').primaryKey(), name: text('name').notNull(), trackingUrlPattern: text('tracking_url_pattern'),
  isActive: boolean('is_active').default(true), sortOrder: integer('sort_order').default(0),
  logo: text('logo'), type: text('type').default('Standard'), baseFare: numeric('base_fare').default(0),
  firstMile: numeric('first_mile').default(0), firstMileFee: numeric('first_mile_fee').default(0),
  exceedingKmFee: numeric('exceeding_km_fee').default(0), surcharge: numeric('surcharge').default(0),
  nightDifferential: numeric('night_differential').default(0), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const videos = table('videos', {
  id: text('id').primaryKey(), title: text('title').notNull(), description: text('description').default(''),
  category: text('category').default('Product Demos'), tags: json('tags').default([]),
  telegramFileId: text('telegram_file_id').default(''), telegramMessageId: text('telegram_message_id').default(''),
  storageType: text('storage_type').default('telegram'), directUrl: text('direct_url').default(''),
  thumbnailUrl: text('thumbnail_url').default(''), duration: numeric('duration').default(0),
  fileSize: integer('file_size').default(0), width: integer('width').default(1920),
  height: integer('height').default(1080), views: integer('views').default(0),
  isPublished: boolean('is_published').default(true), featured: boolean('featured').default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const charges = table('charges', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  type: text('type').notNull().default('percentage'), rate: numeric('rate').notNull().default(0),
  isActive: boolean('is_active').default(true), sortOrder: integer('sort_order').default(0),
  description: text('description'), createdAt: createdAt(), updatedAt: updatedAt(),
});

export const pointTransactions = table('point_transactions', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(), type: text('type').notNull(),
  amount: numeric('amount').notNull(), orderId: text('order_id'), description: text('description'),
  createdAt: createdAt(),
});

export const systemSettings = table('system_settings', {
  key: text('key').primaryKey(), value: json('value').notNull(), updatedAt: updatedAt(),
});

export const telegramAutomationFlows = table('telegram_automation_flows', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  triggerType: text('trigger_type').notNull().default('message'),
  triggerValue: text('trigger_value').notNull().default(''),
  matchMode: text('match_mode').notNull().default('contains'),
  responseText: text('response_text').notNull().default(''),
  buttons: json('buttons').notNull().default([]),
  priority: integer('priority').notNull().default(100),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const telegramAutomationSettings = table('telegram_automation_settings', {
  id: text('id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  fallbackEnabled: boolean('fallback_enabled').notNull().default(false),
  fallbackResponse: text('fallback_response').notNull().default(''),
  updatedAt: updatedAt(),
  businessConnectionId: text('business_connection_id'),
  businessUserId: integer('business_user_id'),
  businessUserChatId: integer('business_user_chat_id'),
  welcomeFlowId: text('welcome_flow_id'),
});

export const telegramAutomationChats = table('telegram_automation_chats', {
  businessConnectionId: text('business_connection_id').notNull(),
  chatId: integer('chat_id').notNull(),
  lastCustomerMessageAt: integer('last_customer_message_at', { mode: 'timestamp' }),
  lastHumanMessageAt: integer('last_human_message_at', { mode: 'timestamp' }),
  lastBotMessageAt: integer('last_bot_message_at', { mode: 'timestamp' }),
  humanTakeoverUntil: integer('human_takeover_until', { mode: 'timestamp' }),
  createdAt: createdAt(), updatedAt: updatedAt(),
  botPaused: boolean('bot_paused').notNull().default(false),
}, (t) => ({
  connectionChatUnique: uniqueIndex('uq_telegram_automation_chats_connection_chat')
    .on(t.businessConnectionId, t.chatId),
}));

export const mayaWebhookEvents = table('maya_webhook_events', {
  id: text('id').primaryKey(),
  eventKey: text('event_key').notNull(),
  paymentId: text('payment_id'),
  requestReferenceNumber: text('request_reference_number'),
  receiptNumber: text('receipt_number'),
  paymentStatus: text('payment_status').notNull(),
  channel: text('channel').notNull().default('unknown'),
  amount: numeric('amount'), currency: text('currency'), fundSourceType: text('fund_source_type'),
  orderId: text('order_id'),
  processingStatus: text('processing_status').notNull().default('RECEIVED'),
  processingError: text('processing_error'),
  payload: json('payload').notNull().default({}),
  receivedAt: integer('received_at', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`), processedAt: integer('processed_at', { mode: 'timestamp' }),
});
