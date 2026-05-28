-- 0015_books_source_url.sql
--
-- Adds `source_url` to `books` to support imports from external
-- catalogues (Project Gutenberg, Standard Ebooks). The `import-from-url`
-- edge function uses this column for two things:
--   1. De-dupe: if a user has already imported a book from this exact
--      URL, return the existing book row instead of fetching/processing
--      the same EPUB twice.
--   2. Provenance: lets the Discover screen mark a book as "already in
--      your library" without a full title/author match heuristic.
--
-- Indexed on (user_id, source_url) because that's the lookup pattern.
-- Partial index (WHERE source_url IS NOT NULL) keeps it small — most
-- rows come from device-uploaded EPUBs and have NULL here.

alter table public.books
  add column if not exists source_url text;

create index if not exists books_user_source_url_idx
  on public.books (user_id, source_url)
  where source_url is not null;

comment on column public.books.source_url is
  'Source URL for catalog-imported books (Gutenberg, Standard Ebooks). NULL for device uploads.';
