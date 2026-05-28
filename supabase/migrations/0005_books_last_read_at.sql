-- ============================================================================
-- 0005_books_last_read_at — track when a book was actually last read.
--
-- The library was previously using `created_at` as a proxy for "last read"
-- because there was no real timestamp on the books row. That meant every
-- book showed an "added X days ago"-style relative time even after the user
-- read it for hours. With this column the reader writes the wall-clock time
-- on every chapter change, and the library hook can derive an accurate
-- `lastReadAt` for sorting and the status line.
-- ============================================================================

alter table public.books
  add column if not exists last_read_at timestamptz;
