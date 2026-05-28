-- ============================================================================
-- Bookflow · 0008_highlights
-- ----------------------------------------------------------------------------
-- User-saved highlights. Two kinds, distinguished by `kind`:
--   - 'word'     : a single word saved from the dictionary popover.
--                  `text` holds the surface form (lowercased).
--   - 'sentence' : a full sentence saved from the translate sheet.
--                  `text` holds the sentence verbatim.
--
-- A "highlight" here is broader than a marker — it's the user's saved
-- vocabulary list AND their saved passages, in one table. The library /
-- reader render this back as visual highlights when the same word/sentence
-- is encountered in subsequent reads.
--
-- Why one table for both: the read-side queries are identical (give me all
-- highlights for this chapter) and the storage shapes are the same. Splitting
-- would just mean two policies and two hooks for very similar data.
--
-- `note` is reserved for a follow-up "annotations" feature where the user
-- can add a note to a highlight; nullable today.
-- `color` is a free-form string ('yellow' | 'green' | etc) so we can theme
-- highlights without a schema migration each time we add a swatch.
-- ============================================================================

create table if not exists public.highlights (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles(id) on delete cascade,
  book_id         uuid references public.books(id) on delete cascade,
  chapter_id      uuid references public.chapters(id) on delete set null,
  chapter_index   integer,
  kind            text not null check (kind in ('word', 'sentence')),
  text            text not null,
  note            text,
  color           text default 'yellow',
  created_at      timestamptz not null default now()
);

create index if not exists highlights_user_id_idx
  on public.highlights (user_id);
create index if not exists highlights_book_chapter_idx
  on public.highlights (book_id, chapter_index);
-- Prevent accidental dupes when the user re-saves the same word in the same
-- chapter (e.g. two taps in a row). Sentences can repeat verbatim across a
-- chapter so we only enforce uniqueness on word kind via a partial index.
create unique index if not exists highlights_word_unique_per_chapter
  on public.highlights (user_id, book_id, chapter_index, lower(text))
  where kind = 'word';

alter table public.highlights enable row level security;

create policy "highlights_select_own"
  on public.highlights for select
  using (auth.uid() = user_id);

create policy "highlights_insert_own"
  on public.highlights for insert
  with check (auth.uid() = user_id);

create policy "highlights_update_own"
  on public.highlights for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "highlights_delete_own"
  on public.highlights for delete
  using (auth.uid() = user_id);
