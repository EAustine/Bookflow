-- ============================================================================
-- Bookflow · 0006_books_total_pages
-- ----------------------------------------------------------------------------
-- Adds a real `total_pages` column on books so the library + reader can
-- show accurate "p. X of Y" instead of a chapters-times-12 synthetic count.
--
--   - PDF: pdf-parse already exposes `numpages`; the edge function writes it.
--   - EPUB: no native page concept, so the edge function estimates from the
--           total word count (~250 words ≈ 1 page).
--
-- Nullable on purpose: legacy rows keep working until they're re-processed,
-- and the client falls back to the previous chapters * 12 estimate when the
-- column is null.
-- ============================================================================

alter table public.books
  add column if not exists total_pages integer;
