-- ============================================================================
-- 0004_realtime_books — enable realtime broadcasts for books table.
--
-- The library subscribes to `postgres_changes` on `public.books` so newly
-- uploaded rows (and processing-status updates from the Edge Function)
-- surface without a manual refresh. Without the table being in the
-- `supabase_realtime` publication, no events fire and the library only
-- updates on explicit refetch.
-- ============================================================================

alter publication supabase_realtime add table public.books;
