-- 0028_pdf_page_fidelity.sql
--
-- PDF text mode stores one row per ORIGINAL PDF page.
--
-- Before this, `process-book` sliced each PDF page's text into ~200-word
-- rows, so a 20-page PDF became ~130 "pages" and "page 15" in text mode
-- was not page 15 in the Full view. Chapter ranges and AI citations
-- inherited the same error.
--
-- The word-count rule is unchanged for EPUB, which has no inherent
-- pages and for which ~200 words is a deliberate product decision.
--
-- No existing data is rewritten. Books processed before this keep their
-- slice-pages and keep working; `extraction_version` is what tells the
-- two apart. Re-processing a book (see `reprocessBook`) opts it into the
-- new model, which is a per-book choice because it changes that book's
-- page ids and therefore drops its highlights.

-- Which extraction pipeline produced a book's pages.
--   1 = slice-paginated (~200 words per row). The historical default.
--   2 = page-faithful for PDFs: one row per original page.
-- EPUB rows stay at 1 regardless: their pagination did not change, and
-- claiming otherwise would make the column lie.
alter table public.books
  add column if not exists extraction_version integer not null default 1;

comment on column public.books.extraction_version is
  'Pipeline that produced this book''s pages. 1 = slice-paginated '
  '(~200 words/row). 2 = one row per original PDF page. EPUBs remain 1; '
  'their pagination is unchanged. Bump when parsing changes in a way '
  'that invalidates stored character offsets.';

-- `pdf_page_number` has existed since 0010 and was already populated on
-- every PDF row. At version 2 it carries a stronger guarantee, so say so.
comment on column public.pages.pdf_page_number is
  'Original 1-based PDF page. Null for EPUB. At books.extraction_version '
  '>= 2 this is 1:1 with the row — page_index + 1 = pdf_page_number — so '
  'it is the join key for citations and the Full/Text toggle. At version 1 '
  'several rows share one value, because each PDF page was sliced.';

-- The version is denormalised onto `pages` as well, because the
-- constraint below has to be expressible in a partial index and an index
-- cannot reach into another table.
alter table public.pages
  add column if not exists extraction_version integer not null default 1;

-- A page-faithful book must have exactly one row per PDF page. Enforced
-- rather than trusted: a parser regression would otherwise surface as
-- subtly wrong citations much later, which is how the original bug
-- survived this long.
--
-- Scoped to version >= 2. Existing rows are version 1 and deliberately
-- share a pdf_page_number — several slices per page was the whole
-- problem — so an unscoped unique index would fail on every book
-- already in the database.
create unique index if not exists pages_one_row_per_pdf_page_v2
  on public.pages (book_id, pdf_page_number)
  where pdf_page_number is not null and extraction_version >= 2;
