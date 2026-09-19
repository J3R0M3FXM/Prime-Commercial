import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

async function runMigration() {
  console.log('🚀 Starting Data Migration: Firestore -> Supabase');

  // 1. Initialize Firestore Connection
  if (!fs.existsSync('./firebase-applet-config.json')) {
    console.error('❌ firebase-applet-config.json not found!');
    return;
  }
  const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
  const app = initializeApp({
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    appId: firebaseConfig.appId
  });
  const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
  const firestore = getFirestore(app, dbId);

  // 2. Initialize Supabase Connection
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase environment variables are missing!');
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Helper to migrate a collection
  const migrateCollection = async (firestoreColName, supabaseTableName, mapper) => {
    console.log(`\n📦 Migrating: ${firestoreColName} -> ${supabaseTableName}...`);
    try {
      const snap = await getDocs(collection(firestore, firestoreColName));
      if (snap.empty) {
        console.log(`⚠️ Collection ${firestoreColName} is empty in Firestore.`);
        return;
      }

      const records = [];
      snap.forEach(doc => {
        try {
          const mapped = mapper(doc.id, doc.data());
          if (mapped) records.push(mapped);
        } catch (e) {
          console.error(`Error mapping doc ${doc.id}:`, e);
        }
      });

      console.log(`   Found ${records.length} records. Uploading to Supabase...`);

      // Upload records in batches to prevent payload size limits
      const batchSize = 50;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const { error } = await supabase.from(supabaseTableName).upsert(batch);
        if (error) {
          console.error(`❌ Supabase error in batch ${i / batchSize + 1}:`, error.message);
        } else {
          console.log(`   ✅ Batch ${i / batchSize + 1} (${batch.length} items) upserted.`);
        }
      }
    } catch (err) {
      console.error(`❌ Migration failed for ${firestoreColName}:`, err.message);
    }
  };

  // --- MAPPER DEFINITIONS ---

  // 1. PRODUCTS
  await migrateCollection('products', 'products', (id, data) => ({
    id,
    name: data.name,
    price: Number(data.price) || 0.00,
    stock: Number(data.stock) || 0,
    category: data.category || 'General',
    image_url: data.imageUrl || null,
    description: data.description || null,
    is_active: data.isActive !== false,
    is_featured: Boolean(data.isFeatured),
    sort_order: Number(data.sortOrder) || 0,
    bundle_config: data.bundleConfig || {},
    tags: data.tags || [],
    gallery: data.gallery || []
  }));

  // 2. USERS (Customers)
  await migrateCollection('users', 'customers', (id, data) => ({
    id,
    tg_user_id: data.tgUserId ? String(data.tgUserId) : null,
    tg_name: data.tgName || null,
    tg_username: data.tgUsername || null,
    phone_number: data.phoneNumber || null,
    prime_member_id: data.primeMemberId || null,
    points: Number(data.points) || 0.00,
    store_credits: Number(data.storeCredits) || 0.00,
    referral_code: data.referralCode || null,
    referred_by: data.referredBy || null,
    total_orders: Number(data.totalOrders) || 0,
    lifetime_spent: Number(data.lifetimeSpent) || 0.00,
    is_banned: Boolean(data.isBanned),
    fingerprints: data.fingerprints || []
  }));

  // 3. PAYMENT METHODS
  await migrateCollection('payment_methods', 'payment_methods', (id, data) => ({
    id,
    name: data.name,
    logo: data.logo || null,
    payment_type: data.paymentType,
    qr_code_image: data.qrCodeImage || null,
    webhook_url: data.webhookUrl || null,
    public_key: data.publicKey || null,
    secret_key: data.secretKey || null,
    wallet_address: data.walletAddress || null,
    account_name: data.accountName || null,
    account_number: data.accountNumber || null,
    sort_order: Number(data.sortOrder) || 0,
    is_active: data.isActive !== false
  }));

  // 4. PROMOS
  await migrateCollection('promos', 'promos', (id, data) => ({
    id,
    code: data.code,
    title: data.title || null,
    description: data.description || null,
    discount_type: data.discountType,
    discount_value: Number(data.discountValue) || 0.00,
    max_discount_amount: Number(data.maxDiscountAmount) || null,
    min_spend: Number(data.minSpend) || 0.00,
    total_usage_limit: Number(data.totalUsageLimit) || null,
    usage_count: Number(data.usageCount) || 0,
    usage_limit_per_customer: Number(data.usageLimitPerCustomer) || 1,
    is_active: data.isActive !== false,
    start_date: data.startDate || null,
    end_date: data.endDate || null
  }));

  // 5. CHARGES
  await migrateCollection('charges', 'charges', (id, data) => ({
    id,
    name: data.name,
    type: data.type || 'percentage',
    rate: Number(data.rate) || 0.00,
    is_active: data.isActive !== false,
    sort_order: Number(data.sortOrder) || 0,
    description: data.description || null
  }));

  // 6. COURIERS
  await migrateCollection('couriers', 'couriers', (id, data) => ({
    id,
    name: data.name,
    tracking_url_pattern: data.trackingUrlPattern || null,
    is_active: data.isActive !== false,
    sort_order: Number(data.sortOrder) || 0
  }));

  // 7. WAREHOUSES
  await migrateCollection('warehouses', 'warehouses', (id, data) => ({
    id,
    name: data.name,
    code: data.code || null,
    address: data.address || null,
    is_active: data.isActive !== false,
    sort_order: Number(data.sortOrder) || 0
  }));

  // 8. ORDERS
  await migrateCollection('orders', 'orders', (id, data) => ({
    id,
    order_number: data.orderNumber || id,
    customer_id: data.customerId || null,
    customer_name: data.customerName || data.receiverName || null,
    customer_phone: data.customerPhone || data.receiverPhone || null,
    tg_user_id: data.tgUserId ? String(data.tgUserId) : null,
    prime_member_id: data.primeMemberId || null,
    items: data.items || [],
    subtotal: Number(data.subTotal) || 0.00,
    delivery_fee: Number(data.deliveryFee) || 0.00,
    discount_amount: Number(data.discountAmount || data.promoDiscount) || 0.00,
    applied_promo_code: data.appliedPromoCode || null,
    points_discount: Number(data.pointsDiscount) || 0.00,
    charges_breakdown: data.appliedCharges || [],
    total_amount: Number(data.totalAmount) || 0.00,
    payable_now: Number(data.payableNow) || 0.00,
    payable_on_delivery: Number(data.payableOnDelivery) || 0.00,
    status: data.status || 'Pending',
    payment_status: data.paymentStatus || 'Unpaid',
    payment_method_id: data.paymentMethodId || null,
    payment_method_name: data.paymentMethodName || null,
    payment_proof_image: data.paymentProofImage || null,
    ocr_analysis: data.ocrAnalysis || null,
    review_status: data.reviewStatus || 'Pending Manual Review',
    requires_manual_review: data.requiresManualReview !== false,
    delivery_address: data.deliveryAddress || {},
    courier_id: data.courier || null,
    courier_name: data.courierName || null,
    tracking_number: data.trackingNumber || null,
    notes: data.notes || null,
    fingerprint_snapshot: data.fingerprintSnapshot || null,
    created_at: data.createdAt || new Date().toISOString(),
    updated_at: data.updatedAt || new Date().toISOString()
  }));

  console.log('\n🏁 Migration process completed!');
}

runMigration();
