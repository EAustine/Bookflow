-- ============================================================================
-- 0002_profile_polish — two small profile additions
-- ----------------------------------------------------------------------------
-- 1. Document the real `onboarding_intent` enum values used by the UI. The
--    column stays `text` (no CHECK constraint yet — we want flexibility while
--    the onboarding spec is still in motion), but the comment matches the
--    values OnboardingIntentScreen actually emits so the schema isn't lying.
--
-- 2. Add `marketing_consent` to profiles and update handle_new_user() to
--    denormalise it from raw_user_meta_data on signup. Previously consent
--    only lived on auth.users which is annoying to query for marketing
--    sends — having it on profiles keeps every per-user flag in one row.
-- ============================================================================

-- ── 1. Onboarding intent: align comment with UI values ─────────────────────
comment on column public.profiles.onboarding_intent is
  'One of: read_for_fun | study | focus_accessibility | listen_on_the_go | exploring | null';

-- ── 2. Marketing consent column ────────────────────────────────────────────
alter table public.profiles
  add column if not exists marketing_consent boolean not null default false;

-- Recreate handle_new_user() to also pull marketing_consent. Coalesce with
-- false so missing/legacy users default to opted-out — opt-in must be
-- explicit. raw_user_meta_data values come in as JSON; the cast handles both
-- boolean true/false and the string forms 'true'/'false' that some SDKs send.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, marketing_consent)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
