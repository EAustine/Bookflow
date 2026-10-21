-- 0023_audio_dedup.sql
-- Cross-user audio dedup. Audio is otherwise cached per-user (audio_cache is
-- keyed by each user's page_id), so shared public-domain books (Discover,
-- Bibles) get re-narrated — and re-billed on ElevenLabs — once per user. This
-- global cache is keyed by the CONTENT HASH of the page text + voice, so the
-- audio is generated once and reused by everyone with identical text.
--
-- Written/read only by the generate-audio edge function (service role); RLS
-- is enabled with no client policies so it's inaccessible to clients.

create table if not exists public.audio_content_cache (
  content_hash text not null,
  voice_id text not null,
  storage_path text not null,
  alignment_path text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  primary key (content_hash, voice_id)
);

alter table public.audio_content_cache enable row level security;
-- (No policies on purpose — only the service role touches this table.)
