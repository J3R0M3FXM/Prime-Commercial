-- ==============================================================================
-- SUPABASE MIGRATION SCHEMA FOR SECURE TELEGRAM SHOPFRONT
-- Database: PostgreSQL + Storage Buckets
-- ==============================================================================

-- 1. Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CREATE STORAGE BUCKETS (Receipts, Products, Media)
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('receipt-proofs', 'receipt-proofs', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('media-gallery', 'media-gallery', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Public Access Policies
CREATE POLICY "Public Read Access on receipt-proofs" ON storage.objects
  FOR SELECT USING (bucket_id = 'receipt-proofs');

CREATE POLICY "Allow Uploads on receipt-proofs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'receipt-proofs');

CREATE POLICY "Allow Updates on receipt-proofs" ON storage.objects
  FOR UPDATE USING (bucket_id = 'receipt-proofs');

CREATE POLICY "Public Read Access on product-images" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "Allow Uploads on product-images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Public Read Access on media-gallery" ON storage.objects
  FOR SELECT USING (bucket_id = 'media-gallery');

CREATE POLICY "Allow Uploads on media-gallery" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'media-gallery');

-- ==============================================================================
-- 3. PRODUCTS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  stock INTEGER NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'General',
  image_url TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  bundle_config JSONB DEFAULT '{}'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  gallery JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- ==============================================================================
-- 4. CUSTOMERS & USERS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  tg_user_id TEXT UNIQUE,
  tg_name TEXT,
  tg_username TEXT,
  phone_number TEXT,
  prime_member_id TEXT UNIQUE,
  points NUMERIC(10, 2) DEFAULT 0.00,
  store_credits NUMERIC(10, 2) DEFAULT 0.00,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  total_orders INTEGER DEFAULT 0,
  lifetime_spent NUMERIC(12, 2) DEFAULT 0.00,
  is_banned BOOLEAN DEFAULT false,
  fingerprints JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tg_user_id ON public.customers(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_prime_member_id ON public.customers(prime_member_id);
CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON public.customers(referral_code);

-- ==============================================================================
-- 5. ORDERS TABLE (With OCR Receipt Data & Manual Review Tracking)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  order_number TEXT UNIQUE NOT NULL,
  customer_id TEXT REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  customer_phone TEXT,
  tg_user_id TEXT,
  prime_member_id TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  delivery_fee NUMERIC(12, 2) DEFAULT 0.00,
  discount_amount NUMERIC(12, 2) DEFAULT 0.00,
  applied_promo_code TEXT,
  points_discount NUMERIC(12, 2) DEFAULT 0.00,
  charges_breakdown JSONB DEFAULT '[]'::jsonb,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payable_now NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  payable_on_delivery NUMERIC(12, 2) DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'Processing',
  payment_status TEXT NOT NULL DEFAULT 'Unpaid',
  payment_method_id TEXT,
  payment_method_name TEXT,
  payment_proof_image TEXT,
  ocr_analysis JSONB DEFAULT NULL,
  review_status TEXT DEFAULT 'Pending Manual Review',
  requires_manual_review BOOLEAN DEFAULT true,
  delivery_address JSONB DEFAULT '{}'::jsonb,
  courier_id TEXT,
  courier_name TEXT,
  tracking_number TEXT,
  notes TEXT,
  fingerprint_snapshot JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_tg_user_id ON public.orders(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- ==============================================================================
-- 6. PAYMENT METHODS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  logo TEXT,
  payment_type TEXT NOT NULL, -- 'qr_code', 'api', 'crypto', 'manual_transfer'
  qr_code_image TEXT,
  webhook_url TEXT,
  public_key TEXT,
  secret_key TEXT,
  wallet_address TEXT,
  account_name TEXT,
  account_number TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 7. PROMOS & REDEMPTIONS TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.promos (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  code TEXT UNIQUE NOT NULL,
  title TEXT,
  description TEXT,
  discount_type TEXT NOT NULL, -- 'fixed', 'percentage', 'free_shipping'
  discount_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  max_discount_amount NUMERIC(10, 2),
  min_spend NUMERIC(10, 2) DEFAULT 0.00,
  total_usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  usage_limit_per_customer INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  promo_code TEXT NOT NULL,
  promo_id TEXT REFERENCES public.promos(id) ON DELETE CASCADE,
  customer_id TEXT,
  order_id TEXT,
  device_id TEXT,
  discount_amount NUMERIC(10, 2) DEFAULT 0.00,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 8. WAREHOUSES & COURIERS & CHARGES TABLES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.couriers (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  tracking_url_pattern TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  logo TEXT,
  type TEXT DEFAULT 'Standard',
  base_fare NUMERIC(12, 2) DEFAULT 0,
  first_mile NUMERIC(12, 2) DEFAULT 0,
  first_mile_fee NUMERIC(12, 2) DEFAULT 0,
  exceeding_km_fee NUMERIC(12, 2) DEFAULT 0,
  surcharge NUMERIC(12, 2) DEFAULT 0,
  night_differential NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Video metadata is stored here while binary media remains in Telegram.
CREATE TABLE IF NOT EXISTS public.videos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'Product Demos',
  tags JSONB DEFAULT '[]'::jsonb,
  telegram_file_id TEXT DEFAULT '',
  telegram_message_id TEXT DEFAULT '',
  storage_type TEXT DEFAULT 'telegram',
  direct_url TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  duration NUMERIC DEFAULT 0,
  file_size BIGINT DEFAULT 0,
  width INTEGER DEFAULT 1920,
  height INTEGER DEFAULT 1080,
  views INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.charges (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage', -- 'percentage' | 'fixed'
  rate NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 9. POINT TRANSACTIONS & SYSTEM SETTINGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.point_transactions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'earn', 'redeem', 'bonus', 'refund'
  amount NUMERIC(10, 2) NOT NULL,
  order_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.couriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Allow public read access to catalog, active payment methods, couriers, charges, promos
CREATE POLICY "Public Read Products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Public Read Payment Methods" ON public.payment_methods FOR SELECT USING (true);
CREATE POLICY "Public Read Couriers" ON public.couriers FOR SELECT USING (true);
CREATE POLICY "Public Read Charges" ON public.charges FOR SELECT USING (true);
CREATE POLICY "Public Read Promos" ON public.promos FOR SELECT USING (true);
CREATE POLICY "Public Read Warehouses" ON public.warehouses FOR SELECT USING (true);
CREATE POLICY "Public Read Videos" ON public.videos FOR SELECT USING (true);

-- Allow inserting orders & customer profiles from public storefront checkout
CREATE POLICY "Allow Public Orders Insert" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Public Orders Select" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow Public Orders Update" ON public.orders FOR UPDATE USING (true);
CREATE POLICY "Allow Public Customers Upsert" ON public.customers FOR ALL USING (true);
CREATE POLICY "Allow Public Redemptions" ON public.promo_redemptions FOR ALL USING (true);
CREATE POLICY "Allow Public Point Transactions" ON public.point_transactions FOR ALL USING (true);
CREATE POLICY "Allow Public System Settings Read" ON public.system_settings FOR SELECT USING (true);
