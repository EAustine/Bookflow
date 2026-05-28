-- 0017_books_file_storage_path.sql
--
-- Adds `file_storage_path` to `books` so we can record where the source
-- file landed in storage at upload time. This is required by the
-- reprocess flow (lib/reprocessBook.ts) — without it, retrying a book
-- has to guess the path from upload conventions, which fail for
-- Gutenberg imports (which write to `source.epub`) vs device uploads
-- (which write to `original.{ext}`).
--
-- The import-from-url edge function was already writing to this column
-- but the column didn't exist; that write silently no-op'd. After this
-- migration, new imports will populate the column. Existing rows stay
-- NULL — they can be backfilled by inspecting their storage prefix or
-- left to fall through to the legacy `original.{ext}` guess in
-- reprocessBook.ts.

alter table public.books
  add column if not exists file_storage_path text;

comment on column public.books.file_storage_path is
  'Path to the source EPUB / PDF in the `books` storage bucket. Set at upload time by import-from-url and the device-upload flow. NULL for legacy rows pre-dating this column.';
