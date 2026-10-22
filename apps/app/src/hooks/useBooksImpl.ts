import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '~/lib/supabase';
import type { Book } from '~/types/book';

// AsyncStorage cache for the library list. Lets the screen render with
// the user's last-known books instantly on cold start, while the network
// fetch refreshes in the background. We bake the user id into the key
// so a logout → login on a different account doesn't show stale rows.
const LIBRARY_CACHE_PREFIX = '@bookflow/library/v2';
const LIBRARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
type LibraryCacheEntry = {
  cachedAt: number;
  rows: BookRow[];
};

async function readLibraryCache(userId: string): Promise<BookRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`${LIBRARY_CACHE_PREFIX}/${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LibraryCacheEntry;
    if (Date.now() - parsed.cachedAt > LIBRARY_CACHE_TTL_MS) return null;
    return parsed.rows;
  } catch {
    return null;
  }
}

async function writeLibraryCache(userId: string, rows: BookRow[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${LIBRARY_CACHE_PREFIX}/${userId}`,
      JSON.stringify({ cachedAt: Date.now(), rows } satisfies LibraryCacheEntry),
    );
  } catch {
    // Cache write failures are non-fatal.
  }
}

/**
 * Library-screen data hook. Fetches the signed-in user's books, subscribes to
 * realtime changes so newly-uploaded rows appear without a manual refresh,
 * and exposes a `refetch` for pull-to-refresh / explicit invalidation.
 *
 * The hook converts raw `public.books` rows into the `Book` shape the
 * library UI already speaks. A handful of UI-only fields (totalPages,
 * coverColor, etc.) are synthesised here — the schema doesn't carry page
 * counts and the placeholder cover colour is deterministic per book id.
 *
 * `continueBook` selects the most recently-created in-progress book where
 * processing has finished. Without an `updated_at` column on books we use
 * created_at-desc ordering as the proxy for "most recently read first";
 * good enough until M2 wires real reading-session timestamps.
 */

type BookRow = {
  id: string;
  title: string;
  author: string | null;
  cover_storage_path: string | null;
  processing_status: string | null;
  /** Real page count from the parser, populated per format on processing. */
  total_pages: number | null;
  /** 'pdf' | 'epub' — drives reader selection (native PDF vs paginated text). */
  file_type: string | null;
  /** 0-based persisted reading position; column renamed from last_read_chapter. */
  last_read_page: number | null;
  /** Stored as an integer percent 0..100 (fraction through current page). */
  last_read_position: number | null;
  last_read_at: string | null;
  created_at: string | null;
  /**
   * URL the book was imported from (Gutendex, Standard Ebooks, etc).
   * Discover screen reverse-maps this to a DiscoverBook id so the
   * AddPill knows the book is already in the user's library and
   * flips to "Remove from library". Null for device-uploaded books.
   */
  source_url: string | null;
};

const COVER_PALETTE = [
  '#1B4332', '#3D3A36', '#5D4E47', '#234D38', '#1A3325',
  '#5B6B58', '#7A6E5C', '#C7986E', '#3D2B1F', '#4A5D4E',
];

/** Deterministic cover colour from book id so the same book is always the same colour. */
function pickCoverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return COVER_PALETTE[hash % COVER_PALETTE.length];
}

function rowToBook(row: BookRow): Book {
  const totalPagesRaw = row.total_pages ?? 0;
  const lastReadPage = row.last_read_page ?? 0;
  // Position is a 0..100 integer in the DB; we treat it as the *fraction*
  // through the current chapter. Combined with the chapter index, that
  // gives a continuous progress value rather than stair-stepping per
  // chapter (which made a 30-chapter book read 0% → 3% → 6% with no
  // visible motion in between).
  // Position is a 0..100 integer in the DB; we treat it as the *fraction*
  // through the current page. Combined with the page index, that gives a
  // continuous progress value rather than stair-stepping per page (which
  // made a 200-page book read 0.5%, 1.0%, 1.5% with no visible motion in
  // between).
  const positionFraction = Math.max(0, Math.min(1, (row.last_read_position ?? 0) / 100));
  const totalPages = totalPagesRaw > 0 ? totalPagesRaw : 1;
  const progressFraction =
    totalPagesRaw > 0 ? (lastReadPage + positionFraction) / totalPagesRaw : 0;
  const progressPercent = Math.max(0, Math.min(100, Math.round(progressFraction * 100)));
  const hasStartedReading = lastReadPage > 0 || positionFraction > 0;
  const created = row.created_at ? new Date(row.created_at) : new Date();
  // Real wall-clock time of the last reading session. Falls back to
  // created_at for legacy rows that have been read before this column
  // existed, and to null for books that have never been opened.
  const lastReadAt = row.last_read_at
    ? new Date(row.last_read_at)
    : hasStartedReading
    ? created
    : null;

  // Real file type from the row drives reader selection: 'pdf' goes to
  // the native PDF reader, 'epub' to the paginated text reader. Anything
  // missing (legacy rows) defaults to 'pdf' so the library still routes,
  // but ideally those get re-processed.
  const type: 'pdf' | 'epub' =
    row.file_type === 'epub' ? 'epub' : 'pdf';

  return {
    id: row.id,
    title: row.title,
    author: row.author ?? '',
    type,
    totalPages,
    currentPage: Math.max(1, Math.round(progressFraction * totalPages)),
    progressPercent,
    currentChapter: hasStartedReading ? `Page ${lastReadPage + 1}` : undefined,
    lastReadAt,
    addedAt: created,
    coverColor: pickCoverColor(row.id),
    downloaded: false,
    processingStatus: row.processing_status,
    coverStoragePath: row.cover_storage_path,
    last_read_page: lastReadPage,
    // Pass through for Discover's libraryIds reverse-map.
    source_url: row.source_url,
  };
}

export type UseBooksResult = {
  books: Book[];
  /** Most-recently-created in-progress book that's finished processing. Null if none. */
  continueBook: Book | null;
  isLoading: boolean;
  refetch: () => Promise<void>;
};

/**
 * Internal implementation — fetches + caches + subscribes to realtime.
 * Exposed indirectly via the `BooksProvider` / `useBooks()` pair in
 * `./useBooks.tsx`. Don't import this directly from screens — the
 * provider lifts state to the app scope so tab switches don't blow
 * the cache and re-fire the network request.
 */
export function useBooksImpl(): UseBooksResult {
  const [books, setBooks] = useState<Book[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // We capture the user id once for the realtime filter. If the user signs
  // out and a different user signs in, App.tsx remounts the library, which
  // re-runs this hook from scratch — so the closed-over id stays correct.
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Unique channel topic per hook instance. Supabase realtime returns
  // the *existing* channel when `.channel(name)` is called with a name
  // that's already been subscribed, which means a second `.on()` after
  // the first `.subscribe()` raises "cannot add postgres_changes
  // callbacks ... after subscribe()". useBooks is now mounted in
  // multiple places (LibraryStage + ListenHistoryScreen), so each
  // instance gets its own topic to avoid the collision.
  const channelTopicRef = useRef(
    `user-books-${Math.random().toString(36).slice(2, 10)}`,
  );

  const refetch = useCallback(async () => {
    // Use getSession (local AsyncStorage) instead of getUser
    // (network roundtrip) so we don't gratuitously fail offline.
    // The books select() below is the real network call — that
    // still has to succeed, but if it fails we keep whatever's
    // already painted from cache.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) {
        setBooks([]);
        setIsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('books')
        .select(
          // `source_url` is essential for the Discover screen's
          // libraryIds reverse-map — without it, the AddPill on a
          // book imported from Gutenberg / Standard Ebooks never
          // flips to "In library" because the screen can't tell
          // which DB row corresponds to which Discover id.
          'id, title, author, cover_storage_path, processing_status, total_pages, file_type, last_read_page, last_read_position, last_read_at, created_at, source_url',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[useBooks] fetch failed:', error.message);
        setIsLoading(false);
        return;
      }
      const rows = (data ?? []) as BookRow[];
      setBooks(rows.map((row) => rowToBook(row)));
      setIsLoading(false);
      // Persist for the next cold start. Fire-and-forget; cache write
      // failures don't affect the live state we just rendered from.
      void writeLibraryCache(user.id, rows);
    } catch (err) {
      console.warn('[useBooks] refetch threw:', err);
      setIsLoading(false);
    }
  }, []);

  // Initial fetch with cache hydration. Read the cached rows first so
  // the library renders instantly on re-open; the network fetch then
  // overwrites whatever's stale. New users / first launches see the
  // skeleton briefly while the cache is empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Read user from the local SESSION (AsyncStorage), not from
      // `auth.getUser()`. getUser() always hits the /auth/v1/user
      // endpoint to validate the JWT — which means it throws when
      // offline and the cached library never paints. getSession()
      // reads from local persistence and is network-free, so we
      // can hydrate the library from cache even with no
      // connection. The realtime/refetch flow below will validate
      // the user against the server as soon as we're back online.
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (cancelled || !user) {
          if (!cancelled) await refetch();
          return;
        }
        const cached = await readLibraryCache(user.id);
        if (cached && !cancelled) {
          setBooks(cached.map(rowToBook));
          setIsLoading(false);
        }
        if (!cancelled) await refetch();
      } catch (err) {
        if (!cancelled) {
          console.warn('[useBooks] initial fetch threw:', err);
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refetch]);

  // Realtime subscription. We re-fetch instead of patching the local list
  // from the payload because the row may have been touched by something
  // we don't model (e.g. RLS changes, server-side trigger). A re-query is
  // cheap and keeps the source of truth the database.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Local-session read (no network) — see refetch above.
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;
        if (cancelled || !user) return;

        const channel = supabase
          .channel(channelTopicRef.current)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'books',
              filter: `user_id=eq.${user.id}`,
            },
            () => {
              void refetch();
            },
          )
          .subscribe();

        channelRef.current = channel;
      } catch (err) {
        console.warn('[useBooks] realtime subscribe threw:', err);
      }
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refetch]);

  // Most-recently-touched in-progress, ready book. "Touched" is
  // whichever Of last_read_at OR added_at is fresher — so picking up
  // a book in the Listen tab (which updates last_read_at via the
  // audio session) bumps it to the top, even if the user added a
  // newer book afterward.
  //
  // Previous version just used .find() against the books array
  // (which was created_at desc), so the card always reflected the
  // most recently UPLOADED book — even when the user had been
  // actively reading something else. Sorting explicitly by
  // last-touched time matches the "Continue reading" mental model:
  // surface the book I was just in.
  const continueBook = useMemo<Book | null>(() => {
    const eligible = books.filter(
      (b) =>
        b.processingStatus === 'ready' &&
        (b.last_read_page ?? 0) > 0 &&
        b.progressPercent > 0 &&
        b.progressPercent < 100,
    );
    if (eligible.length === 0) return null;
    const touchedAt = (b: Book): number => {
      const lr = b.lastReadAt ? b.lastReadAt.getTime() : 0;
      const added = b.addedAt ? b.addedAt.getTime() : 0;
      return Math.max(lr, added);
    };
    return eligible.reduce((best, candidate) =>
      touchedAt(candidate) > touchedAt(best) ? candidate : best,
    );
  }, [books]);

  return { books, continueBook, isLoading, refetch };
}
