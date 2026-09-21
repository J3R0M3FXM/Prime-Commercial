create table if not exists public.telegram_automation_flows (
  id text primary key,
  name text not null,
  active boolean not null default true,
  trigger_type text not null default 'message',
  trigger_value text not null default '',
  match_mode text not null default 'contains',
  response_text text not null default '',
  buttons jsonb not null default '[]'::jsonb,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_automation_flows_active_priority_idx
  on public.telegram_automation_flows (active, priority);

create table if not exists public.telegram_automation_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  fallback_enabled boolean not null default false,
  fallback_response text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.telegram_automation_flows enable row level security;
alter table public.telegram_automation_settings enable row level security;

insert into public.telegram_automation_settings (id, enabled, fallback_enabled, fallback_response)
values ('default', false, false, '')
on conflict (id) do nothing;
