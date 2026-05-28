-- ============================================================================
-- Bookflow · 0012_pages_fulltext_search
-- ----------------------------------------------------------------------------
-- Adds full-text search over `pages.content` so the reader can offer
-- "find in book" — type a phrase, get the matching pages with snippets.
--
-- Approach: a generated `content_tsv` column (Postgres maintains it
-- automatically on insert/update) plus a GIN index for fast `@@`
-- lookups. We use the `english` text-search config; non-English books
-- still match on stems but the relevance ranking is calibrated for
-- English. Worth revisiting if we add translation/i18n.
--
-- The column is `stored` (materialised, not virtual) — small storage
-- cost (a few % of the content size) for major query speedup.
-- ============================================================================

alter table public.pages
  add column if not exists content_tsv tsvector
    generated always as (to_tsvector('english', coalesce(content, ''))) stored;

create index if not exists pages_content_tsv_idx
  on public.pages
  using gin (content_tsv);
