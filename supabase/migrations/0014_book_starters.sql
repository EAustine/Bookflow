-- 0014_book_starters.sql
--
-- Adds a per-book cache of suggested chat starter questions. The
-- ChatScreen ("Ask about the book") shows a small list of suggested
-- questions before the user has typed anything; until this migration
-- they were hardcoded Gatsby fixtures from the design phase. Now they
-- are book-specific, generated once by `generate-starters` and reused
-- on every subsequent open.
--
-- Why a column on `books` (not a separate table): there is exactly one
-- row per book and we always read it alongside the book row anyway
-- (Library + Reader screens already select books.*). A side table
-- would just add a join for no benefit.

alter table public.books
  add column if not exists suggested_questions text[];

comment on column public.books.suggested_questions is
  'Cached starter questions for the chat screen. Populated by the generate-starters edge function. NULL until first generation.';
