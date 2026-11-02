-- صوتي (Soty) — database + file storage for the optional account and sync.
-- Paste all of this into Supabase → SQL Editor → Run. Safe to run again (it only adds what's missing).
--
-- What it makes:
--   * table public.soty_docs: one row per person per app data "document" (results, songs, each setting), as JSON text
--   * Row Level Security: every person can read and write ONLY their own rows (user_id = their login)
--   * private storage bucket "soty-files": audio files under "<their user id>/…", same rule

-- ---------------------------------------------------------------- table

create table if not exists public.soty_docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null check (char_length(key) between 1 and 200),
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists soty_docs_user_updated on public.soty_docs (user_id, updated_at desc);

-- the server stamps every write (the app compares these times to merge)
create or replace function public.soty_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists soty_docs_touch on public.soty_docs;
create trigger soty_docs_touch
  before insert or update on public.soty_docs
  for each row execute function public.soty_touch();

-- ---------------------------------------------------------------- row level security

alter table public.soty_docs enable row level security;

drop policy if exists "soty_docs: read own"   on public.soty_docs;
drop policy if exists "soty_docs: insert own" on public.soty_docs;
drop policy if exists "soty_docs: update own" on public.soty_docs;
drop policy if exists "soty_docs: delete own" on public.soty_docs;

create policy "soty_docs: read own" on public.soty_docs
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "soty_docs: insert own" on public.soty_docs
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "soty_docs: update own" on public.soty_docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "soty_docs: delete own" on public.soty_docs
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.soty_docs to authenticated;
revoke all on public.soty_docs from anon;

-- ---------------------------------------------------------------- private file bucket

insert into storage.buckets (id, name, public, file_size_limit)
values ('soty-files', 'soty-files', false, 52428800) -- 50 MB per file (the free plan's limit)
on conflict (id) do update set public = false;

drop policy if exists "soty-files: read own"   on storage.objects;
drop policy if exists "soty-files: insert own" on storage.objects;
drop policy if exists "soty-files: update own" on storage.objects;
drop policy if exists "soty-files: delete own" on storage.objects;

-- the first folder of every path must be the person's own user id
create policy "soty-files: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'soty-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "soty-files: insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'soty-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "soty-files: update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'soty-files' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'soty-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "soty-files: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'soty-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
