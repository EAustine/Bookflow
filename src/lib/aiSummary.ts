import { useCallback, useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Client-side summary fetch.
 *
 * Talks to the `generate-summary` edge function. The function handles
 * Anthropic key management, prompt construction, and caching to the
 * `summaries` table — the client just sees `{ summary, length, cached }`
 * or an error envelope. Cached responses come back from the same
 * Postgres row so a re-tap on the same length is essentially free.
 *
 * On top of the server cache, we keep a small in-memory cache so that
 * returning to a previously-viewed summary renders instantly with no
 * loading flash. The server cache still backs everything (and survives
 * app restarts); this layer is purely about cutting the round-trip on
 * intra-session navigation. The cache is invalidated when the user
 * taps "Submit & regenerate", which forces a fresh generation.
 */

// ─── In-memory cache ─────────────────────────────────────────────────────────

type CacheKey = string;
const memoryCache = new Map<CacheKey, GenerateSummarySuccess>();

function cacheKey(args: GenerateSummaryArgs): CacheKey {
  if (args.pageIndices) {
    const sorted = [...args.pageIndices].sort((a, b) => a - b).join(',');
    return `${args.bookId}|m:${sorted}|${args.length}`;
  }
  return `${args.bookId}|s:${args.pageIndex}|${args.length}`;
}

/** Synchronous peek — used by `useSummary` to hydrate state before
 *  the network request resolves. Returns null on cache miss. */
export function peekCachedSummary(
  args: GenerateSummaryArgs,
): GenerateSummarySuccess | null {
  return memoryCache.get(cacheKey(args)) ?? null;
}

/** Wipe the in-memory cache entry for a specific request. Called by
 *  `useSummary` on regenerate so the next fetch ignores the memo. */
function evictCachedSummary(args: GenerateSummaryArgs): void {
  memoryCache.delete(cacheKey(args));
}

export type SummaryLength = 'tldr' | 'standard' | 'detailed';

export type GenerateSummarySuccess = {
  summary: string;
  length: SummaryLength;
  cached: boolean;
  pageIndex: number;
};

export type GenerateSummaryFailure = {
  error: string;
  /** Optional human-readable detail (e.g. the raw LLM error message). */
  message?: string;
};

export type GenerateSummaryResult =
  | { ok: true; data: GenerateSummarySuccess }
  | { ok: false; error: GenerateSummaryFailure };

export type GenerateSummaryArgs = {
  bookId: string;
  length: SummaryLength;
  /**
   * If true, the edge function bypasses its `summaries` cache and
   * regenerates the summary from scratch, then replaces the cached
   * row. Wired into the "Submit & regenerate" affordance on the
   * quality-rating card so the user gets a fresh take when they flag
   * the previous output as bad.
   */
  force?: boolean;
} & (
  | { pageIndex: number; pageIndices?: undefined }
  | { pageIndex?: undefined; pageIndices: number[] }
);

export async function generateSummary(
  args: GenerateSummaryArgs,
): Promise<GenerateSummaryResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-summary', {
      body: {
        book_id: args.bookId,
        ...(args.pageIndices
          ? { page_indices: args.pageIndices }
          : { page_index: args.pageIndex }),
        length: args.length,
        ...(args.force ? { force: true } : {}),
      },
    });

    if (error) {
      // supabase-js v2's FunctionsHttpError.context is a Response, not
      // a parsed body. Pull text() and try JSON.parse so the function's
      // structured error envelope (e.g. server_misconfigured + message)
      // reaches the UI instead of the generic "non-2xx" message.
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          const body = await (ctx as Response).text();
          if (body) {
            try {
              const parsed = JSON.parse(body) as GenerateSummaryFailure;
              if (parsed && typeof parsed.error === 'string') {
                return { ok: false, error: parsed };
              }
            } catch {
              // Not JSON — surface the raw body so we still see *something*.
              return {
                ok: false,
                error: { error: 'function_failed', message: body.slice(0, 280) },
              };
            }
          }
        } catch {
          // text() threw (already consumed?) — fall through
        }
      }
      return { ok: false, error: { error: 'function_failed', message: error.message } };
    }

    if (!data?.summary) {
      return {
        ok: false,
        error: { error: data?.error ?? 'unknown_response', message: data?.message },
      };
    }

    return {
      ok: true,
      data: {
        summary: data.summary as string,
        length: data.length as SummaryLength,
        cached: !!data.cached,
        pageIndex: data.page_index as number,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        error: 'request_failed',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export type UseSummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; summary: string; cached: boolean }
  | { status: 'error'; errorCode: string; errorMessage: string | null };

export type UseSummaryReturn = UseSummaryState & {
  /**
   * Force-regenerate the current summary. Evicts the in-memory cache,
   * passes `force: true` to the edge function (which also evicts the
   * server-side `summaries` row), then refetches. The hook returns to
   * `loading` while the call is in flight.
   */
  refresh: () => void;
};

/**
 * Hook that drives the SummaryScreen state machine. Refetches whenever
 * any of (bookId, pageIndex, length) changes, and aborts the stale
 * promise so a fast length-toggle doesn't race two responses into the
 * UI in the wrong order.
 *
 * `enabled` lets the caller defer the fetch (e.g. while a sheet is
 * still mounting) — flipping it to true triggers the load.
 *
 * On mount the hook peeks the in-memory cache and renders instantly
 * if a previous fetch (this session) already produced the same
 * summary — no loading flash on return navigation. Cache miss falls
 * through to a normal fetch.
 */
export type UseSummaryArgs = {
  bookId: string;
  length: SummaryLength;
  enabled?: boolean;
} & (
  | { pageIndex: number; pageIndices?: undefined }
  | { pageIndex?: undefined; pageIndices: number[] }
);

export function useSummary(args: UseSummaryArgs): UseSummaryReturn {
  const { bookId, length, enabled = true } = args;
  // Stable string key for the useEffect dep so we re-run on any
  // change to the requested page set without forcing the caller to
  // memoise the indices array. Sorted before stringifying so [3,1,2]
  // and [1,2,3] hit the same key.
  const indicesKey = args.pageIndices
    ? `m:${[...args.pageIndices].sort((a, b) => a - b).join(',')}`
    : `s:${args.pageIndex}`;

  // Bumping this counter is how `refresh()` triggers a forced
  // refetch — adding it to the effect deps re-runs the load.
  const [refreshTick, setRefreshTick] = useState(0);

  // Lazily hydrate from the in-memory cache so the first render of a
  // previously-fetched summary doesn't flash a skeleton. We can't read
  // `args` lazily across re-renders so the effect below also handles
  // the cache-hit path for arg changes mid-mount.
  const [state, setState] = useState<UseSummaryState>(() => {
    if (!enabled) return { status: 'idle' };
    const fetchArgs: GenerateSummaryArgs = args.pageIndices
      ? { bookId, pageIndices: args.pageIndices, length }
      : { bookId, pageIndex: args.pageIndex as number, length };
    const cached = peekCachedSummary(fetchArgs);
    return cached
      ? { status: 'success', summary: cached.summary, cached: true }
      : { status: 'idle' };
  });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    const fetchArgs: GenerateSummaryArgs = args.pageIndices
      ? { bookId, pageIndices: args.pageIndices, length }
      : { bookId, pageIndex: args.pageIndex as number, length };

    // Hit the in-memory cache when this is a normal navigation (no
    // force-refresh in flight). Skip the network entirely — the
    // cached summary IS the same row the server would return, so
    // there's nothing to refresh.
    if (refreshTick === 0) {
      const cached = peekCachedSummary(fetchArgs);
      if (cached) {
        setState({
          status: 'success',
          summary: cached.summary,
          cached: true,
        });
        return;
      }
    }

    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      // Forced refresh: bypass both client and server caches.
      const useForce = refreshTick > 0;
      if (useForce) evictCachedSummary(fetchArgs);
      const result = await generateSummary(
        useForce ? { ...fetchArgs, force: true } : fetchArgs,
      );
      if (cancelled) return;
      if (result.ok) {
        // Persist to the in-memory cache so a re-mount renders
        // instantly without another round-trip.
        memoryCache.set(cacheKey(fetchArgs), result.data);
        setState({
          status: 'success',
          summary: result.data.summary,
          cached: result.data.cached,
        });
      } else {
        setState({
          status: 'error',
          errorCode: result.error.error,
          errorMessage: result.error.message ?? null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // indicesKey covers both single-page and multi-page changes.
    // refreshTick triggers a forced refetch via the regenerate button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, indicesKey, length, enabled, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  return { ...state, refresh };
}
