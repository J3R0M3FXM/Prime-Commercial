alter table public.telegram_automation_settings
  add column if not exists welcome_flow_id text;
