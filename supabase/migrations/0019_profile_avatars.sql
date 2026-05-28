-- 0019_profile_avatars.sql
--
-- Adds profile avatar support. Two pieces:
--   1. `profiles.avatar_storage_path` — TEXT path under the `avatars`
--      bucket. Always {user_id}/avatar.{ext}, but we store the full
--      path explicitly so a future move (e.g. CDN bucket) doesn't
--      require a code change.
--   2. The `avatars` storage bucket itself, with public READ so the
--      client can `getPublicUrl()` (no signed URL plumbing per
--      render), and authed-WRITE limited to the user's own prefix.
--
-- Why public read on a profile pic: avatars need to be reachable
-- from every cover-rendering surface (You tab header, Account
-- screen, future reactions on highlights, etc.) — a single signed
-- URL per request would either (a) inflate API calls or (b) need a
-- per-screen cache. Public + path-based-ACL is the same model GitHub
-- and Slack use for avatars and is fine for this content type.

alter table public.profiles
  add column if not exists avatar_storage_path text;

comment on column public.profiles.avatar_storage_path is
  'Path under the `avatars` storage bucket. Conventionally `{user_id}/avatar.{ext}`. NULL for users who haven''t uploaded a photo.';

-- Create the bucket. `public = true` means anyone with the URL can
-- read; uploads are still gated by the policies below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5 * 1024 * 1024,                                  -- 5 MB max
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS policies. Path convention: `{user_id}/avatar.{ext}`.
-- The leading segment is the user's auth.uid() — we enforce that on
-- write/update/delete so an attacker can't drop a file into someone
-- else's prefix.

-- Public read — anyone can fetch any avatar by URL. (Bucket is
-- already `public=true` which bypasses RLS for SELECT, but we add
-- an explicit policy here for clarity and to survive a future
-- `public=false` switch.)
drop policy if exists "Avatars are publicly readable" on storage.objects;
create policy "Avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
