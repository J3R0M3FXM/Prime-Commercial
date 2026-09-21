alter table public.telegram_automation_chats
  add column if not exists bot_paused boolean not null default false;
