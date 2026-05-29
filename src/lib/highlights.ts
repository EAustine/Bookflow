import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '~/lib/supabase';

// AsyncStorage-backed highlight cache.
//
// useBookHighlights does a network refetch on mount. On a healthy
// connection that lands in ~200 ms — but the user opens the book,
// looks for their saved highlight, and if it isn't visible by the
// time their eye reaches the page they read it as "the highlight
// got lost". On a flaky or offline connection it stays missing for
// much longer. Caching the last-known set per book gives us
// instant-paint on every reopen + a graceful offline fallback.
const HIGHLIGHTS_CACHE_PREFIX = 'bookflow:highlights:';
async function readCachedHighlights(bookId: string): Promise<Highlight[] | null> {
  try {
    const raw = await AsyncStorage.getItem(HIGHLIGHTS_CACHE_PREFIX + bookId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Highlight[];
    return parsed.map((h) => ({ ...h, createdAt: new Date(h.createdAt) }));
  } catch {
    return null;
  }
}
async function writeCachedHighlights(bookId: string, hs: Highlight[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      HIGHLIGHTS_CACHE_PREFIX + bookId,
      JSON.stringify(hs),
    );
  } catch {
    // Cache write failure is non-fatal — refetch still populates state.
  }
}

/**
 * User-saved highlights — both single words (saved from the dictionary
 * popover) and full sentences (saved from the translate sheet). Stored in
 * one table because the read-side queries are identical.
 *
 * The reader subscribes to a per-page slice and renders saved words with
 * a background tint, saved sentences with a faint highlight. New saves
 * append optimistically so the highlight appears the moment the user
 * taps "Save".
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type HighlightKind = 'word' | 'sentence';

export type Highlight = {
  id: string;
  bookId: string;
  pageId: string | null;
  pageIndex: number | null;
  kind: HighlightKind;
  text: string;
  note: string | null;
  color: string;
  createdAt: Date;
};

type HighlightRow = {
  id: string;
  book_id: string;
  page_id: string | null;
  page_index: number | null;
  kind: HighlightKind;
  text: string;
  note: string | null;
  color: string | null;
  created_at: string;
};

function rowToHighlight(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    pageId: row.page_id,
    pageIndex: row.page_index,
    kind: row.kind,
    text: row.text,
    note: row.note,
    color: row.color ?? 'yellow',
    createdAt: new Date(row.created_at),
  };
}

/**
 * Save a highlight. Returns the inserted row, or `null` for mock books /
 * unauthenticated users. The unique partial index on (user, book, page,
 * lower(text)) where kind='word' means saving the same word twice on the
 * same page is a no-op — we surface that as a successful save anyway
 * (the UI doesn't need to know).
 */
export async function saveHighlight(args: {
  bookId: string;
  pageId: string | null;
  pageIndex: number;
  kind: HighlightKind;
  text: string;
  note?: string | null;
  color?: string;
}): Promise<Highlight | null> {
  if (!UUID_RE.test(args.bookId)) return null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('highlights')
      .insert({
        user_id: user.id,
        book_id: args.bookId,
        page_id: args.pageId,
        page_index: args.pageIndex,
        kind: args.kind,
        text: args.text,
        note: args.note ?? null,
        color: args.color ?? 'yellow',
      })
      .select('id, book_id, page_id, page_index, kind, text, note, color, created_at')
      .single();

    if (error) {
      // 23505 = unique_violation. Treat dup-word as a soft success — it's
      // already saved, we just don't have a row to return. Caller can
      // refetch if it cares.
      if (error.code === '23505') return null;
      console.warn('[highlights] save failed:', error.message);
      return null;
    }
    return data ? rowToHighlight(data as HighlightRow) : null;
  } catch (err) {
    console.warn('[highlights] save threw:', err);
    return null;
  }
}

export async function deleteHighlight(id: string): Promise<boolean> {
  try {
    // Resolve the current user first so we can scope the delete to
    // their own row. RLS already blocks cross-user deletes, but
    // a service-role misconfiguration (or a future code path that
    // accidentally uses a non-RLS client) would otherwise let an
    // attacker pass any id. Belt-and-braces filter on user_id.
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      console.warn('[highlights] delete skipped — no signed-in user');
      return false;
    }
    const { error } = await supabase
      .from('highlights')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) {
      console.warn('[highlights] delete failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[highlights] delete threw:', err);
    return false;
  }
}

/**
 * Hook: stream the highlights for a single (book, page_index) pair.
 * The Reader subscribes per page so it only pays for what it renders.
 * Returns derived sets (words / sentences) for fast lookup during render —
 * tappable text checks "is this token in the saved-words set" on every
 * keystroke of typing prose, and a per-render re-derive is wasteful.
 */
export function usePageHighlights(bookId: string, pageIndex: number) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!UUID_RE.test(bookId)) {
      setHighlights([]);
      setLoading(false);
      return;
    }
    // Wrap the Supabase call in try/catch — it throws on offline
    // and the hook is called from `void refetch()` in the effect
    // below, which means the rejection had nowhere to land and
    // surfaced as "TypeError: Network request failed" in dev
    // LogBox every time the user opened a book without a network.
    // Treat offline same as a query error: clear the list and let
    // the colored placeholders / no-highlights state render.
    try {
      const { data, error } = await supabase
        .from('highlights')
        .select('id, book_id, page_id, page_index, kind, text, note, color, created_at')
        .eq('book_id', bookId)
        .eq('page_index', pageIndex)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[highlights] fetch failed:', error.message);
        setHighlights([]);
      } else {
        setHighlights((data ?? []).map((r) => rowToHighlight(r as HighlightRow)));
      }
    } catch (err) {
      console.warn('[highlights] fetch threw:', err);
      setHighlights([]);
    }
    setLoading(false);
  }, [bookId, pageIndex]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  /**
   * Optimistic add. Lets the reader show the highlight immediately on tap
   * without waiting for the round-trip; the next refetch reconciles.
   */
  const addOptimistic = useCallback((h: Highlight) => {
    setHighlights((prev) => {
      // De-dupe by (kind, lowercased text) — the unique index does this on
      // the server, but the optimistic list can race ahead of the insert.
      const key = `${h.kind}:${h.text.toLowerCase()}`;
      if (prev.some((p) => `${p.kind}:${p.text.toLowerCase()}` === key)) return prev;
      return [h, ...prev];
    });
  }, []);

  // Pre-compute the lookup sets the renderer needs. Words are matched
  // case-insensitively; sentences are exact-match (post-trim) which is
  // sufficient because we save the rendered sentence verbatim.
  //
  // Memoised so the Set identity is stable across re-renders when
  // `highlights` hasn't changed. Without this, every parent render
  // builds a new Set, which breaks React.memo and useMemo
  // optimizations downstream — every TappableParagraph in the
  // visible window re-rendered on any unrelated parent update.
  const savedWords = useMemo(
    () =>
      new Set(
        highlights
          .filter((h) => h.kind === 'word')
          .map((h) => h.text.toLowerCase()),
      ),
    [highlights],
  );
  const savedSentences = useMemo(
    () =>
      new Set(
        highlights
          .filter((h) => h.kind === 'sentence')
          .map((h) => h.text.trim()),
      ),
    [highlights],
  );

  return {
    highlights,
    savedWords,
    savedSentences,
    loading,
    refetch,
    addOptimistic,
  };
}

/**
 * Module-level shared store for `useBookHighlights`.
 *
 * Two surfaces render the same set of highlights for a single book:
 * the reader (saved-word tinting in the text) and the highlights
 * screen (vocab list + per-row delete). Each was independently
 * calling `useBookHighlights(bookId)` and getting its own
 * `useState`-backed list — so a delete in the highlights screen
 * removed the row from THAT screen's state, but the reader's state
 * still contained the entry and continued tinting the word. The
 * server delete worked; the in-memory views just diverged.
 *
 * Lift the list into a module-level store keyed by bookId, with a
 * per-book subscriber set. Every hook instance subscribes; every
 * write notifies every subscriber so all consumers re-render in
 * lockstep. Network refetches are deduped per-book so a second
 * mount during an in-flight first fetch piggy-backs on the same
 * promise instead of firing a duplicate query.
 *
 * Persistence to AsyncStorage happens inside the setter, so
 * mutations from any hook instance hit the cache without each
 * consumer needing its own persist effect.
 */
type BookStore = {
  highlights: Highlight[];
  subscribers: Set<() => void>;
  inflight: Promise<void> | null;
  hydrated: boolean;
};
const bookStores: Map<string, BookStore> = new Map();
function getBookStore(bookId: string): BookStore {
  let store = bookStores.get(bookId);
  if (!store) {
    store = {
      highlights: [],
      subscribers: new Set(),
      inflight: null,
      hydrated: false,
    };
    bookStores.set(bookId, store);
  }
  return store;
}
function setBookHighlights(
  bookId: string,
  update: Highlight[] | ((prev: Highlight[]) => Highlight[]),
): void {
  const store = getBookStore(bookId);
  const next =
    typeof update === 'function' ? update(store.highlights) : update;
  if (next === store.highlights) return;
  store.highlights = next;
  // Persist non-optimistic rows for the next reader mount.
  // Optimistic-id rows are transient client artifacts.
  const persistable = next.filter((h) => !h.id.startsWith('optimistic-'));
  void writeCachedHighlights(bookId, persistable);
  for (const fn of store.subscribers) fn();
}

/**
 * All highlights for a book, across every page. Backs the per-book
 * highlights screen (vocab list + saved sentences).
 *
 * Returns highlights pre-sorted by `created_at` desc — newest first —
 * which matches how readers expect a "saved items" list to read.
 */
export function useBookHighlights(bookId: string) {
  const [, forceRender] = useReducer((x: number) => x + 1, 0);
  const [loading, setLoading] = useState<boolean>(
    () => !getBookStore(bookId).hydrated,
  );

  // Subscribe to the per-book store. Any setBookHighlights call
  // (from this hook instance OR another) re-renders us.
  useEffect(() => {
    const store = getBookStore(bookId);
    store.subscribers.add(forceRender);
    return () => {
      store.subscribers.delete(forceRender);
    };
  }, [bookId]);

  const refetch = useCallback(async () => {
    if (!UUID_RE.test(bookId)) {
      setBookHighlights(bookId, []);
      setLoading(false);
      return;
    }
    const store = getBookStore(bookId);
    // Dedupe concurrent refetches for the same book — a second
    // mount during a first fetch piggy-backs instead of firing a
    // duplicate query.
    if (store.inflight) {
      try {
        await store.inflight;
      } finally {
        setLoading(false);
      }
      return;
    }
    store.inflight = (async () => {
      try {
        const { data, error } = await supabase
          .from('highlights')
          .select('id, book_id, page_id, page_index, kind, text, note, color, created_at')
          .eq('book_id', bookId)
          .order('created_at', { ascending: false });
        if (error) {
          console.warn('[highlights] book fetch failed:', error.message);
          setBookHighlights(bookId, []);
        } else {
          const fetched = (data ?? []).map((r) =>
            rowToHighlight(r as HighlightRow),
          );
          // Merge fetched rows with any in-flight optimistic
          // adds. The reader fires `addOptimistic` synchronously
          // the moment the user taps Save, but the network insert
          // takes a beat to land and the initial-mount refetch can
          // complete in the same window. Without this merge, the
          // refetch's set would silently overwrite the optimistic
          // entry and the user would see no highlight. Optimistic
          // rows are tagged `id: 'optimistic-...'` (see
          // handleSaveWord) and drop automatically once the next
          // refetch returns the real server row.
          //
          // Dedupe key matches the SERVER's unique index
          // `highlights_word_unique_per_page`:
          // (kind, page_index, lower(text)). pageIndex MUST be
          // part of the key — the same word on a different page
          // is a legitimate separate row, not a duplicate.
          setBookHighlights(bookId, (prev) => {
            const optimistic = prev.filter((p) =>
              p.id.startsWith('optimistic-'),
            );
            if (optimistic.length === 0) return fetched;
            const keyOf = (h: Highlight): string =>
              `${h.kind}:${h.pageIndex ?? 'null'}:${h.text.toLowerCase()}`;
            const fetchedKeys = new Set(fetched.map(keyOf));
            const stillOptimistic = optimistic.filter(
              (p) => !fetchedKeys.has(keyOf(p)),
            );
            return [...stillOptimistic, ...fetched];
          });
        }
      } catch (err) {
        console.warn('[highlights] book fetch threw:', err);
        setBookHighlights(bookId, []);
      }
    })();
    try {
      await store.inflight;
      store.hydrated = true;
    } finally {
      store.inflight = null;
      setLoading(false);
    }
  }, [bookId]);

  // Hydrate from AsyncStorage cache FIRST, then kick the network
  // refetch. The cache paint is fast (one disk read, typically
  // <10 ms), so the user sees their highlights at the first frame
  // after the reader mounts even if the network is slow or
  // offline. The refetch then reconciles when it lands.
  //
  // If the per-book store is already hydrated (a previous mount
  // populated it), skip the cache+loading state and just kick a
  // background refresh.
  useEffect(() => {
    let cancelled = false;
    const store = getBookStore(bookId);
    if (store.hydrated) {
      void refetch();
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    void (async () => {
      const cached = await readCachedHighlights(bookId);
      if (cancelled) return;
      if (cached && cached.length > 0) {
        // Only paint cache if the store is empty — an optimistic
        // add or another instance's refetch may have already
        // populated it.
        setBookHighlights(bookId, (prev) =>
          prev.length === 0 ? cached : prev,
        );
      }
      void refetch();
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId, refetch]);

  const removeOptimistic = useCallback(
    (id: string) => {
      setBookHighlights(bookId, (prev) => prev.filter((h) => h.id !== id));
    },
    [bookId],
  );

  /**
   * Optimistic add. Mirrors `usePageHighlights.addOptimistic` so the
   * reader (which uses this book-wide hook to share highlight state
   * across every visible PageSection) can show a freshly-saved word
   * as highlighted on the very next render, without waiting for a
   * refetch round-trip.
   *
   * Dedupe key MUST include pageIndex — the server's unique index
   * is `(user_id, book_id, page_index, lower(text))`, so the same
   * word on a different page is a separate row and a separate
   * highlight. The earlier dedupe used `(kind, lower(text))` and
   * silently blocked legitimate cross-page saves: saving "memory"
   * on page 10 was rejected client-side because "memory" already
   * existed on page 5, so `bookHighlights` never updated,
   * `savedWordsByPage[10]` stayed empty, and the new save appeared
   * to "save but not highlight". The server insert succeeded — the
   * local view just never reflected it until a refetch landed.
   */
  const addOptimistic = useCallback(
    (h: Highlight) => {
      setBookHighlights(bookId, (prev) => {
        const key = `${h.kind}:${h.pageIndex ?? 'null'}:${h.text.toLowerCase()}`;
        const hit = prev.some(
          (p) =>
            `${p.kind}:${p.pageIndex ?? 'null'}:${p.text.toLowerCase()}` ===
            key,
        );
        if (hit) return prev;
        return [h, ...prev];
      });
    },
    [bookId],
  );

  return {
    highlights: getBookStore(bookId).highlights,
    loading,
    refetch,
    removeOptimistic,
    addOptimistic,
  };
}
