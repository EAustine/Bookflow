-- 0022_audio_metering.sql
-- Hard server-side enforcement of the free-tier audio cap. Reuses the
-- orphaned profiles.audio_seconds_used / audio_seconds_limit columns
-- (default 5400 = 90 minutes). The generate-audio edge function checks this
-- counter before serving any page audio (cache hit OR miss) and records the
-- page duration after. Pro users (profiles.plan = 'pro', maintained by the
-- RevenueCat webhook) are exempt.

-- Monthly reset anchor.
alter table public.profiles
  add column if not exists audio_seconds_period_start timestamptz not null
    default date_trunc('month', now());

-- Atomic record + monthly-roll. Rolls the period when the stored
-- period_start predates the current calendar month (UTC), increments the
-- running counter by the served seconds, and returns the new total.
create or replace function public.record_audio_usage(
  p_user uuid,
  p_seconds integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer;
begin
  update public.profiles
     set audio_seconds_used = case
           when audio_seconds_period_start < v_month then 0 else audio_seconds_used end,
         audio_seconds_period_start = case
           when audio_seconds_period_start < v_month then v_month else audio_seconds_period_start end
   where id = p_user;

  update public.profiles
     set audio_seconds_used = audio_seconds_used + greatest(0, coalesce(p_seconds, 0))
   where id = p_user
   returning audio_seconds_used into v_used;

  return coalesce(v_used, 0);
end;
$$;

grant execute on function public.record_audio_usage(uuid, integer)
  to authenticated, service_role;
