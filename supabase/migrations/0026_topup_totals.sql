-- 0026_topup_totals.sql
-- Track the ORIGINAL purchased total per balance, so the plan card can show
-- "X used / Y left" against the total. `*_balance` (remaining) decrements as
-- the balance is spent; `*_balance_total` only grows on a grant and resets
-- alongside the balance when the 12-month window expires. used = total - left.

alter table public.profiles
  add column if not exists ai_credits_balance_total integer not null default 0,
  add column if not exists audio_seconds_balance_total integer not null default 0;

-- Backfill: for balances granted before this column existed, seed the total
-- from the current remaining (we can't reconstruct prior spend, so these read
-- as "0 used / all left" — accurate going forward).
update public.profiles
   set ai_credits_balance_total = ai_credits_balance
 where ai_credits_balance_total = 0 and ai_credits_balance > 0;
update public.profiles
   set audio_seconds_balance_total = audio_seconds_balance
 where audio_seconds_balance_total = 0 and audio_seconds_balance > 0;

-- grant_credits now also bumps the running total (resetting it on expiry, the
-- same way the balance resets). Idempotent via the credit_grants insert.
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
           ai_credits_balance_total =
             (case when ai_credits_balance_expires_at is not null
                        and ai_credits_balance_expires_at < now()
                   then 0 else ai_credits_balance_total end) + v_amt,
           ai_credits_balance_expires_at = now() + interval '12 months'
     where id = p_user;
  elsif p_kind = 'audio' then
    update public.profiles
       set audio_seconds_balance =
             (case when audio_seconds_balance_expires_at is not null
                        and audio_seconds_balance_expires_at < now()
                   then 0 else audio_seconds_balance end) + v_amt,
           audio_seconds_balance_total =
             (case when audio_seconds_balance_expires_at is not null
                        and audio_seconds_balance_expires_at < now()
                   then 0 else audio_seconds_balance_total end) + v_amt,
           audio_seconds_balance_expires_at = now() + interval '12 months'
     where id = p_user;
  end if;
  return true;
end;
$$;
grant execute on function public.grant_credits(text, uuid, text, integer, text)
  to service_role;
