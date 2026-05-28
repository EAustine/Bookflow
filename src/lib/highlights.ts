import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '~/lib/supabase';

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
 * All highlights for a book, across every page. Backs the per-book
 * highlights screen (vocab list + saved sentences).
 *
 * Returns highlights pre-sorted by `created_at` desc — newest first —
 * which matches how readers expect a "saved items" list to read.
 */
export function useBookHighlights(bookId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!UUID_RE.test(bookId)) {
      setHighlights([]);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('highlights')
        .select('id, book_id, page_id, page_index, kind, text, note, color, created_at')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('[highlights] book fetch failed:', error.message);
        setHighlights([]);
      } else {
        const fetched = (data ?? []).map((r) =>
          rowToHighlight(r as HighlightRow),
        );
        // Merge fetched rows with any in-flight optimistic adds.
        // The reader fires `addOptimistic` synchronously the
        // moment the user taps Save — but the network insert
        // takes a beat to land, and the initial-mount refetch
        // (or any concurrent refetch) can complete in the same
        // window. Without this merge, the refetch's
        // `setHighlights(fetched)` would silently overwrite the
        // optimistic entry and the user would see no highlight.
        // Optimistic rows are tagged with `id: 'optimistic-...'`
        // (see handleSaveWord) and they get dropped automatically
        // once the next refetch round-trip returns the real
        // server row — we de-dupe by lowercased (kind, text) so
        // an optimistic and its real twin can't coexist.
        setHighlights((prev) => {
          const optimistic = prev.filter((p) => p.id.startsWith('optimistic-'));
          if (optimistic.length === 0) return fetched;
          const fetchedKeys = new Set(
            fetched.map((f) => `${f.kind}:${f.text.toLowerCase()}`),
          );
          const stillOptimistic = optimistic.filter(
            (p) => !fetchedKeys.has(`${p.kind}:${p.text.toLowerCase()}`),
          );
          return [...stillOptimistic, ...fetched];
        });
      }
    } catch (err) {
      console.warn('[highlights] book fetch threw:', err);
      setHighlights([]);
    }
    setLoading(false);
  }, [bookId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  const removeOptimistic = useCallback((id: string) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  /**
   * Optimistic add. Mirrors `usePageHighlights.addOptimistic` so the
   * reader (which now uses this book-wide hook to share highlight
   * state across every visible PageSection) can show a freshly-saved
   * word as highlighted on the very next render, without waiting for
   * a refetch round-trip.
   */
  const addOptimistic = useCallback((h: Highlight) => {
    setHighlights((prev) => {
      const key = `${h.kind}:${h.text.toLowerCase()}`;
      if (prev.some((p) => `${p.kind}:${p.text.toLowerCase()}` === key)) {
        return prev;
      }
      return [h, ...prev];
    });
  }, []);

  return { highlights, loading, refetch, removeOptimistic, addOptimistic };
}
