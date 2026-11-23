-- صوتي (Soty) — push notifications (reminders). Run AFTER schema.sql, in Supabase → SQL Editor → Run.
-- Safe to run again: it only adds what's missing and re-creates the cron job.
--
-- BEFORE RUNNING, replace the ONE placeholder below:
--   PASTE_CRON_SECRET_HERE  → the same random text you put in Edge Functions → Secrets as CRON_SECRET
--                             (long and random, e.g. 40 letters and numbers; it proves the call comes from this job)
-- The function address is already filled in for this project:
--   https://dezbkbpbzjcgdqwnhpfo.supabase.co/functions/v1/send-reminders
-- Both are stored in Vault (encrypted), never in plain SQL tables, and the cron job reads them from there.
--
-- What it makes:
--   * push_subscriptions  : one row per device that turned notifications on (each person sees only her own)
--   * notification_prefs  : one small row per person: reminder times, time zone, last workout, streak, weekly due date
--   * notification_log    : what was sent, one row per (person, kind, local day) so nothing goes out twice (server only)
--   * a pg_cron job every 15 minutes that calls the Edge Function "send-reminders" through pg_net

-- ---------------------------------------------------------------- extensions (Database → Extensions also works)

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------- tables

create table if not exists public.push_subscriptions (
  endpoint   text        primary key check (char_length(endpoint) between 10 and 1000),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text        not null check (char_length(p256dh) < 200),
  auth       text        not null check (char_length(auth) < 100),
  device     text        check (char_length(device) < 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

create table if not exists public.notification_prefs (
  user_id           uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  tz                text        not null default 'Africa/Cairo' check (char_length(tz) < 64),
  gender            text        not null default 'f' check (gender in ('f', 'm')),
  daily_on          boolean     not null default true,
  daily_time        text        not null default '19:00' check (daily_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  streak_on         boolean     not null default true,
  streak_time       text        not null default '21:00' check (streak_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  weekly_on         boolean     not null default true,
  last_workout_date date,
  streak            integer     not null default 0 check (streak between 0 and 10000),
  weekly_due_date   date,
  updated_at        timestamptz not null default now()
);

create table if not exists public.notification_log (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('daily', 'streak', 'weekly')),
  local_date date        not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, kind, local_date)
);
create index if not exists notification_log_date on public.notification_log (local_date);

-- ---------------------------------------------------------------- row level security

alter table public.push_subscriptions enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_log   enable row level security;  -- no policies: only the Edge Function (service role) reads/writes it

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own reminder settings" on public.notification_prefs;
create policy "own reminder settings" on public.notification_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- the function address and the secret, in Vault

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'send_reminders_url') then
    perform vault.create_secret('https://dezbkbpbzjcgdqwnhpfo.supabase.co/functions/v1/send-reminders', 'send_reminders_url');
  end if;
  if exists (select 1 from vault.secrets where name = 'send_reminders_secret') then
    perform vault.update_secret((select id from vault.secrets where name = 'send_reminders_secret'), 'PASTE_CRON_SECRET_HERE');
  else
    perform vault.create_secret('PASTE_CRON_SECRET_HERE', 'send_reminders_secret');
  end if;
end;
$$;

-- ---------------------------------------------------------------- every 15 minutes

do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders') then
    perform cron.unschedule('send-reminders');
  end if;
end;
$$;

select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'send_reminders_url'),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'send_reminders_secret')
               ),
    body    := '{}'::jsonb
  );
  $job$
);
