-- ============================================================================
-- Bookflow · 0001_initial_schema
-- ----------------------------------------------------------------------------
-- Initial 10-table schema covering profiles, the book → chapter → audio/summary
-- tree, the conversation → message tree, vector embeddings for retrieval, and
-- the listen-sessions log used for "Recently listened" + monthly stats.
--
-- Conventions:
--   - All `id` columns are uuid; user-owned tables cascade-delete on user removal.
--   - RLS is enabled on every table. The single rule is "users see only their
--     own rows". Tables without a direct `user_id` (chapters, audio_cache,
--     summaries, messages, chunk_embeddings) join up to their parent (books or
--     conversations) and check ownership there via `EXISTS` subqueries — that's
--     the standard Supabase pattern and avoids denormalising user_id everywhere.
--
-- Required extensions:
--   - pgcrypto for gen_random_uuid()
--   - vector  for the embeddings column (Supabase ships pgvector pre-installed,
--             we just need to enable it in this database).
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================================
-- profiles — one row per auth.users row, populated by the on_auth_user_created
-- trigger below. Owns plan + usage meters.
-- ============================================================================
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  full_name             text,
  email                 text,
  onboarding_intent     text,                            -- 'study' | 'listen' | 'language' | 'explore' | null
  onboarding_complete   boolean      default false,
  translation_target    text         default 'twi',
  ai_credits_used       integer      default 0,
  ai_credits_limit      integer      default 50000,
  audio_seconds_used    integer      default 0,
  audio_seconds_limit   integer      default 5400,        -- 90 minutes
  plan                  text         default 'free',      -- 'free' | 'standard' | 'student'
  created_at            timestamptz  default now(),
  updated_at            timestamptz  default now()
);

-- ============================================================================
-- books — user library entries. Source 'upload' or 'catalog'.
-- ============================================================================
create table if not exists public.books (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete cascade,
  title                 text not null,
  author                text,
  cover_storage_path    text,
  source                text,                              -- 'upload' | 'catalog'
  file_type             text,                              -- 'pdf' | 'epub'
  processing_status     text default 'pending',            -- 'pending' | 'processing' | 'ready' | 'partial' | 'failed'
  total_chapters        integer,
  last_read_chapter     integer default 0,
  last_read_position    integer default 0,
  created_at            timestamptz default now()
);

create index if not exists books_user_id_idx on public.books (user_id);

-- ============================================================================
-- chapters — extracted text per chapter, joined to books.
-- ============================================================================
create table if not exists public.chapters (
  id              uuid primary key default gen_random_uuid(),
  book_id         uuid references public.books(id) on delete cascade,
  chapter_index   integer not null,
  title           text,
  content         text,
  word_count      integer,
  created_at      timestamptz default now()
);

create index if not exists chapters_book_id_idx on public.chapters (book_id);
create unique index if not exists chapters_book_id_chapter_index_key on public.chapters (book_id, chapter_index);

-- ============================================================================
-- audio_cache — generated TTS audio per (chapter, voice) pair.
-- ============================================================================
create table if not exists public.audio_cache (
  chapter_id        uuid references public.chapters(id) on delete cascade,
  voice_id          text not null,
  storage_path      text,
  duration_seconds  integer,
  generated_at      timestamptz default now(),
  primary key (chapter_id, voice_id)
);

-- ============================================================================
-- summaries — generated summaries per (chapter, length) pair, with thumbs.
-- ============================================================================
create table if not exists public.summaries (
  chapter_id          uuid references public.chapters(id) on delete cascade,
  length              text not null,                  -- 'tldr' | 'standard' | 'detailed' | 'whole_book'
  content             text,
  generated_at        timestamptz default now(),
  thumbs_up           boolean,
  thumbs_down_reason  text,
  primary key (chapter_id, length)
);

-- ============================================================================
-- conversations — one Q&A thread per user × book.
-- ============================================================================
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  book_id     uuid references public.books(id) on delete cascade,
  created_at  timestamptz default now()
);

create index if not exists conversations_user_id_idx on public.conversations (user_id);
create index if not exists conversations_book_id_idx on public.conversations (book_id);

-- ============================================================================
-- messages — individual user/assistant turns within a conversation.
-- ============================================================================
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations(id) on delete cascade,
  role             text not null,           -- 'user' | 'assistant'
  content          text,
  sources          jsonb,
  thumbs_up        boolean,
  created_at       timestamptz default now()
);

create index if not exists messages_conversation_id_idx on public.messages (conversation_id);

-- ============================================================================
-- chunk_embeddings — pgvector embeddings for retrieval-augmented Q&A.
-- ============================================================================
create table if not exists public.chunk_embeddings (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid references public.books(id) on delete cascade,
  chapter_id   uuid references public.chapters(id) on delete cascade,
  chunk_text   text,
  embedding    vector(1536),
  page_number  integer
);

create index if not exists chunk_embeddings_book_id_idx on public.chunk_embeddings (book_id);
create index if not exists chunk_embeddings_chapter_id_idx on public.chunk_embeddings (chapter_id);

-- ============================================================================
-- listen_sessions — append-only log of audio listening events.
-- ============================================================================
create table if not exists public.listen_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references public.profiles(id) on delete cascade,
  book_id           uuid references public.books(id) on delete cascade,
  chapter_id        uuid references public.chapters(id),
  duration_seconds  integer,
  listened_at       timestamptz default now()
);

create index if not exists listen_sessions_user_id_idx on public.listen_sessions (user_id);
create index if not exists listen_sessions_book_id_idx on public.listen_sessions (book_id);

-- ============================================================================
-- Trigger: mirror new auth.users rows into public.profiles
-- ----------------------------------------------------------------------------
-- Runs as SECURITY DEFINER because the trigger fires in the auth schema's
-- context; we need elevated rights to insert into public.profiles which is
-- otherwise locked down by RLS. `set search_path = public` defends against
-- search-path-based privilege escalation.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Row Level Security
-- ----------------------------------------------------------------------------
-- Enable RLS on every table. For each one, allow SELECT/INSERT/UPDATE/DELETE
-- only when the row belongs to the authenticated user. Tables without a direct
-- user_id walk up to the owning books or conversations row.
-- ============================================================================

alter table public.profiles         enable row level security;
alter table public.books            enable row level security;
alter table public.chapters         enable row level security;
alter table public.audio_cache      enable row level security;
alter table public.summaries        enable row level security;
alter table public.conversations    enable row level security;
alter table public.messages         enable row level security;
alter table public.chunk_embeddings enable row level security;
alter table public.listen_sessions  enable row level security;

-- ── profiles ────────────────────────────────────────────────────────────────
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- ── books ───────────────────────────────────────────────────────────────────
create policy "books_select_own"
  on public.books for select
  using (auth.uid() = user_id);

create policy "books_insert_own"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "books_update_own"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "books_delete_own"
  on public.books for delete
  using (auth.uid() = user_id);

-- ── chapters (join through books) ──────────────────────────────────────────
create policy "chapters_select_own"
  on public.chapters for select
  using (exists (select 1 from public.books b where b.id = chapters.book_id and b.user_id = auth.uid()));

create policy "chapters_insert_own"
  on public.chapters for insert
  with check (exists (select 1 from public.books b where b.id = chapters.book_id and b.user_id = auth.uid()));

create policy "chapters_update_own"
  on public.chapters for update
  using (exists (select 1 from public.books b where b.id = chapters.book_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = chapters.book_id and b.user_id = auth.uid()));

create policy "chapters_delete_own"
  on public.chapters for delete
  using (exists (select 1 from public.books b where b.id = chapters.book_id and b.user_id = auth.uid()));

-- ── audio_cache (join through chapters → books) ────────────────────────────
create policy "audio_cache_select_own"
  on public.audio_cache for select
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = audio_cache.chapter_id and b.user_id = auth.uid()
  ));

create policy "audio_cache_insert_own"
  on public.audio_cache for insert
  with check (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = audio_cache.chapter_id and b.user_id = auth.uid()
  ));

create policy "audio_cache_update_own"
  on public.audio_cache for update
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = audio_cache.chapter_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = audio_cache.chapter_id and b.user_id = auth.uid()
  ));

create policy "audio_cache_delete_own"
  on public.audio_cache for delete
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = audio_cache.chapter_id and b.user_id = auth.uid()
  ));

-- ── summaries (join through chapters → books) ──────────────────────────────
create policy "summaries_select_own"
  on public.summaries for select
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = summaries.chapter_id and b.user_id = auth.uid()
  ));

create policy "summaries_insert_own"
  on public.summaries for insert
  with check (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = summaries.chapter_id and b.user_id = auth.uid()
  ));

create policy "summaries_update_own"
  on public.summaries for update
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = summaries.chapter_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = summaries.chapter_id and b.user_id = auth.uid()
  ));

create policy "summaries_delete_own"
  on public.summaries for delete
  using (exists (
    select 1 from public.chapters c
    join public.books b on b.id = c.book_id
    where c.id = summaries.chapter_id and b.user_id = auth.uid()
  ));

-- ── conversations ───────────────────────────────────────────────────────────
create policy "conversations_select_own"
  on public.conversations for select
  using (auth.uid() = user_id);

create policy "conversations_insert_own"
  on public.conversations for insert
  with check (auth.uid() = user_id);

create policy "conversations_update_own"
  on public.conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "conversations_delete_own"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- ── messages (join through conversations) ──────────────────────────────────
create policy "messages_select_own"
  on public.messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  ));

create policy "messages_insert_own"
  on public.messages for insert
  with check (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  ));

create policy "messages_update_own"
  on public.messages for update
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  ));

create policy "messages_delete_own"
  on public.messages for delete
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = auth.uid()
  ));

-- ── chunk_embeddings (join through books) ──────────────────────────────────
create policy "chunk_embeddings_select_own"
  on public.chunk_embeddings for select
  using (exists (
    select 1 from public.books b where b.id = chunk_embeddings.book_id and b.user_id = auth.uid()
  ));

create policy "chunk_embeddings_insert_own"
  on public.chunk_embeddings for insert
  with check (exists (
    select 1 from public.books b where b.id = chunk_embeddings.book_id and b.user_id = auth.uid()
  ));

create policy "chunk_embeddings_update_own"
  on public.chunk_embeddings for update
  using (exists (
    select 1 from public.books b where b.id = chunk_embeddings.book_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.books b where b.id = chunk_embeddings.book_id and b.user_id = auth.uid()
  ));

create policy "chunk_embeddings_delete_own"
  on public.chunk_embeddings for delete
  using (exists (
    select 1 from public.books b where b.id = chunk_embeddings.book_id and b.user_id = auth.uid()
  ));

-- ── listen_sessions ─────────────────────────────────────────────────────────
create policy "listen_sessions_select_own"
  on public.listen_sessions for select
  using (auth.uid() = user_id);

create policy "listen_sessions_insert_own"
  on public.listen_sessions for insert
  with check (auth.uid() = user_id);

create policy "listen_sessions_update_own"
  on public.listen_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "listen_sessions_delete_own"
  on public.listen_sessions for delete
  using (auth.uid() = user_id);
