-- ============================================================================
-- Bookflow · 0010_chapters_to_pages
-- ----------------------------------------------------------------------------
-- Big rename: the unit of content goes from "chapter" (heuristic, fuzzy
-- per-format detection that often produced misleading boundaries) to
-- "page" (~200-word slices, stable across PDF and EPUB). The reader, AI
-- tools, highlights, sessions, audio cache, and embeddings all retarget
-- to the new unit.
--
-- Decisions confirmed by product:
--   - A page is ~200 words. The edge function emits these in a follow-up
--     PR; this migration is just the schema rename + flush.
--   - Highlights, reading sessions, AI summaries, audio cache, and chunk
--     embeddings all flush — they reference chapter indices/ids that no
--     longer correspond to anything meaningful. They regenerate on demand
--     once each book is re-processed.
--   - Books are NOT auto-re-processed; their `total_pages` is nulled and
--     `pages` is empty until the user taps long-press → Re-process. The
--     reader handles the empty-pages state with an explicit prompt.
--
-- Safety notes:
--   - This is destructive for derived data (highlights, sessions, AI
--     output) but preserves the books table itself — uploaded files,
--     covers, titles, metadata all survive. Users keep their library.
--   - The migration is split into a single transaction by Supabase's
--     migration runner, so a failure mid-way rolls everything back.
-- ============================================================================

-- ── 1. Drop chapter-named RLS policies (recreated under the new name below) ──
drop policy if exists "chapters_select_own" on public.chapters;
drop policy if exists "chapters_insert_own" on public.chapters;
drop policy if exists "chapters_update_own" on public.chapters;
drop policy if exists "chapters_delete_own" on public.chapters;

-- ── 2. Rename the table + the index column on it ────────────────────────────
alter table public.chapters rename to pages;
alter table public.pages rename column chapter_index to page_index;

-- New: original PDF page number per row, when the source is a PDF. Lets the
-- PDF reader still snap to native pages even though the data layer is now
-- page-slice-based. Null for EPUB-sourced rows.
alter table public.pages add column if not exists pdf_page_number integer;

-- ── 3. Rename foreign-key columns in dependent tables ───────────────────────
alter table public.audio_cache       rename column chapter_id    to page_id;
alter table public.summaries         rename column chapter_id    to page_id;
alter table public.chunk_embeddings  rename column chapter_id    to page_id;
alter table public.highlights        rename column chapter_index to page_index;
alter table public.highlights        rename column chapter_id    to page_id;
alter table public.reading_sessions  rename column chapter_index to page_index;
alter table public.reading_sessions  rename column chapter_id    to page_id;

-- ── 4. Rename books column for the persisted reading position ──────────────
alter table public.books rename column last_read_chapter to last_read_page;

-- ── 5. Rename indexes for clarity (data preserved through the rename) ──────
alter index if exists chapters_book_id_idx
  rename to pages_book_id_idx;
alter index if exists chapters_book_id_chapter_index_key
  rename to pages_book_id_page_index_key;
alter index if exists highlights_book_chapter_idx
  rename to highlights_book_page_idx;
alter index if exists highlights_word_unique_per_chapter
  rename to highlights_word_unique_per_page;

-- ── 6. Recreate the pages RLS policies under the new name ──────────────────
create policy "pages_select_own"
  on public.pages for select
  using (exists (
    select 1 from public.books b
    where b.id = pages.book_id and b.user_id = auth.uid()
  ));

create policy "pages_insert_own"
  on public.pages for insert
  with check (exists (
    select 1 from public.books b
    where b.id = pages.book_id and b.user_id = auth.uid()
  ));

create policy "pages_update_own"
  on public.pages for update
  using (exists (
    select 1 from public.books b
    where b.id = pages.book_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.books b
    where b.id = pages.book_id and b.user_id = auth.uid()
  ));

create policy "pages_delete_own"
  on public.pages for delete
  using (exists (
    select 1 from public.books b
    where b.id = pages.book_id and b.user_id = auth.uid()
  ));

-- ── 7. Flush stale chapter-keyed derived data ──────────────────────────────
-- Order matters: truncate the dependent tables (highlights, sessions, AI
-- caches) before pages, then truncate pages itself. We use cascade on the
-- final pages truncate as a belt-and-braces in case the FK graph picks up
-- new tables in future migrations before we revisit this file.
truncate public.highlights;
truncate public.reading_sessions;
truncate public.summaries;
truncate public.audio_cache;
truncate public.chunk_embeddings;
truncate public.pages cascade;

-- ── 8. Reset per-book reading position + page-count metadata ───────────────
-- After this, every book reads as "needs re-processing" — total_pages is
-- null until the new edge function fills it back in. The library row's
-- processing_status stays 'ready' so the user can still long-press the
-- book to trigger Re-process; opening it before re-processing shows an
-- empty page list.
update public.books
set last_read_page     = 0,
    last_read_position = 0,
    total_pages        = null,
    total_chapters     = null;
