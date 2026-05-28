import { useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Reader-side data hooks for pages (the unit since the chapters→pages
 * migration). One DB row per ~200-word slice; PDFs additionally carry the
 * source pdf_page_number, EPUBs only carry the spine-derived index.
 *
 * The Library screen still mixes real (uploaded) books with the legacy mock
 * fixtures in `mockBooks.ts`. Mock books have non-uuid ids like `"1"` so any
 * `eq('book_id', ...)` query against Supabase will return zero rows. The
 * hooks below treat that as "no real data, render fallback" rather than as
 * an error — letting the design previews keep working until we swap the
 * library to a real query.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PageRow = {
  id: string;
  book_id: string;
  page_index: number;
  pdf_page_number: number | null;
  title: string | null;
  content: string | null;
  html_content: string | null;
  word_count: number | null;
};

export type PageListItem = {
  id: string;
  page_index: number;
  pdf_page_number: number | null;
  title: string | null;
  word_count: number | null;
};

/**
 * Fetch the page list for a book (no `content`, to keep payload tiny —
 * a 400-page book otherwise pulls the entire text into the client just
 * to render the page picker). Returns an empty array for mock books.
 *
 * Used by ChapterSheet when it needs to render the real list of pages
 * from Supabase rather than the legacy mock fallback.
 */
export function usePageList(bookId: string) {
  const [pages, setPages] = useState<PageListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (!UUID_RE.test(bookId)) {
      setPages([]);
      setLoading(false);
      return;
    }

    (async () => {
      // Same row-cap bypass as useAllPagesContent below — without
      // .range(), PostgREST silently truncates large lists at 1000.
      // Multi-volume books that have more pages than that would
      // otherwise miss everything past page 999 in the FlatList
      // data array, which broke the saved-page restore and any
      // jump-to-page above 999.
      //
      // try/catch — the supabase call throws on offline with
      // "TypeError: Network request failed" and the effect IIFE
      // had no parent .catch. The rejection bubbled to LogBox and
      // surfaced as a dev-mode red toast on the Reader screen on
      // every offline open. In-band null/empty is the right
      // recovery: the reader skeleton handles the empty case.
      try {
        const { data, error } = await supabase
          .from('pages')
          .select('id, page_index, pdf_page_number, title, word_count')
          .eq('book_id', bookId)
          .order('page_index', { ascending: true })
          .range(0, 9999);

        if (cancelled) return;
        if (error) {
          console.warn('[usePageList] fetch failed:', error.message);
          setPages([]);
        } else {
          setPages((data ?? []) as PageListItem[]);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[usePageList] fetch threw:', err);
        setPages([]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  return { pages, loading };
}

/**
 * Fetch a single page by (book_id, page_index). `data` is null while
 * loading. `notFound=true` means the query succeeded but no row exists —
 * usually a mock book or a freshly-created upload that hasn't been
 * processed yet.
 */
export function usePage(bookId: string, pageIndex: number) {
  const [data, setData] = useState<PageRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setData(null);

    if (!UUID_RE.test(bookId)) {
      // Mock book — skip the round-trip, signal "no real data".
      setLoading(false);
      setNotFound(true);
      return;
    }

    (async () => {
      // try/catch — see usePageList above for the LogBox-quiet
      // rationale. Offline lands in the error branch with a
      // friendly-ish message that the caller can decide whether
      // to surface (currently it's just `error` state — most
      // callers fall through to the skeleton or notFound state).
      try {
        const { data: row, error: queryError } = await supabase
          .from('pages')
          .select(
            'id, book_id, page_index, pdf_page_number, title, content, html_content, word_count',
          )
          .eq('book_id', bookId)
          .eq('page_index', pageIndex)
          .maybeSingle();

        if (cancelled) return;

        if (queryError) {
          setError(queryError.message);
        } else if (!row) {
          setNotFound(true);
        } else {
          setData(row as PageRow);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[usePage] fetch threw:', err);
        setError(err instanceof Error ? err.message : String(err));
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, pageIndex]);

  return { data, loading, notFound, error };
}

/**
 * Fetch every page of a book in one query — used by the continuous-
 * scroll reader. We pull `content` here (unlike `usePageList`) so the
 * reader can render all pages stacked without triggering per-page
 * loading states as the user scrolls past divider boundaries.
 *
 * Payload size guard: a 1000-word-per-section book has ~200 sections at
 * 200 words each = 40KB of content. A very large book (3MB+ EPUB) could
 * push 1MB. Still fine to load once; we keep it client-resident for the
 * reader's lifetime so subsequent scrolls don't re-fetch.
 *
 * Returns rows ordered by page_index ascending so the reader can render
 * directly without sorting at the call site.
 */
export function useAllPagesContent(bookId: string) {
  const [pages, setPages] = useState<PageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Network-timeout guard. Without this, a flaky connection (or a
    // Supabase outage) would leave the reader skeleton spinning
    // indefinitely — pages stay empty, loading stays true, the user
    // is staring at an opaque overlay with no recourse. 15 s is the
    // 95th-percentile good-network ceiling for this query on a 1500-
    // page book; anything beyond that is almost certainly a stalled
    // connection. We abort the in-flight request and surface a
    // dedicated error code the reader can branch on (retry button,
    // "you're offline" copy, etc) instead of an opaque hang.
    //
    // Abort cooperates with Supabase JS: `.abortSignal()` wires the
    // controller into the underlying `fetch` so an abort genuinely
    // cancels the request rather than just discarding the response.
    const abortController = new AbortController();
    const TIMEOUT_MS = 15_000;
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, TIMEOUT_MS);
    setLoading(true);
    setError(null);

    if (!UUID_RE.test(bookId)) {
      clearTimeout(timeoutId);
      setPages([]);
      setLoading(false);
      return;
    }

    (async () => {
      // PostgREST has a default cap on rows returned (commonly 1000).
      // A multi-volume book like "Expositions of Holy Scripture" has
      // 1570 spine rows in `pages`, and the default cap silently
      // dropped everything past 1000 — visible pages near the end of
      // the book then rendered as empty sections, and any sort-by-
      // anything-other-than-page_index could push the user's saved
      // page into the dropped tail too. An explicit large `.range`
      // pulls the full set in one round-trip.
      //
      // 9999 is plenty for any realistic book (the largest classics
      // we've seen are 4-5k pages), and Supabase happily returns
      // fewer rows when there aren't that many.
      try {
        const { data, error: queryError } = await supabase
          .from('pages')
          .select(
            'id, book_id, page_index, pdf_page_number, title, content, html_content, word_count',
          )
          .eq('book_id', bookId)
          .order('page_index', { ascending: true })
          .range(0, 9999)
          .abortSignal(abortController.signal);

        if (cancelled) return;
        clearTimeout(timeoutId);
        if (queryError) {
          // Supabase surfaces the abort either as a thrown error
          // (caught below) or a `queryError` whose message mentions
          // "abort". Translate to our timeout sentinel so the reader
          // UI shows the right empty state rather than a raw
          // Postgres-error string.
          const looksAborted =
            /abort/i.test(queryError.message ?? '') ||
            abortController.signal.aborted;
          setError(looksAborted ? 'request_timeout' : queryError.message);
          setPages([]);
        } else {
          setPages((data ?? []) as PageRow[]);
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        clearTimeout(timeoutId);
        const isAbort =
          abortController.signal.aborted ||
          (err instanceof Error &&
            (err.name === 'AbortError' || /abort/i.test(err.message)));
        setError(
          isAbort
            ? 'request_timeout'
            : err instanceof Error
            ? err.message
            : String(err),
        );
        setPages([]);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      // Cancel any in-flight request when the effect tears down —
      // book change, screen unmount, etc. Without this the network
      // call keeps running until the server responds, just to have
      // its result thrown away.
      abortController.abort();
    };
  }, [bookId]);

  return { pages, loading, error };
}

/**
 * Persist the user's reading position. Best-effort — failures are
 * logged but never propagate, since stale progress is strictly better
 * than surfacing a network error mid-read.
 */
export async function persistReadingPosition(args: {
  bookId: string;
  /** 0-based page index. */
  pageIndex: number;
  /** 0..1 fraction through the current page. */
  position?: number;
}) {
  if (!UUID_RE.test(args.bookId)) return;
  try {
    // Resolve the current user so we can scope the update to their
    // own book row. RLS already filters this, but a defense-in-depth
    // user_id check stops the update from ever landing on a
    // foreign book even if a misconfigured client / service-role
    // path slipped through.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      // Not signed in — nothing meaningful to persist against.
      return;
    }
    const positionInt = Math.max(
      0,
      Math.min(100, Math.round((args.position ?? 0) * 100)),
    );
    const { error } = await supabase
      .from('books')
      .update({
        last_read_page: args.pageIndex,
        last_read_position: positionInt,
        last_read_at: new Date().toISOString(),
      })
      .eq('id', args.bookId)
      .eq('user_id', userId);
    if (error) console.warn('[reader] persist position failed:', error.message);
  } catch (err) {
    console.warn('[reader] persist position threw:', err);
  }
}

/**
 * Bump `last_read_at` only — for surfaces that DON'T have a
 * reliable page index to write (e.g. EPUB Full WebView, where we
 * don't have scroll-position bridging yet). Updates the
 * "recently opened" signal without overwriting the user's
 * actual `last_read_page`.
 *
 * Use this anywhere you want to mark the book as "just touched"
 * without claiming you know which page they're on. The previous
 * shape called persistReadingPosition with `pageIndex: 0`, which
 * silently destroyed the saved page each time the user opened
 * the book in Full mode.
 */
export async function touchLastReadAt(bookId: string) {
  if (!UUID_RE.test(bookId)) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    const { error } = await supabase
      .from('books')
      .update({ last_read_at: new Date().toISOString() })
      .eq('id', bookId)
      .eq('user_id', userId);
    if (error) console.warn('[reader] touchLastReadAt failed:', error.message);
  } catch (err) {
    console.warn('[reader] touchLastReadAt threw:', err);
  }
}
