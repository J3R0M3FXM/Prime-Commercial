-- Add the customer profile-photo fields used by /api/account.
-- Additive only: preserve all existing customer and order data.
BEGIN;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS has_custom_photo BOOLEAN NOT NULL DEFAULT false;

COMMIT;
