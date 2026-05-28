-- ============================================================================
-- Bookflow · 0011_practice_questions
-- ----------------------------------------------------------------------------
-- Cache for AI-generated practice questions. One row per (page, count)
-- — same shape philosophy as the `summaries` cache: keyed by what the
-- user asked for, content stored as a JSON blob.
--
-- We keep `count` in the PK because regenerating with a different
-- question count is a different request (5 questions vs 10 covers
-- different ground); the cache shouldn't collapse them.
--
-- Each row's `questions` is a jsonb array of:
--   {
--     question:    string,
--     options:     string[],     // 4 entries
--     correctIndex: number,      // 0..3
--     explanation: string
--   }
--
-- RLS joins through pages → books → user_id, same pattern as
-- `summaries` — users see only their own books' questions.
-- ============================================================================

create table if not exists public.practice_questions (
  page_id          uuid references public.pages(id) on delete cascade,
  count            integer not null,
  questions        jsonb not null,
  generated_at     timestamptz not null default now(),
  primary key (page_id, count)
);

create index if not exists practice_questions_page_id_idx
  on public.practice_questions (page_id);

alter table public.practice_questions enable row level security;

create policy "practice_questions_select_own"
  on public.practice_questions for select
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = practice_questions.page_id and b.user_id = auth.uid()
  ));

create policy "practice_questions_insert_own"
  on public.practice_questions for insert
  with check (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = practice_questions.page_id and b.user_id = auth.uid()
  ));

create policy "practice_questions_update_own"
  on public.practice_questions for update
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = practice_questions.page_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = practice_questions.page_id and b.user_id = auth.uid()
  ));

create policy "practice_questions_delete_own"
  on public.practice_questions for delete
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = practice_questions.page_id and b.user_id = auth.uid()
  ));
