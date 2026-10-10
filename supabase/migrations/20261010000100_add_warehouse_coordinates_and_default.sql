-- Keep the warehouse API payload aligned with the PostgreSQL schema.
-- Additive and safe for existing deployments; no existing warehouse data is deleted.
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
