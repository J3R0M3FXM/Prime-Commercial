alter table public.telegram_automation_settings
  add column if not exists business_connection_id text,
  add column if not exists business_user_id bigint,
  add column if not exists business_user_chat_id bigint;

create table if not exists public.telegram_automation_chats (
  business_connection_id text not null,
  chat_id bigint not null,
  last_customer_message_at timestamptz,
  last_human_message_at timestamptz,
  last_bot_message_at timestamptz,
  human_takeover_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_connection_id, chat_id)
);

create index if not exists telegram_automation_chats_activity_idx
  on public.telegram_automation_chats (business_connection_id, last_customer_message_at);

alter table public.telegram_automation_chats enable row level security;
