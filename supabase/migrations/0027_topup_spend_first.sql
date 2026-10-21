-- 0027_topup_spend_first.sql
-- Spend the purchased top-up balance FIRST, then the monthly allowance.
-- (0024 did the opposite — monthly first, balance as overflow.) Per product
-- decision: a user's paid top-ups should be consumed before their plan's
-- monthly credits/audio.
--
-- Note the trade-off: the monthly allowance is use-it-or-lose-it (resets each
-- month), whereas top-ups last 12 months — so spending top-ups first can leave
-- some monthly allowance unused. Intentional here.

-- ── AI credits ──────────────────────────────────────────────────────────────
create or replace function public.record_ai_usage(
  p_user uuid, p_tool text, p_book uuid, p_model text,
  p_input integer, p_output integer, p_cache_read integer,
  p_cache_create integer, p_credits integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer; v_bal integer; v_exp timestamptz;
  v_credits integer := greatest(0, coalesce(p_credits, 0));
  v_from_balance integer;
begin
  -- Roll the monthly counter at the calendar-month boundary.
  update public.profiles
     set ai_credits_used = case when ai_credits_period_start < v_month then 0 else ai_credits_used end,
         ai_credits_period_start = case when ai_credits_period_start < v_month then v_month else ai_credits_period_start end
   where id = p_user;

  -- Ledger row (unchanged).
  insert into public.ai_usage_events(
    user_id, tool, book_id, model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, credits
  ) values (
    p_user, p_tool, p_book, p_model,
    coalesce(p_input,0), coalesce(p_output,0), coalesce(p_cache_read,0), coalesce(p_cache_create,0), v_credits
  );

  select ai_credits_used, ai_credits_balance, ai_credits_balance_expires_at
    into v_used, v_bal, v_exp
    from public.profiles where id = p_user;

  -- Non-expired purchased balance.
  if v_exp is null or v_exp < now() then v_bal := 0; end if;

  -- Spend the top-up balance FIRST, then the monthly allowance.
  v_from_balance := least(v_bal, v_credits);

  update public.profiles
     set ai_credits_balance = greatest(0,
           (case when ai_credits_balance_expires_at is null or ai_credits_balance_expires_at < now()
                 then 0 else ai_credits_balance end) - v_from_balance),
         ai_credits_used = ai_credits_used + (v_credits - v_from_balance)
   where id = p_user
   returning ai_credits_used into v_used;

  return v_used;
end;
$$;
grant execute on function public.record_ai_usage(
  uuid, text, uuid, text, integer, integer, integer, integer, integer
) to authenticated, service_role;

-- ── Audio seconds ───────────────────────────────────────────────────────────
create or replace function public.record_audio_usage(p_user uuid, p_seconds integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer; v_bal integer; v_exp timestamptz;
  v_secs integer := greatest(0, coalesce(p_seconds, 0));
  v_from_balance integer;
begin
  update public.profiles
     set audio_seconds_used = case when audio_seconds_period_start < v_month then 0 else audio_seconds_used end,
         audio_seconds_period_start = case when audio_seconds_period_start < v_month then v_month else audio_seconds_period_start end
   where id = p_user;

  select audio_seconds_used, audio_seconds_balance, audio_seconds_balance_expires_at
    into v_used, v_bal, v_exp
    from public.profiles where id = p_user;

  if v_exp is null or v_exp < now() then v_bal := 0; end if;

  v_from_balance := least(v_bal, v_secs);

  update public.profiles
     set audio_seconds_balance = greatest(0,
           (case when audio_seconds_balance_expires_at is null or audio_seconds_balance_expires_at < now()
                 then 0 else audio_seconds_balance end) - v_from_balance),
         audio_seconds_used = audio_seconds_used + (v_secs - v_from_balance)
   where id = p_user
   returning audio_seconds_used into v_used;

  return v_used;
end;
$$;
grant execute on function public.record_audio_usage(uuid, integer)
  to authenticated, service_role;
