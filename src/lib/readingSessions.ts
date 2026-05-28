import { useEffect, useRef } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Per-session reading log. One row per uninterrupted reader stretch:
 * mounted → unmounted, or page changed. Used for "Recently read",
 * streaks, and per-book time-spent stats.
 *
 * Lifecycle from the client:
 *   1. ReaderScreen mounts (or pageIndex changes) → call `startSession`.
 *      This inserts a row with `started_at = now()` and returns the id.
 *   2. ReaderScreen unmounts (or pageIndex changes) → call `endSession`.
 *      This patches `ended_at` + `duration_seconds` + `words_read` onto
 *      the open row. We compute words_read from the page's word_count
 *      and the final scroll fraction so the value is a reasonable estimate
 *      of "what was actually read".
 *
 * Best-effort throughout: a failure here never blocks reading — at worst
 * a session row is missing or has no end timestamp. The UUID check skips
 * mock book ids (non-uuid) which would otherwise fail RLS.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StartSessionArgs = {
  bookId: string;
  pageId?: string | null;
  pageIndex: number;
};

export type EndSessionArgs = {
  sessionId: string;
  startedAt: number;
  /** 0..1 fraction through the page's content at session end. */
  scrollFraction: number;
  /** Total word_count of the page, used to estimate words read. */
  pageWordCount: number | null;
};

export async function startReadingSession(args: StartSessionArgs): Promise<string | null> {
  if (!UUID_RE.test(args.bookId)) return null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('reading_sessions')
      .insert({
        user_id: user.id,
        book_id: args.bookId,
        page_id: args.pageId ?? null,
        page_index: args.pageIndex,
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[reading_sessions] start failed:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn('[reading_sessions] start threw:', err);
    return null;
  }
}

export async function endReadingSession(args: EndSessionArgs): Promise<void> {
  try {
    const endedAt = Date.now();
    const durationSeconds = Math.max(0, Math.round((endedAt - args.startedAt) / 1000));

    // Skip absurdly short sessions (<3s) — they're almost always a quick
    // back-tap or accidental open and would pollute stats.
    if (durationSeconds < 3) {
      // Still flip ended_at so the row isn't left "open" forever.
      await supabase
        .from('reading_sessions')
        .update({
          ended_at: new Date(endedAt).toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', args.sessionId);
      return;
    }

    const wordsRead =
      args.pageWordCount && args.pageWordCount > 0
        ? Math.max(0, Math.round(args.pageWordCount * args.scrollFraction))
        : null;

    const { error } = await supabase
      .from('reading_sessions')
      .update({
        ended_at: new Date(endedAt).toISOString(),
        duration_seconds: durationSeconds,
        words_read: wordsRead,
      })
      .eq('id', args.sessionId);
    if (error) console.warn('[reading_sessions] end failed:', error.message);
  } catch (err) {
    console.warn('[reading_sessions] end threw:', err);
  }
}

/**
 * React hook that opens a session on mount / when key changes, and closes
 * it on unmount / when key changes. The "key" is `(bookId, pageIndex)`
 * — change either and the previous session ends, a new one starts.
 *
 * `getProgress` is a snapshot getter (rather than a value) so the hook
 * captures the *latest* scroll fraction at unmount time, not whatever
 * fraction was current when the effect last ran. Without that, every
 * scroll change would re-open the session and we'd get one row per pixel.
 */
export function useReadingSession(args: {
  bookId: string;
  pageIndex: number;
  pageId: string | null;
  pageWordCount: number | null;
  getProgress: () => number;
}): void {
  const { bookId, pageIndex, pageId, pageWordCount, getProgress } = args;

  // Stable ref so we don't re-trigger the effect when getProgress identity
  // changes — the closure inside the effect always reads the latest fn.
  const getProgressRef = useRef(getProgress);
  useEffect(() => {
    getProgressRef.current = getProgress;
  }, [getProgress]);

  const wordCountRef = useRef(pageWordCount);
  useEffect(() => {
    wordCountRef.current = pageWordCount;
  }, [pageWordCount]);

  useEffect(() => {
    let sessionId: string | null = null;
    const startedAt = Date.now();
    let cancelled = false;

    void startReadingSession({ bookId, pageId, pageIndex }).then((id) => {
      if (cancelled) {
        // Component already unmounted before insert came back — close the
        // row immediately so it's not left dangling.
        if (id) {
          void endReadingSession({
            sessionId: id,
            startedAt,
            scrollFraction: getProgressRef.current(),
            pageWordCount: wordCountRef.current,
          });
        }
        return;
      }
      sessionId = id;
    });

    return () => {
      cancelled = true;
      if (sessionId) {
        void endReadingSession({
          sessionId,
          startedAt,
          scrollFraction: getProgressRef.current(),
          pageWordCount: wordCountRef.current,
        });
      }
    };
  }, [bookId, pageIndex, pageId]);
}
