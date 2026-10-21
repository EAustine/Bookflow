-- 0024_credit_topups.sql
-- Consumable credit top-ups (AI credits + audio time). Users (free or Pro)
-- buy packs; the RevenueCat webhook grants them into persistent balances on
-- `profiles` that expire 12 months after the last purchase. Metering spends
-- the monthly allowance first, then the purchased balance.

-- 1. Persistent purchased balances (separate from the monthly counters).
alter table public.profiles
  add column if not exists ai_credits_balance integer not null default 0,
  add column if not exists ai_credits_balance_expires_at timestamptz,
  add column if not exists audio_seconds_balance integer not null default 0,
  add column if not exists audio_seconds_balance_expires_at timestamptz;

-- 2. Idempotency + audit: one row per purchase transaction. The grant RPC
--    applies credits ONLY when a new row is inserted, so a retried webhook
--    (RevenueCat redelivers) never double-credits.
create table if not exists public.credit_grants (
  transaction_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,            -- 'ai' | 'audio'
  amount integer not null,
  product_id text,
  created_at timestamptz not null default now()
);
alter table public.credit_grants enable row level security;
drop policy if exists "credit_grants_select_own" on public.credit_grants;
create policy "credit_grants_select_own" on public.credit_grants
  for select using (auth.uid() = user_id);

-- 3. Idempotent grant. Returns true only if this transaction was newly
--    applied. Resets an already-expired balance to 0 before adding, and
--    pushes the expiry to 12 months from now.
create or replace function public.grant_credits(
  p_txn text, p_user uuid, p_kind text, p_amount integer, p_product text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_amt integer := greatest(0, coalesce(p_amount, 0));
begin
  insert into public.credit_grants(transaction_id, user_id, kind, amount, product_id)
  values (p_txn, p_user, p_kind, v_amt, p_product)
  on conflict (transaction_id) do nothing;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return false;  -- already granted
  end if;

  if p_kind = 'ai' then
    update public.profiles
       set ai_credits_balance =
             (case when ai_credits_balance_expires_at is not null
                        and ai_credits_balance_expires_at < now()
                   then 0 else ai_credits_balance end) + v_amt,
           ai_credits_balance_expires_at = now() + interval '12 months'
     where id = p_user;
  elsif p_kind = 'audio' then
    update public.profiles
       set audio_seconds_balance =
             (case when audio_seconds_balance_expires_at is not null
                        and audio_seconds_balance_expires_at < now()
                   then 0 else audio_seconds_balance end) + v_amt,
           audio_seconds_balance_expires_at = now() + interval '12 months'
     where id = p_user;
  end if;
  return true;
end;
$$;
grant execute on function public.grant_credits(text, uuid, text, integer, text)
  to service_role;

-- 4. Spend monthly allowance first, then the (non-expired) purchased balance.
--    Replaces the 0021 record_ai_usage.
create or replace function public.record_ai_usage(
  p_user uuid, p_tool text, p_book uuid, p_model text,
  p_input integer, p_output integer, p_cache_read integer,
  p_cache_create integer, p_credits integer
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer; v_limit integer; v_bal integer; v_exp timestamptz;
  v_credits integer := greatest(0, coalesce(p_credits, 0));
begin
  update public.profiles
     set ai_credits_used = case when ai_credits_period_start < v_month then 0 else ai_credits_used end,
         ai_credits_period_start = case when ai_credits_period_start < v_month then v_month else ai_credits_period_start end
   where id = p_user;

  insert into public.ai_usage_events(
    user_id, tool, book_id, model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, credits
  ) values (
    p_user, p_tool, p_book, p_model,
    coalesce(p_input,0), coalesce(p_output,0), coalesce(p_cache_read,0), coalesce(p_cache_create,0), v_credits
  );

  select ai_credits_used, coalesce(ai_credits_limit, 50000),
         ai_credits_balance, ai_credits_balance_expires_at
    into v_used, v_limit, v_bal, v_exp
    from public.profiles where id = p_user;

  if v_used < v_limit then
    -- within the monthly allowance (a straddling call counts against monthly)
    update public.profiles set ai_credits_used = ai_credits_used + v_credits
     where id = p_user returning ai_credits_used into v_used;
  else
    -- monthly exhausted → spend the non-expired purchased balance
    update public.profiles
       set ai_credits_balance = greatest(0,
             (case when v_exp is not null and v_exp < now() then 0 else v_bal end) - v_credits)
     where id = p_user;
  end if;
  return v_used;
end;
$$;
grant execute on function public.record_ai_usage(
  uuid, text, uuid, text, integer, integer, integer, integer, integer
) to authenticated, service_role;

-- 5. Same monthly-then-balance spend for audio. Replaces the 0022 version.
create or replace function public.record_audio_usage(p_user uuid, p_seconds integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer; v_limit integer; v_bal integer; v_exp timestamptz;
  v_secs integer := greatest(0, coalesce(p_seconds, 0));
begin
  update public.profiles
     set audio_seconds_used = case when audio_seconds_period_start < v_month then 0 else audio_seconds_used end,
         audio_seconds_period_start = case when audio_seconds_period_start < v_month then v_month else audio_seconds_period_start end
   where id = p_user;

  select audio_seconds_used, coalesce(audio_seconds_limit, 5400),
         audio_seconds_balance, audio_seconds_balance_expires_at
    into v_used, v_limit, v_bal, v_exp
    from public.profiles where id = p_user;

  if v_used < v_limit then
    update public.profiles set audio_seconds_used = audio_seconds_used + v_secs
     where id = p_user returning audio_seconds_used into v_used;
  else
    update public.profiles
       set audio_seconds_balance = greatest(0,
             (case when v_exp is not null and v_exp < now() then 0 else v_bal end) - v_secs)
     where id = p_user;
  end if;
  return v_used;
end;
$$;
grant execute on function public.record_audio_usage(uuid, integer)
  to authenticated, service_role;
