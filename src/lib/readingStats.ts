import { useCallback, useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * First read of `reading_sessions` data: minutes-this-week, minutes-today,
 * and a current streak count. The reading screens write rows; the library
 * displays the aggregates as a small chip above the book grid.
 *
 * "Streak": consecutive days ending today (or yesterday — we tolerate
 * "haven't read yet today but read yesterday" so the streak doesn't
 * vanish at midnight before the user opens the app). A day counts if it
 * has at least one reading_session row whose duration_seconds is set.
 *
 * Implementation note: we do this client-side rather than as a Postgres
 * RPC because the data volume is tiny (one user × ~100 sessions/week tops)
 * and the math is finicky around timezone — easier to reason about with
 * the device's local clock than to bake a TZ assumption into SQL.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_LOOKBACK_DAYS = 60; // hard cap; streaks longer than this are theoretical

export type ReadingStats = {
  /** Total minutes read in the current week (Monday → today). */
  minutesThisWeek: number;
  /** Total minutes read today. */
  minutesToday: number;
  /** Days in a row, ending today or yesterday. 0 if last session is older. */
  streakDays: number;
  /** Total minutes ever recorded. Useful for empty-state copy. */
  minutesAllTime: number;
  /**
   * 7-element array, Monday → Sunday. true if the user had any
   * reading_session on that day of the current week. Used by the
   * library stats card to draw the per-day activity dots.
   */
  weekDays: boolean[];
};

const EMPTY: ReadingStats = {
  minutesThisWeek: 0,
  minutesToday: 0,
  streakDays: 0,
  minutesAllTime: 0,
  weekDays: [false, false, false, false, false, false, false],
};

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Monday 00:00 of the week containing `d` (locale-independent — we treat
 * Monday as week start, matching the most common "this week" mental model
 * for adults; switching to Sunday is one constant change). */
function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = out.getDay(); // 0 = Sun, 1 = Mon, ...
  const diff = (day + 6) % 7; // shift so Mon = 0
  out.setDate(out.getDate() - diff);
  return out;
}

export async function fetchReadingStats(): Promise<ReadingStats> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY;

  // Pull the recent slice once; do all aggregation locally. The slice is
  // bounded by STREAK_LOOKBACK_DAYS so this is always a small payload.
  const sinceIso = new Date(Date.now() - STREAK_LOOKBACK_DAYS * DAY_MS).toISOString();
  const { data, error } = await supabase
    .from('reading_sessions')
    .select('started_at, duration_seconds')
    .eq('user_id', user.id)
    .gte('started_at', sinceIso)
    .order('started_at', { ascending: false });

  if (error) {
    console.warn('[stats] fetch failed:', error.message);
    return EMPTY;
  }

  const rows = (data ?? []) as Array<{
    started_at: string;
    duration_seconds: number | null;
  }>;

  const now = new Date();
  const todayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();

  // Aggregate minutes today / this-week / all-time.
  let secsToday = 0;
  let secsWeek = 0;
  let secsAll = 0;
  // Track which absolute "day index" (days since epoch) had any reading,
  // for streak calculation. Set semantics dedupe multiple sessions on
  // the same day cheaply.
  const daysWithReading = new Set<number>();
  // Per-weekday flags for the current week (Mon=0..Sun=6) — drives the
  // activity dots in the library stats card.
  const weekDays = [false, false, false, false, false, false, false];

  for (const row of rows) {
    const dur = row.duration_seconds ?? 0;
    if (dur <= 0) continue;
    const startedMs = new Date(row.started_at).getTime();
    secsAll += dur;
    if (startedMs >= weekStart) {
      secsWeek += dur;
      // Weekday index Mon=0..Sun=6.
      const startedDate = new Date(startedMs);
      const idx = (startedDate.getDay() + 6) % 7;
      weekDays[idx] = true;
    }
    if (startedMs >= todayStart) secsToday += dur;
    const dayIndex = Math.floor(startOfDay(new Date(startedMs)).getTime() / DAY_MS);
    daysWithReading.add(dayIndex);
  }

  // Streak: walk back from today. If today has reading, streak starts here.
  // If today doesn't but yesterday does, streak starts at yesterday — gives
  // the user a grace day so the streak doesn't reset just because they
  // haven't opened the app yet today.
  const todayIndex = Math.floor(todayStart / DAY_MS);
  let cursor: number;
  if (daysWithReading.has(todayIndex)) {
    cursor = todayIndex;
  } else if (daysWithReading.has(todayIndex - 1)) {
    cursor = todayIndex - 1;
  } else {
    return {
      minutesThisWeek: Math.round(secsWeek / 60),
      minutesToday: Math.round(secsToday / 60),
      streakDays: 0,
      minutesAllTime: Math.round(secsAll / 60),
      weekDays,
    };
  }
  let streak = 0;
  while (daysWithReading.has(cursor)) {
    streak++;
    cursor--;
    if (streak > STREAK_LOOKBACK_DAYS) break;
  }

  return {
    minutesThisWeek: Math.round(secsWeek / 60),
    minutesToday: Math.round(secsToday / 60),
    streakDays: streak,
    minutesAllTime: Math.round(secsAll / 60),
    weekDays,
  };
}

// ─── This-month stats (Listen tab card) ────────────────────────────────────

/**
 * Stats shown on the Listen tab's "This month" card. Mirrors the
 * `MonthStats` shape consumed by `ListenNowPlayingScreen`. The
 * `audioRemainingMin` field stays a placeholder until we wire
 * RevenueCat entitlement metering — for now we report a fixed monthly
 * allowance so the card looks complete.
 */
export type MonthlyListenStats = {
  /** Hours listened this calendar month (one decimal). */
  listeningHours: number;
  /** "↑ from 2.8h" / "↓ from 5.1h" / undefined when no prior data. */
  listeningHoursDelta: string | undefined;
  /** Number of books the user has opened for the first time this month. */
  booksStarted: number;
  /** Number of books finished (progress ~= 100%) this month. */
  booksFinished: number;
  /** Minutes of TTS quota left in the current monthly allowance. */
  audioRemainingMin: number;
  /** Human-readable reset label, e.g. "Resets June 1". */
  audioResetLabel: string;
};

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTHLY_AUDIO_QUOTA_MIN = 90; // free-tier allowance, placeholder

/**
 * Aggregate the user's listening / book-progress data into the shape
 * the Listen tab needs. Three queries fired in parallel; client-side
 * aggregation because the volumes are small (one user × ~hundreds of
 * sessions/month at most). The "delta from last month" comparison only
 * appears once we have prior-month data — otherwise we leave it blank
 * to avoid showing "↑ from 0.0h" on first use.
 */
export async function fetchMonthlyListenStats(): Promise<MonthlyListenStats> {
  const empty: MonthlyListenStats = {
    listeningHours: 0,
    listeningHoursDelta: undefined,
    booksStarted: 0,
    booksFinished: 0,
    audioRemainingMin: MONTHLY_AUDIO_QUOTA_MIN,
    audioResetLabel: buildResetLabel(new Date()),
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Previous month bounds — we use them to compute the delta hint.
  const prevMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  );

  // Fan-out: sessions for delta comparison + this-month + books table
  // for started/finished counts. Parallel is fine — small payloads each.
  const [sessionsResult, booksResult] = await Promise.all([
    supabase
      .from('reading_sessions')
      .select('started_at, duration_seconds')
      .eq('user_id', user.id)
      .gte('started_at', prevMonthStart.toISOString())
      .lt('started_at', monthEnd.toISOString()),
    supabase
      .from('books')
      .select('id, created_at, last_read_at, last_read_page, total_pages')
      .eq('user_id', user.id)
      .gte('created_at', prevMonthStart.toISOString()),
  ]);

  if (sessionsResult.error) {
    console.warn(
      '[stats] monthly sessions fetch failed:',
      sessionsResult.error.message,
    );
    return empty;
  }

  let secsThisMonth = 0;
  let secsLastMonth = 0;
  for (const row of (sessionsResult.data ?? []) as Array<{
    started_at: string;
    duration_seconds: number | null;
  }>) {
    const dur = row.duration_seconds ?? 0;
    if (dur <= 0) continue;
    const t = new Date(row.started_at).getTime();
    if (t >= monthStart.getTime() && t < monthEnd.getTime()) {
      secsThisMonth += dur;
    } else if (t >= prevMonthStart.getTime() && t < monthStart.getTime()) {
      secsLastMonth += dur;
    }
  }

  const hoursThisMonth = Math.round((secsThisMonth / 3600) * 10) / 10;
  const hoursLastMonth = Math.round((secsLastMonth / 3600) * 10) / 10;
  // Only show the delta line when there's a prior-month baseline AND
  // the current value is non-zero — otherwise the comparison reads as
  // a "down arrow" on a fresh user, which is demotivating.
  let listeningHoursDelta: string | undefined;
  if (hoursLastMonth > 0 && hoursThisMonth > 0) {
    if (hoursThisMonth > hoursLastMonth) {
      listeningHoursDelta = `↑ from ${hoursLastMonth}h`;
    } else if (hoursThisMonth < hoursLastMonth) {
      listeningHoursDelta = `↓ from ${hoursLastMonth}h`;
    }
  }

  let booksStarted = 0;
  let booksFinished = 0;
  for (const row of (booksResult.data ?? []) as Array<{
    id: string;
    created_at: string | null;
    last_read_at: string | null;
    last_read_page: number | null;
    total_pages: number | null;
  }>) {
    const created = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (created >= monthStart.getTime() && created < monthEnd.getTime()) {
      booksStarted++;
    }
    // Finished = read past the last DB page. Finishing month is taken
    // from last_read_at, which we update on every reader page turn —
    // close enough to "finished this month" for the card without
    // needing a dedicated finished_at column.
    const lastRead = row.last_read_at
      ? new Date(row.last_read_at).getTime()
      : 0;
    const total = row.total_pages ?? 0;
    const last = row.last_read_page ?? 0;
    if (
      total > 0 &&
      last >= total - 1 &&
      lastRead >= monthStart.getTime() &&
      lastRead < monthEnd.getTime()
    ) {
      booksFinished++;
    }
  }

  return {
    listeningHours: hoursThisMonth,
    listeningHoursDelta,
    booksStarted,
    booksFinished,
    // Placeholder remaining = full allowance minus this-month listening
    // (capped at the allowance so the number is never negative).
    // Replaces with a real RC-driven number once entitlements are wired.
    audioRemainingMin: Math.max(
      0,
      Math.round(MONTHLY_AUDIO_QUOTA_MIN - secsThisMonth / 60),
    ),
    audioResetLabel: buildResetLabel(now),
  };
}

function buildResetLabel(now: Date): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `Resets ${MONTH_NAMES[next.getMonth()]} 1`;
}

/** Reactive monthly-stats hook. Refetches on mount; callers can refetch
 * manually after a long listen session if they want fresh numbers
 * without remounting. */
export function useMonthlyListenStats() {
  const [stats, setStats] = useState<MonthlyListenStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const s = await fetchMonthlyListenStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { stats, loading, refetch };
}

/**
 * Subscribe to reading stats. Refetches on mount and whenever the auth
 * user changes. The library chip uses this. Caller can call `refetch`
 * after the reader closes to pick up just-recorded session deltas, but
 * it's not strictly required — values update on next mount anyway.
 */
export function useReadingStats() {
  const [stats, setStats] = useState<ReadingStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    const s = await fetchReadingStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { stats, loading, refetch };
}
