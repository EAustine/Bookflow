-- ============================================================================
-- Bookflow · 0013_translations
-- ----------------------------------------------------------------------------
-- Cache for AI-generated page translations. Same shape philosophy as
-- summaries / practice_questions: keyed by what the user asked for,
-- content stored as plain text. Re-translating into the same language
-- is a free cache hit; re-translating into a different language is a
-- separate row.
--
-- `target_language` is an arbitrary language code/name string — we
-- accept whatever the client sends so we don't have to migrate the
-- enum every time we add a language. Common values today:
-- 'twi', 'spanish', 'french', 'german', 'italian', 'portuguese',
-- 'japanese', 'mandarin', 'korean', 'arabic'. Lowercased server-side
-- to keep cache hits stable across casings.
-- ============================================================================

create table if not exists public.translations (
  page_id          uuid references public.pages(id) on delete cascade,
  target_language  text not null,
  content          text not null,
  generated_at     timestamptz not null default now(),
  primary key (page_id, target_language)
);

create index if not exists translations_page_id_idx
  on public.translations (page_id);

alter table public.translations enable row level security;

create policy "translations_select_own"
  on public.translations for select
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = translations.page_id and b.user_id = auth.uid()
  ));

create policy "translations_insert_own"
  on public.translations for insert
  with check (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = translations.page_id and b.user_id = auth.uid()
  ));

create policy "translations_update_own"
  on public.translations for update
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = translations.page_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = translations.page_id and b.user_id = auth.uid()
  ));

create policy "translations_delete_own"
  on public.translations for delete
  using (exists (
    select 1 from public.pages p
    join public.books b on b.id = p.book_id
    where p.id = translations.page_id and b.user_id = auth.uid()
  ));
