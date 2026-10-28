-- 0029_pdf_chapters_and_labels.sql
--
-- Real chapters for PDFs, from the PDF's own outline, plus printed page
-- labels.
--
-- Before this, "chapters" were whichever `pages` rows happened to carry
-- a non-null `title`, which the parser guessed from a regex on the first
-- line of a page. That finds "Chapter 5" and misses everything a
-- publisher actually encoded: nesting, parts, front matter, and the page
-- a chapter truly starts on when it starts mid-page.
--
-- The outline is authoritative when it exists. 0028 made a page a page;
-- this makes a chapter a chapter.

-- ── chapters ────────────────────────────────────────────────────────────
create table if not exists public.chapters (
  id                uuid primary key default gen_random_uuid(),
  book_id           uuid not null references public.books(id) on delete cascade,

  -- Position among siblings, and depth. A PDF outline is a tree: Part I
  -- contains Chapter 1..3. Flattening it would lose the only structure
  -- the publisher bothered to encode.
  ordinal           integer not null,
  level             integer not null default 0,
  parent_id         uuid references public.chapters(id) on delete cascade,

  title             text not null,

  -- 0-based, matching pages.page_index. A chapter runs to the page
  -- before the next chapter at the same-or-shallower level begins.
  start_page_index  integer not null,
  end_page_index    integer not null,

  -- How this chapter was found. Recorded because the quality differs
  -- enormously and the UI should be able to say "this PDF has no
  -- chapter information" honestly rather than presenting guesses as
  -- fact.
  --   outline  — the PDF's own bookmarks. Trustworthy.
  --   heading  — regex/font heuristics on page text. Usually right.
  --   fallback — page-range groups. Not chapters, just navigation.
  source            text not null
                      check (source in ('outline', 'heading', 'fallback')),

  created_at        timestamptz not null default now(),

  -- A chapter cannot end before it starts. Cheap to enforce, and an
  -- outline with a broken destination is a documented failure mode.
  constraint chapters_page_range_valid check (end_page_index >= start_page_index)
);

create index if not exists chapters_book_ordinal_idx
  on public.chapters (book_id, ordinal);
create index if not exists chapters_book_start_idx
  on public.chapters (book_id, start_page_index);

alter table public.chapters enable row level security;

-- Chapters are readable by whoever can read the book, and written only
-- by the service role (process-book). No client writes chapters.
create policy "chapters readable by book owner"
  on public.chapters for select
  using (
    exists (
      select 1 from public.books b
      where b.id = chapters.book_id and b.user_id = auth.uid()
    )
  );

-- ── pages.chapter_id ────────────────────────────────────────────────────
-- The chapter containing this page's START. A page that straddles a
-- chapter boundary belongs to the chapter it opens in; the alternative
-- is a many-to-many that nothing needs.
alter table public.pages
  add column if not exists chapter_id uuid
    references public.chapters(id) on delete set null;

create index if not exists pages_chapter_idx on public.pages (chapter_id);

-- ── pages.page_label ────────────────────────────────────────────────────
-- The printed page number, when the PDF declares one: "xii", "A-3", "15".
--
-- DISPLAY ONLY. Never a lookup key. Front matter numbered i..xii followed
-- by a body restarting at 1 means labels are neither unique nor ordered,
-- and treating one as an index is a documented way to get this wrong.
-- `page_index + 1` remains the one canonical page number.
alter table public.pages
  add column if not exists page_label text;

comment on column public.pages.page_label is
  'Printed page label from the PDF (e.g. "xii"), display-only and '
  'nullable. Not unique and not ordered — front matter often restarts '
  'numbering. page_index + 1 is the canonical page number.';
