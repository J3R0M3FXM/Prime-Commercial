-- Runtime schema alignment for the existing production Supabase project.
-- Safe to run more than once. This is intentionally additive; do not replace production data.

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

ALTER TABLE public.couriers
  ADD COLUMN IF NOT EXISTS logo TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'Standard',
  ADD COLUMN IF NOT EXISTS base_fare NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_mile NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_mile_fee NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exceeding_km_fee NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surcharge NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS night_differential NUMERIC(12,2) DEFAULT 0;

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='videos' AND policyname='Public Read Videos'
  ) THEN
    CREATE POLICY "Public Read Videos" ON public.videos FOR SELECT USING (true);
  END IF;
END $$;