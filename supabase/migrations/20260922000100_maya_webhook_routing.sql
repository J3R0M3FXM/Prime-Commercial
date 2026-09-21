ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS maya_payment_id text,
  ADD COLUMN IF NOT EXISTS maya_request_reference_number text,
  ADD COLUMN IF NOT EXISTS maya_receipt_number text,
  ADD COLUMN IF NOT EXISTS maya_payment_scheme text,
  ADD COLUMN IF NOT EXISTS maya_fund_source_type text,
  ADD COLUMN IF NOT EXISTS maya_last_webhook_status text,
  ADD COLUMN IF NOT EXISTS maya_last_webhook_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_maya_payment_id_uidx
  ON public.orders (maya_payment_id)
  WHERE maya_payment_id IS NOT NULL AND maya_payment_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_maya_request_reference_uidx
  ON public.orders (maya_request_reference_number)
  WHERE maya_request_reference_number IS NOT NULL AND maya_request_reference_number <> '';

CREATE TABLE IF NOT EXISTS public.maya_webhook_events (
  id text PRIMARY KEY DEFAULT ('mwe_' || replace(gen_random_uuid()::text, '-', '')),
  event_key text NOT NULL UNIQUE,
  payment_id text,
  request_reference_number text,
  receipt_number text,
  payment_status text NOT NULL,
  channel text NOT NULL DEFAULT 'unknown',
  amount numeric,
  currency text,
  fund_source_type text,
  order_id text,
  processing_status text NOT NULL DEFAULT 'RECEIVED',
  processing_error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS maya_webhook_events_payment_id_idx
  ON public.maya_webhook_events (payment_id);

CREATE INDEX IF NOT EXISTS maya_webhook_events_request_reference_idx
  ON public.maya_webhook_events (request_reference_number);

CREATE INDEX IF NOT EXISTS maya_webhook_events_order_id_idx
  ON public.maya_webhook_events (order_id);

CREATE INDEX IF NOT EXISTS maya_webhook_events_received_at_idx
  ON public.maya_webhook_events (received_at DESC);

ALTER TABLE public.maya_webhook_events ENABLE ROW LEVEL SECURITY;
