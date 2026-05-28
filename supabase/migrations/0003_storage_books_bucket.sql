-- ============================================================================
-- Bookflow · 0003_storage_books_bucket
-- ----------------------------------------------------------------------------
-- Creates the private `books` Storage bucket that user-uploaded PDFs and EPUBs
-- live in, plus RLS policies on storage.objects so users can only read/write
-- objects under their own user-id-prefixed folder.
--
-- Object path convention: `{user_id}/{book_id}/original.{ext}`. The first path
-- segment is the auth uid, which RLS pins via storage.foldername(name)[1].
--
-- The bucket is private (public=false); all reads must go through signed URLs
-- (`supabase.storage.from('books').createSignedUrl(...)`) or service-role
-- access from Edge Functions.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('books', 'books', false)
on conflict (id) do nothing;

-- Drop and re-create policies so this migration is idempotent.
drop policy if exists "books_objects_select_own" on storage.objects;
drop policy if exists "books_objects_insert_own" on storage.objects;
drop policy if exists "books_objects_update_own" on storage.objects;
drop policy if exists "books_objects_delete_own" on storage.objects;

create policy "books_objects_select_own"
  on storage.objects for select
  using (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "books_objects_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "books_objects_update_own"
  on storage.objects for update
  using (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "books_objects_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'books'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
