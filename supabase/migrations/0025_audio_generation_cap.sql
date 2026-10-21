-- 0025_audio_generation_cap.sql
-- Decouple audio COST from audio LISTENING.
--
-- Until now `audio_seconds_used` counted every served page (cache hit, cross-
-- user dedup hit, AND fresh ElevenLabs generation) against one cap. But only
-- fresh generation actually costs money (~$0.08/min); cached + dedup serves
-- are ~free. So the old cap throttled cheap listening while doing little to
-- bound the expensive thing.
--
-- New model (enforced by the generate-audio edge function):
--   * Cached + dedup serves  → unlimited, never counted, never blocked.
--   * Fresh generation       → counted in `audio_seconds_used` and capped.
--
-- So `audio_seconds_used` now means "seconds of NEW narration generated this
-- month", and `audio_seconds_limit` is the monthly GENERATION allowance:
--   * Free: 60 min/month  (was 90 min of total listening)
--   * Pro : 50 hours/month (abuse backstop, hard-coded in the edge function;
--           a normal Pro listener never approaches it)
-- Purchased audio top-up balance still extends generation past the monthly
-- allowance (see 0024 record_audio_usage — unchanged; it's generic).

-- 1. Lower the free monthly generation allowance: 90 min → 60 min.
alter table public.profiles
  alter column audio_seconds_limit set default 3600;

-- Bring existing free rows down to the new default. Rows that were already
-- customised away from the old 5400 default are left alone.
update public.profiles
   set audio_seconds_limit = 3600
 where coalesce(audio_seconds_limit, 5400) = 5400;

-- 2. Reset the running counter for everyone. Its MEANING just changed from
--    "listened" to "generated", so any value carried over from this month
--    would over-count generation (most of it was cheap cached listening).
--    Start fresh under the new semantics; the period anchor rolls to now.
update public.profiles
   set audio_seconds_used = 0,
       audio_seconds_period_start = date_trunc('month', now());
