-- 0016_audio_cache_alignment.sql
--
-- Adds `alignment_path` to the audio_cache row so we can store the
-- character-level timestamps that ElevenLabs returns from the
-- `/with-timestamps` endpoint. Used by the Listen screen to drive the
-- bimodal "current word" highlight: an amber block over whichever
-- word ElevenLabs is narrating.
--
-- The alignment file itself lives in Storage at the same prefix as the
-- audio mp3, e.g.:
--   {user}/{book}/audio/{page_index}_{voice}.mp3   (audio)
--   {user}/{book}/audio/{page_index}_{voice}.json  (alignment)
--
-- We keep them as separate Storage objects (not a combined row) for
-- two reasons:
--   1. The alignment payload is ~30-60KB per page; embedding it in
--      a row column would balloon the audio_cache row size for
--      every consumer of the table.
--   2. Older cached audio (generated before this migration) has no
--      alignment; we want a clean nullable signal rather than a
--      heuristic on row data.
--
-- alignment_path is nullable so old rows continue to work — the client
-- handles missing alignment by skipping the highlight render and
-- showing static page text (the existing reader behaviour).

alter table public.audio_cache
  add column if not exists alignment_path text;

comment on column public.audio_cache.alignment_path is
  'Storage path for the JSON sidecar holding character-level timestamps from ElevenLabs /with-timestamps. NULL when no alignment was captured (older cache rows or alignment fetch failures).';
