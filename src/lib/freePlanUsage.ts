/**
 * freePlanUsage.ts — single source of truth for "is the free user
 * over their limit?" questions.
 *
 * Each meter (books / audio / AI) shapes into `{ used, total,
 * percent, isApproaching, isExceeded }` so call sites can render
 * progress bars OR make gate decisions ("don't let them upload book
 * 6 on the Free tier") with one consistent shape.
 *
 * What "used" means per meter:
 *   - **books**: total books in the user's library, from useBooks().
 *     Lifetime count, not per-month — matches the meter label "Books
 *     · X / 5" on YouScreen / AccountScreen and the design intent
 *     that free users build a small library rather than churn through
 *     unlimited per-month imports.
 *   - **audio**: listening minutes this calendar month, from the
 *     same monthStats source that drives the meter UI.
 *   - **ai**: AI credits used this month. Wire to a real tracker
 *     when we add per-tool metering — for now reports 0 so meters
 *     don't render misleading state.
 *
 * Pro users bypass the meters entirely: `useFreePlanUsage()` returns
 * `isLimited: false` and `isExceeded: false` for every meter so
 * gating code can just call `if (usage.books.isExceeded)` without
 * special-casing Pro at every site.
 */

import { useMemo } from 'react';
import { useBooks } from '~/hooks/useBooks';
import { useIsPro } from '~/lib/revenuecat';

/** Free-tier caps. Mirrors the constant in App.tsx — kept duplicated
 * for now so this module doesn't depend on App.tsx (which would be a
 * cycle); the App.tsx copy will drop to a re-export once the YouScreen
 * meter wiring is migrated to read from here too. */
export const FREE_PLAN_LIMITS = {
  audioMinutesPerMonth: 90,
  aiCreditsPerMonth: 50_000,
  booksTotal: 5,
} as const;

/** A single meter's state. */
export type MeterState = {
  used: number;
  total: number;
  /** 0..1 — convenience for progress bars. Caps at 1.05 so an over-
   * limit bar can render slightly over for visual urgency. */
  percent: number;
  /** True at >=80% of total (the threshold the design uses to flip
   * meter colour from forest-green to amber). */
  isApproaching: boolean;
  /** True at >=100% of total. Pro users always return false. */
  isExceeded: boolean;
  /** True when the meter is actually being enforced. Pro users see
   * `isLimited: false` everywhere so gates can short-circuit. */
  isLimited: boolean;
};

export type FreePlanUsage = {
  books: MeterState;
  audio: MeterState;
  ai: MeterState;
  /** True when the user is on the Free tier and any meter is over
   * limit. Handy for "Upgrade to Pro" banners. */
  isAnyExceeded: boolean;
};

/**
 * Hook — returns per-meter usage state. Reactive to entitlement
 * changes (via useIsPro) and to library size (via useBooks). Audio
 * usage isn't included here because that data lives in
 * `useMonthlyListenStats`; sites that need audio gating should call
 * `meterFor(audioUsedMinutes, FREE_PLAN_LIMITS.audioMinutesPerMonth, isPro)`
 * directly (see the helper at the bottom of this file).
 */
export function useFreePlanUsage(): FreePlanUsage {
  const { isPro } = useIsPro();
  const { books } = useBooks();

  return useMemo(() => {
    const booksMeter = meterFor(
      books.length,
      FREE_PLAN_LIMITS.booksTotal,
      isPro,
    );
    // Audio + AI need data we don't have at this layer — caller
    // computes those if/when they need them. Defaults reasonable for
    // YouScreen which receives audio.used as a prop.
    const audioMeter = meterFor(
      0,
      FREE_PLAN_LIMITS.audioMinutesPerMonth,
      isPro,
    );
    const aiMeter = meterFor(
      0,
      FREE_PLAN_LIMITS.aiCreditsPerMonth,
      isPro,
    );
    return {
      books: booksMeter,
      audio: audioMeter,
      ai: aiMeter,
      isAnyExceeded:
        booksMeter.isExceeded ||
        audioMeter.isExceeded ||
        aiMeter.isExceeded,
    };
  }, [isPro, books.length]);
}

/**
 * Stateless helper — compute a meter state from raw used/total
 * numbers. Useful for surfaces that already have the count in hand
 * (e.g. YouScreen has monthStats.listeningHours and doesn't need
 * the hook for audio). Pro users always get isLimited/isExceeded
 * false so the UI can skip the meter entirely.
 */
export function meterFor(
  used: number,
  total: number,
  isPro: boolean,
): MeterState {
  if (isPro) {
    return {
      used,
      total,
      percent: 0,
      isApproaching: false,
      isExceeded: false,
      isLimited: false,
    };
  }
  const pct = total > 0 ? Math.min(1.05, used / total) : 0;
  return {
    used,
    total,
    percent: pct,
    isApproaching: pct >= 0.8,
    isExceeded: pct >= 1,
    isLimited: true,
  };
}
