import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '~/lib/supabase';
import { FREE_PLAN_LIMITS } from '~/lib/freePlanUsage';
import { presentPaywall, ENTITLEMENT_PRO } from '~/lib/revenuecat';

/**
 * Monthly AI-credit usage, read from the server-maintained counter on
 * `profiles` (written by the AI edge functions via the record_ai_usage RPC).
 *
 * The counter is rolled server-side at the calendar-month boundary (UTC). On
 * the read side we additionally treat a stale period (period_start in a prior
 * month) as 0 used, so the meter shows "0" at the start of a new month even
 * before the user's first AI call of the month triggers the server-side roll.
 */

/** Pro plan AI-credit cap — matches App.tsx planLimits + the paywall copy. */
export const PRO_AI_CREDITS = 500_000;

/** The monthly AI-credit ceiling for the user's plan. */
export function aiCreditLimit(isPro: boolean): number {
  return isPro ? PRO_AI_CREDITS : FREE_PLAN_LIMITS.aiCreditsPerMonth;
}

function sameMonthUTC(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth()
  );
}

/** "Resets July 1" — first of next calendar month (local label, matches the
 * listen-stats reset copy). */
export function aiCreditsResetLabel(now: Date = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `Resets ${next.toLocaleString('en-US', { month: 'long' })} 1`;
}

export function useMonthlyAiUsage(): {
  used: number;
  resetLabel: string;
  refresh: () => void;
} {
  const [used, setUsed] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Local session read (no network) for the uid.
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('ai_credits_used, ai_credits_period_start')
          .eq('id', uid)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const now = new Date();
        const periodStart = (data as { ai_credits_period_start?: string | null })
          .ai_credits_period_start ?? null;
        const rawUsed =
          (data as { ai_credits_used?: number | null }).ai_credits_used ?? 0;
        const effective = sameMonthUTC(periodStart, now) ? rawUsed : 0;
        setUsed(Math.max(0, effective));
      } catch {
        // Offline, or the column doesn't exist yet (pre-migration) — keep 0.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Refresh when the app returns to the foreground (the user may have spent
  // credits, backgrounded, and come back to the You/Account meter).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { used, resetLabel: aiCreditsResetLabel(), refresh };
}

/** Shared message for monthly AI-credit exhaustion. */
export const CREDIT_LIMIT_MESSAGE =
  "You've used all your AI credits this month. Upgrade for more.";

/** True when an AI edge function rejected the request for hitting the cap. */
export function isCreditLimitError(code: string | null | undefined): boolean {
  return code === 'credit_limit_reached';
}

/** Pop the upgrade paywall in response to a credit-limit rejection. */
export function presentCreditLimitPaywall(): void {
  void presentPaywall({ requiredEntitlement: ENTITLEMENT_PRO }).catch(() => {});
}

/**
 * Monthly audio GENERATION usage (minutes) from the server-maintained counter
 * on `profiles.audio_seconds_used`, written by the generate-audio edge
 * function only when it generates NEW narration (a true cache miss) — cached
 * + dedup + downloaded playback is free and not counted. Mirrors
 * `useMonthlyAiUsage`, and is the source of truth shared by the meter and the
 * server's hard generation cap. Period-aware: a counter from a prior month
 * reads as 0 until the next generation rolls it server-side.
 */
export function useMonthlyAudioUsage(): {
  usedMinutes: number;
  refresh: () => void;
} {
  const [usedSeconds, setUsedSeconds] = useState(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('audio_seconds_used, audio_seconds_period_start')
          .eq('id', uid)
          .maybeSingle();
        if (cancelled || error || !data) return;
        const now = new Date();
        const ps =
          (data as { audio_seconds_period_start?: string | null })
            .audio_seconds_period_start ?? null;
        const raw =
          (data as { audio_seconds_used?: number | null }).audio_seconds_used ??
          0;
        const eff = sameMonthUTC(ps, now) ? raw : 0;
        setUsedSeconds(Math.max(0, eff));
      } catch {
        // Offline, or the column doesn't exist yet (pre-migration) — keep 0.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { usedMinutes: Math.round(usedSeconds / 60), refresh };
}

/** "Expires Jun 2027" — month + year of a balance's expiry, or null. */
function expiryLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Expires ${d.toLocaleString('en-US', { month: 'short', year: 'numeric' })}`;
}

/** One purchased top-up balance, in display units (minutes for audio, credits
 * for AI). All zero + null when there's no live (non-expired) balance. */
export type TopupLine = {
  /** Original purchased total. */
  total: number;
  /** Consumed so far (total − left). */
  used: number;
  /** Remaining. */
  left: number;
  /** "Expires Jun 2027", or null when no live balance. */
  expiresLabel: string | null;
};

export type PurchasedBalances = {
  audio: TopupLine; // minutes
  ai: TopupLine; // credits
  refresh: () => void;
};

const EMPTY_LINE: TopupLine = { total: 0, used: 0, left: 0, expiresLabel: null };

/** Build a display line from the raw balance/total/expiry, in `divisor` units
 * (60 = seconds→minutes, 1 = credits). Expired → empty. */
function buildTopupLine(
  balance: number | null | undefined,
  total: number | null | undefined,
  expIso: string | null,
  nowMs: number,
  divisor: number,
): TopupLine {
  if (!expIso || new Date(expIso).getTime() <= nowMs) return EMPTY_LINE;
  const left = Math.max(0, Math.round((balance ?? 0) / divisor));
  // Guard total ≥ left (backfilled/old rows may have total < remaining).
  const totalUnits = Math.max(left, Math.round((total ?? 0) / divisor));
  return {
    total: totalUnits,
    used: Math.max(0, totalUnits - left),
    left,
    expiresLabel: expiryLabel(expIso),
  };
}

type RawBalances = {
  aiBal: number;
  aiTotal: number;
  aiExp: string | null;
  audioBal: number;
  audioTotal: number;
  audioExp: string | null;
};

const EMPTY_RAW: RawBalances = {
  aiBal: 0,
  aiTotal: 0,
  aiExp: null,
  audioBal: 0,
  audioTotal: 0,
  audioExp: null,
};

/**
 * Purchased top-up balances on `profiles` (granted by the RevenueCat webhook
 * → grant_credits). SEPARATE from the monthly allowance meters: they persist
 * across months, expire 12 months after purchase, and are spent only after the
 * monthly allowance runs out. Returns a per-kind {total, used, left, expires}
 * line so the plan card can show a usage bar. Expiry-aware — an expired balance
 * reads as empty, mirroring the server. Refreshes on mount + app-foreground.
 */
export function usePurchasedBalances(): PurchasedBalances {
  const [raw, setRaw] = useState<RawBalances>(EMPTY_RAW);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const uid = sessionData?.session?.user?.id;
        if (!uid) return;
        // Try the full select (with the 0026 *_total columns). Cast through
        // unknown: those columns aren't in the generated DB types until
        // regenerated — the runtime select returns them regardless.
        let res = await supabase
          .from('profiles')
          .select(
            'ai_credits_balance, ai_credits_balance_total, ai_credits_balance_expires_at, audio_seconds_balance, audio_seconds_balance_total, audio_seconds_balance_expires_at',
          )
          .eq('id', uid)
          .maybeSingle();
        const has0026 = !res.error;
        // Pre-0026 fallback: the *_total columns don't exist yet, which makes
        // the whole select fail. Re-read the core balance (since 0024) so the
        // balance still shows — treating total = remaining (0 used). Without
        // this, a granted balance would read as 0 and show the empty state.
        if (res.error) {
          res = await supabase
            .from('profiles')
            .select(
              'ai_credits_balance, ai_credits_balance_expires_at, audio_seconds_balance, audio_seconds_balance_expires_at',
            )
            .eq('id', uid)
            .maybeSingle();
        }
        if (cancelled || res.error || !res.data) return;
        const d = res.data as unknown as {
          ai_credits_balance?: number | null;
          ai_credits_balance_total?: number | null;
          ai_credits_balance_expires_at?: string | null;
          audio_seconds_balance?: number | null;
          audio_seconds_balance_total?: number | null;
          audio_seconds_balance_expires_at?: string | null;
        };
        const aiBal = d.ai_credits_balance ?? 0;
        const audioBal = d.audio_seconds_balance ?? 0;
        setRaw({
          aiBal,
          aiTotal: has0026 ? (d.ai_credits_balance_total ?? aiBal) : aiBal,
          aiExp: d.ai_credits_balance_expires_at ?? null,
          audioBal,
          audioTotal: has0026 ? (d.audio_seconds_balance_total ?? audioBal) : audioBal,
          audioExp: d.audio_seconds_balance_expires_at ?? null,
        });
      } catch {
        // Offline — keep last values.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const now = Date.now();
  return {
    audio: buildTopupLine(raw.audioBal, raw.audioTotal, raw.audioExp, now, 60),
    ai: buildTopupLine(raw.aiBal, raw.aiTotal, raw.aiExp, now, 1),
    refresh,
  };
}

/**
 * Re-read a balance a few times over ~20s after a successful purchase. Credits
 * are granted server-side by the RevenueCat webhook a few seconds AFTER the
 * purchase resolves, so a single immediate refresh would miss them. Safe to
 * call anywhere — `refresh` just triggers a DB re-read.
 */
export function pollBalanceAfterPurchase(refresh: () => void): void {
  [1500, 4000, 8000, 13000, 20000].forEach((ms) => setTimeout(refresh, ms));
}
