-- Prime Admin native gateway, phase 1 read-only projection.
-- Source of truth: tgcloud/schema.js. This migration intentionally excludes
-- server-only media blobs and automation state until the import manifest exists.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'General',
  image_url TEXT,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  bundle_config TEXT DEFAULT '{}',
  tags TEXT DEFAULT '[]',
  gallery TEXT DEFAULT '[]',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tg_user_id TEXT,
  tg_name TEXT,
  tg_username TEXT,
  phone_number TEXT,
  telegram_photo_key TEXT,
  prime_member_id TEXT,
  points NUMERIC DEFAULT 0,
  store_credits NUMERIC DEFAULT 0,
  referral_code TEXT,
  total_orders INTEGER DEFAULT 0,
  lifetime_spent NUMERIC DEFAULT 0,
  is_banned INTEGER DEFAULT 0,
  fingerprints TEXT DEFAULT '[]',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS account_history (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  telegram_user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  previous_value TEXT,
  next_value TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  tg_user_id TEXT,
  prime_member_id TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  discount_amount NUMERIC DEFAULT 0,
  staff_discount_amount NUMERIC NOT NULL DEFAULT 0,
  applied_promo_code TEXT,
  charges_breakdown TEXT DEFAULT '[]',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payable_now NUMERIC NOT NULL DEFAULT 0,
  payable_on_delivery NUMERIC DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Processing',
  payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  payment_method_id TEXT,
  payment_method_name TEXT,
  payment_proof_image TEXT,
  ocr_analysis TEXT,
  review_status TEXT DEFAULT 'Pending Manual Review',
  requires_manual_review INTEGER DEFAULT 1,
  delivery_address TEXT DEFAULT '{}',
  courier_id TEXT,
  courier_name TEXT,
  tracking_number TEXT,
  notes TEXT,
  maya_payment_id TEXT,
  maya_request_reference_number TEXT,
  maya_receipt_number TEXT,
  maya_last_webhook_status TEXT,
  maya_last_webhook_at INTEGER,
  confirmed_paid_amount NUMERIC,
  payment_received_amount NUMERIC,
  ready_at INTEGER,
  dispatched_at INTEGER,
  delivered_at INTEGER,
  tracking_url TEXT,
  control_state TEXT NOT NULL DEFAULT 'normal',
  workflow TEXT DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  payment_type TEXT NOT NULL,
  qr_code_image TEXT,
  public_key TEXT,
  wallet_address TEXT,
  account_name TEXT,
  account_number TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS promos (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT,
  description TEXT,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC NOT NULL DEFAULT 0,
  max_discount_amount NUMERIC,
  min_spend NUMERIC DEFAULT 0,
  total_usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  usage_limit_per_customer INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  start_date INTEGER,
  end_date INTEGER,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS couriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tracking_url_pattern TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  logo TEXT,
  type TEXT DEFAULT 'Standard',
  base_fare NUMERIC DEFAULT 0,
  first_mile NUMERIC DEFAULT 0,
  first_mile_fee NUMERIC DEFAULT 0,
  exceeding_km_fee NUMERIC DEFAULT 0,
  surcharge NUMERIC DEFAULT 0,
  night_differential NUMERIC DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  owner_telegram_id TEXT,
  customer_name TEXT,
  request_key TEXT,
  subject TEXT,
  category TEXT,
  order_id TEXT,
  status TEXT,
  messages TEXT DEFAULT '[]',
  version INTEGER DEFAULT 0,
  customer_seen_version INTEGER DEFAULT 0,
  staff_seen_version INTEGER DEFAULT 0,
  last_message TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS charges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage',
  rate NUMERIC NOT NULL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS device_registrations (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT,
  installation_id TEXT,
  fingerprint_id TEXT,
  metadata TEXT DEFAULT '{}',
  risk_score NUMERIC DEFAULT 0,
  trust_status TEXT DEFAULT 'observed',
  first_seen_at INTEGER,
  last_seen_at INTEGER
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  bucket TEXT,
  path TEXT,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'public',
  content_base64 TEXT NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_device_registrations_telegram ON device_registrations(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tg_user_id ON customers(tg_user_id) WHERE tg_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_prime_member_id ON customers(prime_member_id) WHERE prime_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_account_history_customer_created ON account_history(customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_account_history_telegram_created ON account_history(telegram_user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_status_created ON orders(customer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_tg_user_id ON orders(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_promos_active_dates ON promos(is_active, start_date, end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promos_code ON promos(code);
CREATE INDEX IF NOT EXISTS idx_warehouses_default ON warehouses(is_default);
CREATE INDEX IF NOT EXISTS idx_couriers_active ON couriers(is_active);
CREATE INDEX IF NOT EXISTS idx_charges_active ON charges(is_active);

CREATE TABLE IF NOT EXISTS admin_import_state (
  source_name TEXT PRIMARY KEY,
  source_schema_hash TEXT NOT NULL,
  last_source_cursor TEXT,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started',
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
