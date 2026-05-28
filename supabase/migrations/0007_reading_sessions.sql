-- ============================================================================
-- Bookflow · 0007_reading_sessions
-- ----------------------------------------------------------------------------
-- Append-only log of *text* reading sessions — distinct from the existing
-- `listen_sessions` table which logs audio playback. One row per uninterrupted
-- in-app reading stretch (open the reader → leave the reader, or change
-- chapter). Used downstream for "Recently read" lists, streaks, and per-book
-- time-spent stats.
--
-- Columns:
--   chapter_id        FK if known; nullable so we can log sessions for books
--                     that haven't fully indexed chapters yet.
--   chapter_index     Cheap denormalised copy so a session→chapter join isn't
--                     required for simple "what chapter were they on" queries.
--   started_at        Timestamp at reader mount.
--   ended_at          Timestamp at unmount/chapter change. Nullable so an
--                     in-progress session can be visible to the client until
--                     it's closed (set on next page open, edge cron, etc).
--   duration_seconds  ended_at - started_at, denormalised so stats queries
--                     don't have to subtract on every read.
--   words_read        Best-effort estimate from scroll-fraction × chapter
--                     word_count at session end. Nullable for in-progress.
--
-- RLS: same "user owns the row" rule as listen_sessions. Inserts by the
-- authenticated user; no cross-user access.
-- ============================================================================

create table if not exists public.reading_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete cascade,
  book_id           uuid references public.books(id) on delete cascade,
  chapter_id        uuid references public.chapters(id) on delete set null,
  chapter_index     integer,
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_seconds  integer,
  words_read        integer,
  created_at        timestamptz not null default now()
);

create index if not exists reading_sessions_user_id_idx
  on public.reading_sessions (user_id);
create index if not exists reading_sessions_book_id_idx
  on public.reading_sessions (book_id);
create index if not exists reading_sessions_user_book_started_idx
  on public.reading_sessions (user_id, book_id, started_at desc);

alter table public.reading_sessions enable row level security;

create policy "reading_sessions_select_own"
  on public.reading_sessions for select
  using (auth.uid() = user_id);

create policy "reading_sessions_insert_own"
  on public.reading_sessions for insert
  with check (auth.uid() = user_id);

create policy "reading_sessions_update_own"
  on public.reading_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reading_sessions_delete_own"
  on public.reading_sessions for delete
  using (auth.uid() = user_id);
