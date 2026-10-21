-- 0021_ai_credit_metering.sql
-- Real AI-credit metering. The schema already shipped orphaned counter
-- columns on `profiles` (ai_credits_used / ai_credits_limit) that nothing
-- ever wrote. This migration makes them real: a per-user monthly counter
-- plus an append-only usage ledger, both written server-side by the AI edge
-- functions via the record_ai_usage() RPC. Cache hits cost nothing and never
-- reach the RPC.

-- 1. Monthly reset anchor. Reuse the existing ai_credits_used (running total
--    for the current period) and ai_credits_limit columns.
alter table public.profiles
  add column if not exists ai_credits_period_start timestamptz not null
    default date_trunc('month', now());

-- 2. Append-only ledger — audit trail of AI spend + per-tool analytics.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool text not null,                       -- 'summary' | 'chat' | 'practice' | 'translation'
  book_id uuid references public.books(id) on delete set null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  credits integer not null default 0,       -- billed amount (weighted tokens)
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.ai_usage_events enable row level security;

-- Owners may read their own usage. Inserts happen ONLY through the
-- SECURITY DEFINER RPC below (service role), never directly from a client.
drop policy if exists "ai_usage_events_select_own" on public.ai_usage_events;
create policy "ai_usage_events_select_own"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

-- 3. Atomic record + monthly-roll. Rolls the period when the stored
--    period_start predates the current calendar month (UTC — the DB runs in
--    UTC, so this is a stable boundary unlike a device-local computation),
--    appends the ledger row, increments the running counter, and returns the
--    new total. SECURITY DEFINER so edge functions (service role) can write
--    the counter through RLS.
create or replace function public.record_ai_usage(
  p_user uuid,
  p_tool text,
  p_book uuid,
  p_model text,
  p_input integer,
  p_output integer,
  p_cache_read integer,
  p_cache_create integer,
  p_credits integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month timestamptz := date_trunc('month', now());
  v_used integer;
begin
  -- Roll the period into the current month if it's stale.
  update public.profiles
     set ai_credits_used = case
           when ai_credits_period_start < v_month then 0 else ai_credits_used end,
         ai_credits_period_start = case
           when ai_credits_period_start < v_month then v_month else ai_credits_period_start end
   where id = p_user;

  insert into public.ai_usage_events (
    user_id, tool, book_id, model,
    input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, credits
  ) values (
    p_user, p_tool, p_book, p_model,
    coalesce(p_input, 0), coalesce(p_output, 0),
    coalesce(p_cache_read, 0), coalesce(p_cache_create, 0), coalesce(p_credits, 0)
  );

  update public.profiles
     set ai_credits_used = ai_credits_used + coalesce(p_credits, 0)
   where id = p_user
   returning ai_credits_used into v_used;

  return coalesce(v_used, 0);
end;
$$;

grant execute on function public.record_ai_usage(
  uuid, text, uuid, text, integer, integer, integer, integer, integer
) to authenticated, service_role;
