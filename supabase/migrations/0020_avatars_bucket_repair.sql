-- 0020_avatars_bucket_repair.sql
--
-- Re-asserts the `avatars` storage bucket + RLS policies. Migration
-- 0019 created the bucket via `insert into storage.buckets`, which
-- ran without error but in some Supabase Cloud projects the policies
-- on storage.objects don't propagate cleanly the first time (race
-- between policy creation and RLS evaluator refresh).
--
-- Symptom we're fixing: users upload an avatar successfully, the
-- file lands in `avatars/{user_id}/avatar.jpg`, but the public URL
-- returns 400/403 because the SELECT policy isn't effective. The
-- client's <Image> then renders nothing.
--
-- This migration is fully idempotent — running it on a healthy
-- project is a no-op. Bucket settings are forced to expected values
-- via `on conflict do update`; policies are dropped + recreated so
-- any half-applied previous attempt gets cleaned out.

-- 1. Bucket: ensure it exists and matches expected settings. The
--    `on conflict` clause covers both "first run" and "0019 already
--    created it" cases identically.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies: drop every previous attempt by exact name, then
--    recreate. RLS on storage.objects is ON globally; without a
--    SELECT policy, even public buckets return empty / 400 for
--    anon GETs through the /object/public/ path.

drop policy if exists "Avatars are publicly readable" on storage.objects;
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Avatar insert own" on storage.objects;
create policy "Avatar insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "Avatar update own" on storage.objects;
create policy "Avatar update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
drop policy if exists "Avatar delete own" on storage.objects;
create policy "Avatar delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
