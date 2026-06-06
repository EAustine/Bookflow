import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, TabBar, type TabKey, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { SUPPORT_EMAIL } from '~/lib/legalUrls';
import { formatNetworkError } from '~/lib/networkErrors';
import { useBackHandler } from '~/lib/useBackHandler';
import { useSlowOp } from '~/hooks/useSlowOp';
import { SlowNetworkBanner } from '~/components/SlowNetworkBanner';
import {
  fetchOpenLibrary,
  fetchWikisource,
  fetchDoabRest,
  popularGutenberg,
  searchGutenberg,
  topicGutenberg,
  type DiscoverBook as ApiBook,
} from '~/lib/discoverApi';
import {
  getCachedShelf,
  hydrateShelfCache,
  peekCachedShelf,
  setCachedShelf,
} from '~/lib/discoverCache';
import {
  importDiscoverBook,
  importErrorMessage,
} from '~/lib/discoverImport';
import { DISCOVER_SEED } from '~/lib/discoverSeed';
import { useBooks } from '~/hooks/useBooks';
import { supabase } from '~/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Screen-side book shape. A superset of the API's DiscoverBook, with
 * UI-specific fields (`coverColor`, `coverLabel`) derived from the
 * source data + a deterministic palette.
 *
 * `source` is the literal source name (matching `ImportableBook`) so
 * the import flow's type-narrowing works without extra coercion.
 */
type DiscoverBook = {
  id: string;
  title: string;
  coverLabel?: string;
  author: string;
  coverColor: string;
  /** Real cover image (Gutenberg jpeg). When set the cards render an
   * <Image>; the colored cover is the fallback. */
  coverUrl: string | null;
  /** Direct EPUB URL — used by the import flow. */
  epubUrl: string | null;
  tags: string[];
  /** Optional — Gutendex doesn't ship reading time. */
  readTime?: string;
  /** Optional — Gutendex doesn't ship chapter count. */
  chapters?: number;
  about: string;
  /** Source identifier the edge function knows how to import from.
   * The OPDS sources (feedbooks, manybooks, doab, oapen) are served
   * by the generic `discover-opds` edge function — see `discoverApi.ts`. */
  source:
    | 'gutenberg'
    | 'standardebooks'
    | 'openlibrary'
    | 'wikisource'
    | 'feedbooks'
    | 'manybooks'
    | 'doab'
    | 'oapen';
  /** Display label for the detail view ("Project Gutenberg"). */
  sourceLabel?: string;
  related?: { id: string; title: string; coverColor: string }[];
};

// ─── Cover palette ────────────────────────────────────────────────────────────

const CC = {
  forest:  '#1B4332',
  brown:   '#5C4A3A',
  forest7: '#234D38',
  amber:   '#D4A574',
  slate:   '#4A5568',
  rust:    '#7C3A2A',
  teal:    '#2A6B6E',
  plum:    '#5A3D6E',
  olive:   '#5A6E3D',
} as const;

// ─── API → Screen adapter ────────────────────────────────────────────────────

const COVER_PALETTE = [
  CC.forest,
  CC.brown,
  CC.amber,
  CC.slate,
  CC.rust,
  CC.teal,
  CC.plum,
  CC.olive,
  CC.forest7,
] as const;

/**
 * Cheap deterministic hash → palette index. Same book id renders with
 * the same fallback color across reloads / between rails.
 */
function pickCoverColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return COVER_PALETTE[hash % COVER_PALETTE.length]!;
}

function fromApiBook(b: ApiBook): DiscoverBook {
  // The lib uses hyphenated source ids (follows the id-prefix
  // convention `gutenberg:N` / `standard-ebooks:slug` /
  // `open-library:key` / `wikisource:lang:title`) while the import
  // edge function expects shorter tokens without hyphens. Translate
  // once at this boundary so the rest of the screen layer doesn't
  // have to know about the discrepancy.
  // Map the lib-shape source string to the screen-shape source string.
  // OPDS sources (feedbooks, manybooks, doab, oapen) already use the
  // non-hyphenated form server-side, so they pass through unchanged.
  const source: DiscoverBook['source'] =
    b.source === 'standard-ebooks'
      ? 'standardebooks'
      : b.source === 'open-library'
        ? 'openlibrary'
        : b.source === 'wikisource'
          ? 'wikisource'
          : b.source === 'feedbooks'
            ? 'feedbooks'
            : b.source === 'manybooks'
              ? 'manybooks'
              : b.source === 'doab'
                ? 'doab'
                : b.source === 'oapen'
                  ? 'oapen'
                  : 'gutenberg';
  const sourceLabel =
    source === 'standardebooks'
      ? 'Standard Ebooks'
      : source === 'openlibrary'
        ? 'Open Library'
        : source === 'wikisource'
          ? 'Wikisource'
          : source === 'feedbooks'
            ? 'Feedbooks'
            : source === 'manybooks'
              ? 'ManyBooks'
              : source === 'doab'
                ? 'DOAB'
                : source === 'oapen'
                  ? 'OAPEN'
                  : 'Project Gutenberg';
  const fallbackAbout =
    source === 'standardebooks'
      ? 'Hand-typeset public-domain edition from Standard Ebooks — free to read in your library.'
      : source === 'openlibrary'
        ? 'Public-domain edition via Internet Archive — free to read in your library.'
        : source === 'wikisource'
          ? 'Public-domain edition via Wikisource — EPUB generated on demand from the wiki source.'
          : source === 'feedbooks'
            ? 'Curated public-domain edition via Feedbooks — free to read in your library.'
            : source === 'manybooks'
              ? 'Free public-domain title via ManyBooks — free to read in your library.'
              : source === 'doab'
                ? 'Open-access academic book via DOAB — free to read in your library.'
                : source === 'oapen'
                  ? 'Open-access scholarly book via OAPEN — free to read in your library.'
                  : 'Public-domain title from Project Gutenberg — free to read in your library.';
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    coverColor: pickCoverColor(b.id),
    coverLabel: b.title,
    coverUrl: b.coverUrl,
    epubUrl: b.epubUrl,
    tags: b.tags,
    about: b.about || fallbackAbout,
    // `source` is the literal id the import flow knows how to handle.
    // `sourceLabel` is the human-readable version shown in the
    // detail page's "Source" row.
    source,
    sourceLabel,
  };
}

const CATEGORIES = [
  'For you',
  'Classics',
  'Christianity',
  'Fiction',
  'Mystery',
  'Adventure',
  'Romance',
  'Sci-fi',
  'Philosophy',
  'Poetry',
  'History',
  'Children',
  'Short reads',
] as const;
type Category = (typeof CATEGORIES)[number];

/**
 * Tiny in-memory LRU for search hits. Keyed by lowercased query.
 * Module-level (not state) so the cache survives Discover unmount and
 * a single `useState` doesn't churn per character. Cap of 24 keeps
 * memory trivial — at ~8KB per result set the worst case is ~200KB.
 */
const SEARCH_CACHE_MAX = 24;
const searchCache: Map<string, DiscoverBook[]> = (() => {
  const m = new Map<string, DiscoverBook[]>();
  // Override `set` to enforce LRU eviction (Map preserves insertion
  // order, so the oldest key is .keys().next().value when over cap).
  const origSet = m.set.bind(m);
  m.set = (key, value) => {
    if (m.has(key)) m.delete(key); // re-insert to move to MRU position
    origSet(key, value);
    if (m.size > SEARCH_CACHE_MAX) {
      const oldest = m.keys().next().value;
      if (oldest !== undefined) m.delete(oldest);
    }
    return m;
  };
  return m;
})();

/**
 * Map a category chip to a Gutendex topic search. "For you" returns
 * the generic popular feed since we don't yet have personalisation
 * data. The topic strings are matched as substrings against subjects
 * + bookshelves; broader/single-word terms tend to surface a livelier
 * mix than ultra-specific ones.
 */
const CATEGORY_TOPIC: Record<Exclude<Category, 'For you'>, string> = {
  'Classics': 'classics',
  'Fiction': 'fiction',
  // Gutenberg's "Christianity" bookshelf + "Religion" subjects cover
  // ~3,000 titles — Augustine, Aquinas, Bunyan, Edwards, Wesley,
  // Calvin, Spurgeon, devotional / theology / church history. Topic
  // matches against subjects + bookshelves substring, so 'christianity'
  // catches both the bookshelf name AND book-level "Religion --
  // Christianity" subject tags.
  'Christianity': 'christianity',
  'Mystery': 'mystery',
  'Adventure': 'adventure',
  'Romance': 'romance',
  // 'science fiction' is the canonical Gutenberg subject for the genre
  // — broader 'sci-fi' barely matches anything in the catalog.
  'Sci-fi': 'science fiction',
  'Philosophy': 'philosophy',
  'Poetry': 'poetry',
  'History': 'history',
  // Targets Gutenberg's "Children's literature" + "Children's fiction"
  // bookshelves which use this exact phrasing.
  'Children': "children's",
  'Short reads': 'short stories',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export type DiscoverScreenProps = {
  onTabChange: (tab: TabKey) => void;
  /**
   * Fired whenever Discover pushes/pops a sub-view (category list,
   * book detail). App.tsx uses this to hide the global mini-player
   * overlay on drill-ins. Mirrors the pattern on LibraryScreen
   * (`onReaderOpenChange`) and YouScreen (`onSubViewOpenChange`).
   */
  onSubViewOpenChange?: (open: boolean) => void;
};

export function DiscoverScreen({
  onTabChange,
  onSubViewOpenChange,
}: DiscoverScreenProps) {
  const [view, setView] = useState<'home' | 'category' | 'detail'>('home');
  // Notify the parent shell when we leave / return to the home
  // view. Effect-based so both directions fire without wrapping
  // every setView call.
  useEffect(() => {
    onSubViewOpenChange?.(view !== 'home');
  }, [view, onSubViewOpenChange]);
  const [activeCategory, setActiveCategory] = useState<Category>('For you');
  const [detailBook, setDetailBook] = useState<DiscoverBook | null>(null);
  const [detailFrom, setDetailFrom] = useState<'home' | 'category'>('home');
  // "In library" derives from the real books table (via useBooks
  // realtime). We match by source_url because Discover books carry
  // their Gutenberg URL on `epubUrl`, and the import flow writes that
  // exact value to books.source_url. Switching to derived state means
  // no manual reconciliation between optimistic UI + real data.
  const { books: userBooks } = useBooks();
  const libraryIds = useMemo<Set<string>>(() => {
    const set = new Set<string>();
    for (const b of userBooks) {
      const url = b.source_url;
      if (!url) continue;
      // Reverse-map books.source_url back to the Discover id form.
      // Each source has its own URL pattern → id template, mirroring
      // the id construction in discoverApi.ts and the standard-ebooks
      // edge function:
      //
      //   Gutenberg:
      //     URL    https://www.gutenberg.org/ebooks/12345.epub.images
      //     id     gutenberg:12345
      //
      //   Standard Ebooks:
      //     URL    https://standardebooks.org/ebooks/jane-austen/
      //              pride-and-prejudice/downloads/…epub
      //     id     standard-ebooks:jane-austen/pride-and-prejudice
      //
      // Both branches are tried per row — order doesn't matter
      // because the URL patterns don't overlap.
      const gutMatch = url.match(/gutenberg\.org\/.*?\/(\d+)/);
      if (gutMatch) {
        set.add(`gutenberg:${gutMatch[1]}`);
        continue;
      }
      const seMatch = url.match(
        /standardebooks\.org\/ebooks\/([^/]+\/[^/]+)/,
      );
      if (seMatch) {
        set.add(`standard-ebooks:${seMatch[1]}`);
        continue;
      }
      // Open Library:
      //   URL    https://archive.org/download/{ia}/{ia}.epub
      //   id     open-library:{ia}
      // The edge function generates the discover id using the IA
      // identifier (see discover-open-library/index.ts) precisely so
      // we can do this reverse-match without an extra column.
      const olMatch = url.match(/archive\.org\/download\/([^/]+)\//);
      if (olMatch) {
        set.add(`open-library:${olMatch[1]}`);
        continue;
      }
      // Wikisource:
      //   URL    https://ws-export.wmcloud.org/?lang=X&page=Title&format=...
      //   id     wikisource:X:Title_underscored
      // Pull lang + page out of the wsexport query string and
      // rebuild the id the same way the discover-wikisource function
      // constructs it (spaces → underscores).
      try {
        const wsUrl = new URL(url);
        if (wsUrl.hostname === 'ws-export.wmcloud.org') {
          const wsLang = wsUrl.searchParams.get('lang');
          const wsPage = wsUrl.searchParams.get('page');
          if (wsLang && wsPage) {
            set.add(`wikisource:${wsLang}:${wsPage.replace(/\s+/g, '_')}`);
          }
        }
      } catch {
        // Malformed source_url — skip; the row won't be matchable
        // but the rest of the library is unaffected.
      }
      // DOAB (academic OA):
      //   URL    https://library.oapen.org/bitstream/handle/{handlePrefix}/{bookId}/{filename}.pdf?sequence=N
      //   id     doab:{bookId}
      // The DOAB adapter intentionally builds its Discover id from
      // the OAPEN bookId (the second numeric path segment) instead
      // of the DOAB item UUID, precisely so this reverse-map can
      // reconstruct it without any extra column.
      const doabMatch = url.match(
        /library\.oapen\.org\/bitstream\/handle\/[\w.]+\/(\d+)\//,
      );
      if (doabMatch) {
        set.add(`doab:${doabMatch[1]}`);
        continue;
      }
    }
    return set;
  }, [userBooks]);

  // In-flight import tracker — keys are Discover book ids that we've
  // submitted to import-from-url and haven't yet seen come back as a
  // libraryIds member. Lets the Add button switch to a spinner so the
  // user sees something is happening between tap and library realtime
  // delivering the new row.
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // ── Home shelves ────────────────────────────────────────────────────────
  // Each rail has its own state + loading flag so the UI renders
  // progressively as each request lands, rather than waiting on the
  // slowest of the three. The cache layer means repeat visits skip the
  // network entirely (stale-while-revalidate: render cache → refresh).
  const [popular, setPopular] = useState<DiscoverBook[]>([]);
  const [fictionRail, setFictionRail] = useState<DiscoverBook[]>([]);
  const [shortReads, setShortReads] = useState<DiscoverBook[]>([]);
  // "Spiritual classics" rail — surfaces Gutenberg's Christianity
  // bookshelf (Augustine, Bunyan, Edwards, Wesley, à Kempis, etc.) on
  // the Discover home so religious readers see relevant content
  // without having to find the Christianity category chip first.
  const [spiritualRail, setSpiritualRail] = useState<DiscoverBook[]>([]);
  // "Validated by Wikisource" rail — public-domain texts that have
  // been verified twice by Wikisource editors against the original
  // scan. Replaces the previous Standard Ebooks rail (SE added auth
  // to their OPDS feed in 2024 and we don't currently have account
  // credentials). Smaller catalog than SE but no upstream friction.
  const [wikisourceRail, setWikisourceRail] = useState<DiscoverBook[]>([]);
  // Pull-to-refresh: bumping `refreshKey` re-runs the home-load
  // useEffect (it's in its dep array), which triggers a fresh
  // fetch of every rail + search pool. Brief `refreshing` flag
  // drives the RefreshControl spinner — we clear it after the
  // network calls have had a beat to settle.
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onPullToRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    // Hold the `refreshing` flag long enough that the user sees
    // the skeleton phase visibly happen. Without this hold-time
    // (or with the previous 1 s), the cache-pass inside loadShelf
    // re-painted the cached rails ~50 ms later and the refresh
    // gesture felt like nothing actually happened. 2 s is the
    // minimum window where "I pulled, something refreshed, here
    // are the new cards" reads cleanly — short enough not to
    // annoy on fast networks, long enough that the skeleton phase
    // registers as intentional UI. Rails downstream gate on this
    // flag to swap their card list for a skeleton row.
    setTimeout(() => setRefreshing(false), 2000);
  }, []);
  // Hidden Wikisource search pool, same pattern as the other library
  // pools — bigger background slice that fuels the typeahead so a
  // user can find Wikisource-only titles without waiting for the
  // network search.
  const [wikisourcePool, setWikisourcePool] = useState<DiscoverBook[]>([]);
  // "Internet Archive" rail — Open Library / archive.org's public-
  // domain catalog. The third source after Gutenberg and Standard
  // Ebooks; lifts coverage from ~1,200 SE titles + Gutenberg's set
  // into the millions, with the catalog server-side filtered to
  // titles that have a downloadable EPUB.
  const [openLibraryRail, setOpenLibraryRail] = useState<DiscoverBook[]>([]);
  // Same background-pool pattern as `wikisourcePool` — hidden 200-book
  // slice feeding localMatches for typeahead.
  const [openLibraryPool, setOpenLibraryPool] = useState<DiscoverBook[]>([]);
  const [openLibraryLoading, setOpenLibraryLoading] = useState(true);
  // Feedbooks + ManyBooks OPDS feeds went behind Cloudflare bot
  // challenges; the generic discover-opds adapter is still in place
  // for any future working OPDS source. DOAB academic books reach us
  // via a separate `discover-doab` edge function (DOAB's REST API,
  // not OPDS) — see fetchDoabRest in discoverApi.ts.
  const [doabRail, setDoabRail] = useState<DiscoverBook[]>([]);
  const [doabLoading, setDoabLoading] = useState(true);
  const [popularLoading, setPopularLoading] = useState(true);
  const [fictionLoading, setFictionLoading] = useState(true);
  const [shortLoading, setShortLoading] = useState(true);
  const [spiritualLoading, setSpiritualLoading] = useState(true);
  const [wikisourceLoading, setWikisourceLoading] = useState(true);
  const [homeError, setHomeError] = useState<string | null>(null);
  // "Loading" for the home view as a whole = popular hasn't shown up
  // yet (popular drives the featured card). Other rails can come later.
  const homeLoading = popularLoading && popular.length === 0;

  // ── Category view ──────────────────────────────────────────────────────
  const [categoryBooks, setCategoryBooks] = useState<DiscoverBook[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // ── Search ─────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DiscoverBook[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Featured = first popular pick. Computed (not state) so it stays in
  // sync with the popular feed without an extra setState call.
  const featured: DiscoverBook | null = popular[0] ?? null;

  // Initial home-shelf load — three independent fetches, each rendered
  // as soon as its data lands. Each rail also runs a stale-while-
  // revalidate against AsyncStorage: paint cached books immediately
  // (instant repeat opens), then fire a fresh fetch in the background
  // and swap when it returns.
  useEffect(() => {
    let cancelled = false;
    setHomeError(null);

    // Fire-and-forget hydration of the memory cache mirror. Reads every
    // `bookflow:discover:*` key from AsyncStorage in one shot so that
    // by the time the user taps a category chip a few ms from now,
    // `peekCachedShelf` returns the cached books synchronously and the
    // category page renders without a loading flash. Idempotent —
    // concurrent callers share the same in-flight promise.
    void hydrateShelfCache();

    /**
     * Load one shelf with SWR semantics. `cacheKey` is the AsyncStorage
     * slot; `fetcher` returns fresh API data; `seed` is an optional
     * baked-in starter list (lib-shape ApiBook[]) to paint instantly
     * when there's no cache (cold-start UX — see DISCOVER_SEED).
     *
     * Never-empty rule: once a non-empty list is on screen (seed,
     * cache, or network), an empty network response does NOT clear
     * it. Symptom of the rule's absence: the seed paints, the network
     * returns `{ok:true, books:[]}` (gutendex hiccup, region block,
     * malformed proxy response), and the rail goes blank — exactly
     * the bug the user reported.
     */
    const loadShelf = async (
      cacheKey: string,
      fetcher: () => ReturnType<typeof popularGutenberg>,
      setBooks: (books: DiscoverBook[]) => void,
      setLoading: (l: boolean) => void,
      seed?: ApiBook[],
    ) => {
      let displayed: DiscoverBook[] = [];
      const setDisplayed = (b: DiscoverBook[]) => {
        displayed = b;
        setBooks(b);
        setLoading(false);
      };

      // 1. Cache pass — paint instantly if we have something fresh enough.
      const cached = await getCachedShelf<DiscoverBook>(cacheKey);
      if (cancelled) return;
      if (cached && cached.length > 0) {
        setDisplayed(cached);
      } else if (seed && seed.length > 0) {
        // No cache but we have a baked-in seed — reshape (so the
        // deterministic colour palette runs) and paint. The fresh fetch
        // below will overwrite once it lands with non-empty results;
        // the seed is the cold-start UX.
        setDisplayed(seed.map(fromApiBook));
      }

      // 2. Background refresh — always fire, even on cache hit. Falls
      // through to error path on network failure but keeps cached data
      // visible (only sets error on the popular shelf since that's the
      // one the user notices first).
      try {
        const result = await fetcher();
        if (cancelled) return;
        if (result.ok) {
          const books = result.books.map(fromApiBook);
          if (books.length > 0) {
            // Fresh non-empty data wins — paint it and refresh cache.
            setDisplayed(books);
            void setCachedShelf(cacheKey, books);
          } else if (displayed.length === 0) {
            // Empty network result and we have nothing to show — stay
            // in loading state so the rail at least renders skeletons
            // until something arrives. Don't poison the cache with [].
            setLoading(false);
          }
          // If displayed.length > 0 and books.length === 0, do nothing:
          // keep the seed/cache visible rather than blanking the rail.
        } else if (displayed.length === 0) {
          // Network failed and we never painted anything — surface the
          // error so the user knows something's up.
          setHomeError(result.error);
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (displayed.length === 0) {
          setHomeError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    };

    // Fan out — each shelf is independent. 8 books per shelf instead of
    // 12; the rails only show a few cards in the viewport anyway, and
    // the smaller payload + smaller list of images shaves the first-
    // paint time noticeably on slower networks.
    void loadShelf(
      'popular',
      () => popularGutenberg({ limit: 8 }),
      setPopular,
      setPopularLoading,
      // Cold-start seed — first-time users see content instantly.
      DISCOVER_SEED,
    );
    // Fiction + short-reads rails both fall back to the same seed list
    // when their cache misses. They'll be replaced with topic-filtered
    // results once the network responds, but the user always sees
    // *something* even on a slow first launch.
    void loadShelf(
      'topic:fiction',
      () => topicGutenberg('fiction', { limit: 8 }),
      setFictionRail,
      setFictionLoading,
      DISCOVER_SEED,
    );
    void loadShelf(
      'topic:short-stories',
      () => topicGutenberg('short stories', { limit: 8 }),
      setShortReads,
      setShortLoading,
      DISCOVER_SEED,
    );
    void loadShelf(
      'topic:christianity',
      () => topicGutenberg('christianity', { limit: 8 }),
      setSpiritualRail,
      setSpiritualLoading,
      DISCOVER_SEED,
    );
    void loadShelf(
      // Cache key carries a `:v3` suffix so app installs that already
      // wrote stale Wikisource data to AsyncStorage (pre-cover-only
      // filter, pre-image-proxy response shape) skip that old slot
      // entirely and rebuild from a fresh fetch. The old
      // `source:wikisource:v2` and `:source:wikisource` entries are
      // harmlessly orphaned — they'll get garbage-collected the next
      // time `getCachedShelf` reads them with a 30-min TTL miss.
      // Bump again if a future change to the Wikisource response
      // shape needs the same forced refresh.
      'source:wikisource:v3',
      // Wikisource's validated-texts category — public-domain books
      // that have been verified twice by Wikisource editors against
      // the original scan. 24 ≈ a couple of swipe pages, matching
      // the visual density of the other rails. `coversOnly` drops
      // entries without a Wikimedia pageimage so every visible card
      // has artwork — the function compensates by widening its
      // upstream candidate pool.
      async () => {
        const result = await fetchWikisource({
          limit: 24,
          feed: 'validated',
          coversOnly: true,
        });
        // Diagnostic — surfaces in Metro so a silent fetch failure
        // is visible without having to add a probe each time.
        if (result.ok) {
          console.log(
            '[Discover] Wikisource rail fetch ok, books:',
            result.books.length,
          );
        } else {
          console.warn(
            '[Discover] Wikisource rail fetch FAILED:',
            result.error,
          );
        }
        return result;
      },
      setWikisourceRail,
      setWikisourceLoading,
      // No seed fallback — the seed list is all Project Gutenberg,
      // and painting Gutenberg books under a "From Wikisource"
      // header would be misleading. If the Wikisource fetch fails,
      // the rail simply doesn't render (gated by the
      // `wikisourceRail.length > 0` conditional below).
    );

    // Background fetch of the FULL Standard Ebooks catalog (~1200
    // entries) into the search pool. NOT rendered as a rail — its
    // only job is to feed localMatches so search across "all the
    // libraries" actually works even when Gutendex search misses a
    // Standard Ebooks-only title.
    //
    // Depends on the edge function's MAX_LIMIT being ≥1200; we
    // bumped it from 100 → 1500 alongside this. If the deploy of
    // `discover-standard-ebooks` hasn't shipped, the function will
    // silently cap at 100 and the pool will be smaller — still
    // works, just less coverage.
    void (async () => {
      // Bigger background slice of Wikisource validated texts for the
      // local search pool. Capped at the edge function's MAX_LIMIT
      // (200). Combined with the Open Library pool below, this gives
      // the typeahead meaningful coverage across all three sources.
      const result = await fetchWikisource({ limit: 200, feed: 'validated' });
      if (result.ok) {
        console.log(
          '[Discover] Wikisource search pool fetch ok, books:',
          result.books.length,
        );
        // Reshape to screen-shape (adds coverColor / coverLabel) so
        // typeahead matches against the pool render the same fields
        // as the rails. Without this, pool entries flowed in as
        // ApiBook and the type union was wider-than-state — TS
        // flagged it and the runtime render fell back to `undefined`
        // for `coverColor`, which manifested as black-cover cards in
        // search results.
        setWikisourcePool(result.books.map(fromApiBook));
      } else {
        console.warn(
          '[Discover] Wikisource search pool fetch FAILED:',
          result.error,
        );
      }
    })();

    // ─── Open Library rail + search pool ────────────────────────────
    // Same pattern as Standard Ebooks above: one foreground fetch for
    // the visible rail (24 books, sorted by edition count = popular
    // classics), one larger background fetch for the search pool.
    // Open Library's catalog has millions of records, but we cap the
    // pool at the edge function's MAX_LIMIT (500) — that's plenty of
    // typeahead coverage without ballooning the bridge payload.
    void loadShelf(
      'source:open-library',
      async () => {
        const result = await fetchOpenLibrary({ limit: 24, feed: 'classics' });
        if (result.ok) {
          console.log(
            '[Discover] Open Library rail fetch ok, books:',
            result.books.length,
          );
        } else {
          console.warn(
            '[Discover] Open Library rail fetch FAILED:',
            result.error,
          );
        }
        return result;
      },
      setOpenLibraryRail,
      setOpenLibraryLoading,
    );
    void (async () => {
      const result = await fetchOpenLibrary({ limit: 500, feed: 'classics' });
      if (result.ok) {
        console.log(
          '[Discover] Open Library search pool fetch ok, books:',
          result.books.length,
        );
        // Reshape — see comment on the Wikisource pool setter above.
        setOpenLibraryPool(result.books.map(fromApiBook));
      } else {
        console.warn(
          '[Discover] Open Library search pool fetch FAILED:',
          result.error,
        );
      }
    })();

    // ─── DOAB rail (academic OA via REST adapter) ────────────────────
    // Peer-reviewed open-access scholarly titles. Fills the
    // contemporary-academic gap left by the pre-1928 public-domain
    // sources. Served via discover-doab edge function, which queries
    // DOAB's REST API and filters to records with OAPEN-hosted PDFs
    // (single allowlisted host).
    //
    // Cache key bumped to :v2 — :v1 entries written by the first
    // version of the adapter encoded card ids as `doab:{doab_uuid}`,
    // which the reverse-mapping in `libraryIds` (above) can't
    // reconstruct from `books.source_url`. The current adapter
    // encodes `doab:{oapen_book_id}` so the reverse-map works, but
    // any app install that already wrote a v1 cache entry would
    // keep showing stale ids until the 30-min TTL expired —
    // bumping the version skips that purgatory and rebuilds from
    // a fresh fetch immediately.
    void loadShelf(
      'source:doab:v2',
      async () => {
        const result = await fetchDoabRest({ limit: 24 });
        if (result.ok) {
          console.log(
            '[Discover] DOAB rail fetch ok, books:',
            result.books.length,
          );
        } else {
          console.warn('[Discover] DOAB rail fetch FAILED:', result.error);
        }
        return result;
      },
      setDoabRail,
      setDoabLoading,
    );

    // Pre-warm the category caches in the background so the first time
    // the user taps a category chip / "See all" the data is already
    // sitting in AsyncStorage AND the in-memory mirror. Each prefetch
    // is a no-op if a fresh cache entry already exists.
    //
    // No longer throttled — the home-shelf fetches are already in
    // flight by the time this loop runs, and the prewarm requests are
    // light. A short stagger inside the loop spreads them so all 12
    // don't hit Gutendex on the same tick (it has been known to rate-
    // limit bursts from the same IP).
    let prewarmIndex = 0;
    const prewarmCategory = (cat: Exclude<Category, 'For you'>) => {
      const topic = CATEGORY_TOPIC[cat];
      const cacheKey = `category:${cat}`;
      void (async () => {
        // Fast path: memory peek. The hydrate kicked off above might
        // have already populated this; if so, skip the network.
        if (peekCachedShelf<DiscoverBook>(cacheKey)) return;
        const cached = await getCachedShelf<DiscoverBook>(cacheKey);
        if (cancelled) return;
        if (cached && cached.length > 0) return; // already warm on disk
        const result = await topicGutenberg(topic, { limit: 12 });
        if (cancelled || !result.ok) return;
        void setCachedShelf(cacheKey, result.books.map(fromApiBook));
      })();
    };
    const prewarmIntervalId = setInterval(() => {
      if (cancelled) {
        clearInterval(prewarmIntervalId);
        return;
      }
      // Find the next non-prewarmed category and kick it off.
      while (prewarmIndex < CATEGORIES.length) {
        const cat = CATEGORIES[prewarmIndex++]!;
        if (cat === 'For you') continue;
        prewarmCategory(cat as Exclude<Category, 'For you'>);
        return;
      }
      clearInterval(prewarmIntervalId);
    }, 120); // 120ms stagger between category prewarm requests

    return () => {
      cancelled = true;
      clearInterval(prewarmIntervalId);
    };
  }, [refreshKey]);

  // Category fetch — runs whenever the category view opens with a
  // non-"For you" pick. Layered SWR:
  //   1. If we have cached data, paint it instantly.
  //   2. Otherwise paint the baked-in seed so the screen is never
  //      blank — better than a spinner over an empty canvas. The
  //      seed list is generic classics; not perfect for "Mystery" or
  //      "Romance", but a far better fallback than nothing.
  //   3. Background-fetch fresh data (12 books, not 24 — Gutendex
  //      responds faster on smaller pages and the user only sees
  //      ~6-8 cards above the fold anyway).
  //   4. Same "never blank" rule as the home shelves: an empty
  //      network result doesn't clear what's already on screen.
  useEffect(() => {
    if (view !== 'category') return;
    if (activeCategory === 'For you') {
      // "For you" reuses the popular feed — already loaded.
      setCategoryBooks(popular);
      setCategoryLoading(false);
      return;
    }
    let cancelled = false;
    let displayed: DiscoverBook[] = [];
    const cacheKey = `category:${activeCategory}`;

    // Synchronous peek — when the prewarm (or a prior visit) populated
    // the memory mirror, the user sees the books in the same frame as
    // the tap, no spinner. Only set `categoryLoading: true` when we
    // genuinely have nothing to show, so cold-cache opens still get a
    // loading state but warm opens skip the flash.
    const peeked = peekCachedShelf<DiscoverBook>(cacheKey);
    if (peeked && peeked.length > 0) {
      displayed = peeked;
      setCategoryBooks(peeked);
      setCategoryLoading(false);
    } else if (DISCOVER_SEED.length > 0) {
      // Cold cache → render the seed so the user sees content
      // immediately. Loading flag stays true so the title shows
      // "Loading…" until fresh data lands.
      displayed = DISCOVER_SEED.map(fromApiBook);
      setCategoryBooks(displayed);
      setCategoryLoading(true);
    } else {
      setCategoryLoading(true);
    }

    void (async () => {
      // Memory peek already covered the hot path. Async getCachedShelf
      // here exists for the case where memory was empty but disk has
      // a fresh entry — e.g. cold app launch where hydration hasn't
      // completed when the user taps a chip.
      if (displayed.length === 0) {
        const cached = await getCachedShelf<DiscoverBook>(cacheKey);
        if (cancelled) return;
        if (cached && cached.length > 0) {
          displayed = cached;
          setCategoryBooks(cached);
          setCategoryLoading(false);
        }
      }

      const topic = CATEGORY_TOPIC[activeCategory];
      const result = await topicGutenberg(topic, { limit: 12 });
      if (cancelled) return;
      if (result.ok) {
        const books = result.books.map(fromApiBook);
        if (books.length > 0) {
          setCategoryBooks(books);
          void setCachedShelf(cacheKey, books);
        }
        // Empty results: keep whatever we already painted (cache or
        // seed). Avoids the "rail blanked out after network call"
        // bug we hit on the home shelves.
      } else if (displayed.length === 0) {
        setCategoryBooks([]);
      }
      setCategoryLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, activeCategory, popular]);

  // ── Local suggestion pool ──────────────────────────────────────────────
  // Union of every Discover book we've already seen this session —
  // home rails, prewarmed categories, and prior search hits. Used to
  // surface instant typeahead suggestions while the network query is
  // still debouncing / in flight. De-duped by id so a book that
  // appears in multiple rails counts once.
  const localPool = useMemo<DiscoverBook[]>(() => {
    const seen = new Map<string, DiscoverBook>();
    for (const list of [
      popular,
      fictionRail,
      shortReads,
      spiritualRail,
      wikisourceRail,
      openLibraryRail,
      // Big Standard Ebooks slice — invisible to the user, fuels the
      // typeahead so a search for a Standard Ebooks-only title hits
      // immediately instead of waiting for the Gutendex network call
      // to come back empty.
      wikisourcePool,
      // Same logic for Open Library — a 500-book invisible slice
      // fuels typeahead against titles that aren't on the visible
      // rail. Combined with the SE pool this covers a healthy
      // chunk of the multi-library search space.
      openLibraryPool,
      doabRail,
    ]) {
      for (const b of list) if (!seen.has(b.id)) seen.set(b.id, b);
    }
    // Fold in cached search results too — every previous query the
    // user ran contributes its books to the pool, so a re-search
    // covering similar terms has rich local matches.
    for (const cachedList of searchCache.values()) {
      for (const b of cachedList) if (!seen.has(b.id)) seen.set(b.id, b);
    }
    // Cold-start fallback: seed list. Better than an empty pool on
    // a fresh app launch where no shelves have loaded yet.
    if (seen.size === 0) {
      for (const b of DISCOVER_SEED.map(fromApiBook)) {
        if (!seen.has(b.id)) seen.set(b.id, b);
      }
    }
    return Array.from(seen.values());
  }, [
    popular,
    fictionRail,
    shortReads,
    spiritualRail,
    wikisourceRail,
    openLibraryRail,
    wikisourcePool,
    openLibraryPool,
    doabRail,
  ]);

  // Filter the local pool by substring match against title + author +
  // tags. Cheap (~40-200 books, single pass). Returns at most 8 so
  // the typeahead doesn't overwhelm the screen before the real
  // search comes back with the full 12.
  const localMatches = useCallback(
    (q: string): DiscoverBook[] => {
      if (!q) return [];
      const needle = q.toLowerCase();
      const hits: DiscoverBook[] = [];
      for (const b of localPool) {
        if (hits.length >= 8) break;
        if (
          b.title.toLowerCase().includes(needle) ||
          b.author.toLowerCase().includes(needle) ||
          b.tags.some((t) => t.toLowerCase().includes(needle))
        ) {
          hits.push(b);
        }
      }
      return hits;
    },
    [localPool],
  );

  // Search effect. Two-stage:
  //   1. Synchronous local typeahead — fires on every keystroke
  //      against the in-memory pool. Zero latency, no spinner.
  //   2. Debounced network search (150ms) hits Gutendex for results
  //      that weren't in the pool, with a hard 4-second cap. On
  //      timeout we abort the request and either keep the local
  //      matches (better than blanking) or show the empty state with
  //      the "Request this book" CTA.
  //
  // Why the 4-second cap: Gutendex can occasionally take 6-15 s on
  // cold or heavy queries, and an open-ended spinner reads as
  // "broken" to testers. 4 s is long enough that fast queries still
  // land successfully and short enough that we never trap the user
  // watching a wheel spin. Repeat queries hit the cache and skip
  // the network entirely.
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    // 1. Cache hit → render instantly, skip the network round-trip
    //    entirely. Most repeated searches land here.
    const cached = searchCache.get(q);
    if (cached) {
      setSearchResults(cached);
      setSearching(false);
      return;
    }

    // 2. Cold cache → paint local matches immediately so the user
    //    sees SOMETHING within a frame of the keystroke, then fire
    //    the debounced network search. `searching` stays true so
    //    the inline spinner next to the input keeps signaling
    //    "fresh results coming".
    const localHits = localMatches(q);
    if (localHits.length > 0) {
      setSearchResults(localHits);
    }
    // Don't blank out previously-shown results while a new query
    // debounces; keep showing whatever we had so the user doesn't
    // see a flash of empty space between keystrokes.
    setSearching(true);

    const controller = new AbortController();
    // Hard cap on how long we'll show the spinner. After 4 s we
    // abort the Gutendex fetch (so the error.name === 'AbortError'
    // path fires inside fetchGutendex) and fall through to the
    // empty-state / local-only branch.
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const debounceId = setTimeout(async () => {
      const result = await searchGutenberg(q, {
        limit: 12,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (result.ok) {
        const networkBooks = result.books.map(fromApiBook);
        // Merge: network first (more relevant — title/author/topic
        // graded by Gutendex's own scoring), then local-only ids
        // the network didn't include. Keeps total under ~15.
        const seenIds = new Set(networkBooks.map((b) => b.id));
        const merged = [
          ...networkBooks,
          ...localHits.filter((b) => !seenIds.has(b.id)),
        ].slice(0, 15);
        setSearchResults(merged);
        searchCache.set(q, merged);
      } else if (localHits.length === 0) {
        // Either Gutendex returned an error OR our 4-second timeout
        // fired and aborted the request. Either way: nothing local
        // to fall back to, so show the empty-state surface which
        // carries the "Request this book" CTA.
        setSearchResults([]);
      }
      setSearching(false);
    }, 150);

    return () => {
      clearTimeout(debounceId);
      clearTimeout(timeoutId);
      // Abort any in-flight request when the effect re-runs (user
      // typed another character, navigated away, etc.) so we don't
      // leak Gutendex traffic or land late results that overwrite
      // a fresher query's render.
      controller.abort();
    };
  }, [searchQuery, localMatches]);

  /**
   * Tap the "Add" button on a Discover card → kick off the real import
   * flow. The Edge Function now returns as soon as the books row is
   * inserted (download / upload / process happen in the background),
   * so this resolves in under a second. We clear the pending spinner
   * the moment the bookId is back — the book is in the user's
   * library at that point, just with a "Processing…" status badge.
   *
   * Re-tapping a book that's already in the library is a no-op (the
   * button reads "In library" and is non-interactive in that state).
   */
  const handleAddToLibrary = async (book: DiscoverBook) => {
    if (libraryIds.has(book.id) || pendingIds.has(book.id)) return;
    setPendingIds((prev) => new Set(prev).add(book.id));
    const result = await importDiscoverBook(book);
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(book.id);
      return next;
    });
    if (!result.ok) {
      Alert.alert("Couldn't add book", importErrorMessage(result.error));
    }
  };

  /**
   * Remove a previously-added Discover book from the library. We
   * look up the actual Supabase book id by reverse-matching
   * source_url (the Discover id format is `gutenberg:NNN`; the
   * stored source_url contains `/NNN.epub.something`). After
   * confirming via native Alert, we clear storage + delete the row
   * — the `useBooks` realtime subscription removes the id from
   * `libraryIds` automatically, flipping the AddPill back to "Add".
   */
  const handleRemoveFromLibrary = useCallback(
    (book: DiscoverBook) => {
      // Find the matching DB row by reversing the source_url match
      // we use to build libraryIds. Tries Gutenberg first, then
      // Standard Ebooks — same shapes as the libraryIds memo.
      const match = userBooks.find((b) => {
        const url = b.source_url;
        if (!url) return false;
        const gutMatch = url.match(/gutenberg\.org\/.*?\/(\d+)/);
        if (gutMatch) return `gutenberg:${gutMatch[1]}` === book.id;
        const seMatch = url.match(
          /standardebooks\.org\/ebooks\/([^/]+\/[^/]+)/,
        );
        if (seMatch) return `standard-ebooks:${seMatch[1]}` === book.id;
        return false;
      });
      if (!match) {
        Alert.alert(
          'Already removed',
          'This book is no longer in your library.',
        );
        return;
      }
      Alert.alert(
        'Remove from library?',
        `"${book.title}" will be removed from your library along with any saved progress.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  // Clear the user's storage prefix for this book
                  // first so the row delete doesn't orphan files.
                  if (user) {
                    const prefix = `${user.id}/${match.id}`;
                    const { data: objects } = await supabase.storage
                      .from('books')
                      .list(prefix);
                    if (objects?.length) {
                      await supabase.storage
                        .from('books')
                        .remove(
                          objects.map(
                            (o: { name: string }) => `${prefix}/${o.name}`,
                          ),
                        );
                    }
                  }
                  // Cascade deletes chapters / pages / audio_cache.
                  const { error } = await supabase
                    .from('books')
                    .delete()
                    .eq('id', match.id);
                  if (error) {
                    console.warn('[Discover] removeBook delete failed:', error);
                    Alert.alert("Couldn't remove", formatNetworkError(error, 'removing this book'));
                  }
                  // realtime in useBooks() updates libraryIds for us
                } catch (err) {
                  console.warn('[Discover] removeBook threw:', err);
                  Alert.alert("Couldn't remove", formatNetworkError(err, 'removing this book'));
                }
              })();
            },
          },
        ],
      );
    },
    [userBooks],
  );

  // Drop any pendingIds that have made it into libraryIds — keeps the
  // pending state in sync with the realtime feed without leaking.
  useEffect(() => {
    if (pendingIds.size === 0) return;
    let changed = false;
    const next = new Set(pendingIds);
    for (const id of pendingIds) {
      if (libraryIds.has(id)) {
        next.delete(id);
        changed = true;
      }
    }
    if (changed) setPendingIds(next);
  }, [libraryIds, pendingIds]);

  const openDetail = (book: DiscoverBook, from: 'home' | 'category') => {
    setDetailBook(book);
    setDetailFrom(from);
    setView('detail');
  };

  const openCategory = (cat: Category) => {
    setActiveCategory(cat);
    setView('category');
  };

  if (view === 'detail' && detailBook) {
    return (
      <DetailView
        book={detailBook}
        inLibrary={libraryIds.has(detailBook.id)}
        pending={pendingIds.has(detailBook.id)}
        onBack={() => setView(detailFrom)}
        onAdd={() => handleAddToLibrary(detailBook)}
        onRemove={() => handleRemoveFromLibrary(detailBook)}
        onTabChange={onTabChange}
      />
    );
  }

  if (view === 'category') {
    return (
      <CategoryView
        category={activeCategory}
        books={categoryBooks}
        loading={categoryLoading}
        libraryIds={libraryIds}
        pendingIds={pendingIds}
        onAdd={handleAddToLibrary}
        onRemove={handleRemoveFromLibrary}
        onBook={(b) => openDetail(b, 'category')}
        // Back from category lands on Discover home AND resets the
        // active category to "For you" — a category chip stays
        // visually selected while you're in the category, but once
        // you back out the home view should feel fresh, not like
        // you're still drilled into Christianity / Fiction / etc.
        onBack={() => {
          setView('home');
          setActiveCategory('For you');
        }}
        onTabChange={onTabChange}
      />
    );
  }

  return (
    <HomeView
      activeCategory={activeCategory}
      featured={featured}
      gatsbyRail={fictionRail}
      shortReads={shortReads}
      spiritualRail={spiritualRail}
      wikisourceRail={wikisourceRail}
      openLibraryRail={openLibraryRail}
      doabRail={doabRail}
      libraryIds={libraryIds}
      pendingIds={pendingIds}
      loading={homeLoading}
      error={homeError}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      searchResults={searchResults}
      searching={searching}
      onAdd={handleAddToLibrary}
      onRemove={handleRemoveFromLibrary}
      onCategory={openCategory}
      onBook={(b) => openDetail(b, 'home')}
      onTabChange={onTabChange}
      refreshing={refreshing}
      onRefresh={onPullToRefresh}
    />
  );
}

// ─── Home view ────────────────────────────────────────────────────────────────

function HomeView({
  activeCategory,
  featured,
  gatsbyRail,
  shortReads,
  spiritualRail,
  wikisourceRail,
  openLibraryRail,
  doabRail,
  libraryIds,
  pendingIds,
  loading,
  error,
  searchQuery,
  onSearchChange,
  searchResults,
  searching,
  onAdd,
  onRemove,
  onCategory,
  onBook,
  onTabChange,
  refreshing,
  onRefresh,
}: {
  activeCategory: Category;
  featured: DiscoverBook | null;
  gatsbyRail: DiscoverBook[];
  shortReads: DiscoverBook[];
  spiritualRail: DiscoverBook[];
  wikisourceRail: DiscoverBook[];
  openLibraryRail: DiscoverBook[];
  doabRail: DiscoverBook[];
  libraryIds: Set<string>;
  pendingIds: Set<string>;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchResults: DiscoverBook[] | null;
  refreshing: boolean;
  onRefresh: () => void;
  searching: boolean;
  onAdd: (book: DiscoverBook) => void;
  /** Remove handler — when present, "In library" pills become tappable. */
  onRemove: (book: DiscoverBook) => void;
  onCategory: (cat: Category) => void;
  onBook: (book: DiscoverBook) => void;
  onTabChange: (tab: TabKey) => void;
}) {
  const showSearchResults = searchQuery.trim().length > 0;

  // Hardware back while a search is active clears the query and
  // returns the user to the Discover home (rails + categories)
  // instead of bubbling up to the root "Press back again to exit"
  // toast. Matches the platform convention that back closes the
  // current view's overlay state before exiting the app.
  useBackHandler(() => {
    if (showSearchResults) {
      onSearchChange('');
      return true;
    }
    return false;
  });

  // Slow-network surface. The home rails fetch from Gutendex (and
  // soon other libraries) on first paint, and search fires a fresh
  // network query per term. If either is still pending after 5s,
  // the user is almost certainly on a flaky connection — show the
  // banner so they're not staring at an empty screen wondering if
  // the app is broken.
  const isHomeSlow = useSlowOp(loading);
  const isSearchSlow = useSlowOp(showSearchResults && searching);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {(isHomeSlow || isSearchSlow) && (
        <SlowNetworkBanner
          label={
            isSearchSlow
              ? 'Searching is taking longer than usual — check your connection.'
              : 'Loading is taking longer than usual — check your connection.'
          }
        />
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.colors.forest[800]}
            colors={[tokens.colors.forest[800]]}
          />
        }
      >
        {/* Header */}
        <View style={s.homeHeader}>
          <Text style={s.homeTitle}>Discover</Text>
        </View>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Icon name="Search" size={16} color={tokens.colors.ink[400]} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search books…"
            placeholderTextColor={tokens.colors.ink[400]}
            style={s.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searching && (
            <ActivityIndicator size="small" color={tokens.colors.ink[400]} />
          )}
        </View>

        {showSearchResults ? (
          <SearchResults
            query={searchQuery}
            results={searchResults}
            searching={searching}
            libraryIds={libraryIds}
            pendingIds={pendingIds}
            onBook={onBook}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        ) : (
          <>
            {/* Category chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipScroll}
            >
              {CATEGORIES.map((cat) => {
                const active = cat === activeCategory;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => (cat !== 'For you' ? onCategory(cat) : undefined)}
                    style={[s.chip, active ? s.chipActive : s.chipInactive]}
                  >
                    <Text
                      style={[
                        s.chipText,
                        { color: active ? tokens.colors.cream[50] : tokens.colors.ink[700] },
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {loading ? (
              <View style={s.loadingZone}>
                <ActivityIndicator
                  size="small"
                  color={tokens.colors.forest[800]}
                />
                <Text style={s.loadingText}>Loading free books…</Text>
              </View>
            ) : error ? (
              <View style={s.errorZone}>
                <Text style={s.errorTitle}>Couldn't reach the catalog</Text>
                <Text style={s.errorBody}>
                  {/* Map the raw fetcher error through the shared
                      friendly formatter so the user never sees stack-
                      trace-shaped strings here. Append the retry hint
                      separately so it survives the message swap. */}
                  {formatNetworkError(error, 'reaching the catalog')} Pull
                  down to retry, or upload a book manually from the Library.
                </Text>
              </View>
            ) : (
              <>
                {/* Featured this week */}
                {featured && (
                  <>
                    <View style={[s.sectionRow, { marginBottom: 10 }]}>
                      <Text style={s.sectionTitle}>Featured this week</Text>
                    </View>
                    <FeaturedCard
                      book={featured}
                      inLibrary={libraryIds.has(featured.id)}
                      pending={pendingIds.has(featured.id)}
                      onPress={() => onBook(featured)}
                      onAdd={() => onAdd(featured)}
                    />
                  </>
                )}

                {/* Popular fiction. Mid-refresh, swap the real
                    cards for skeleton placeholders even when we
                    have cached books — gives the user visible
                    feedback that the pull-to-refresh actually
                    refreshed something rather than no-oping. */}
                {(refreshing || gatsbyRail.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>Popular fiction</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => onCategory('Fiction')}
                      >
                        <Text style={s.seeAll}>See all →</Text>
                      </Pressable>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.railScroll}
                      >
                        {gatsbyRail.map((book) => (
                          <RailCard
                            key={book.id}
                            book={book}
                            inLibrary={libraryIds.has(book.id)}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* Spiritual classics — Gutenberg's Christianity bookshelf.
                 *  Augustine, à Kempis, Bunyan, Edwards, Wesley, Spurgeon
                 *  + theology and church history. Renders before "Short
                 *  reads" so the rhythm goes long-form → long-form →
                 *  short-form down the page. */}
                {(refreshing || spiritualRail.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>Spiritual classics</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => onCategory('Christianity')}
                      >
                        <Text style={s.seeAll}>See all →</Text>
                      </Pressable>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.railScroll}
                      >
                        {spiritualRail.map((book) => (
                          <RailCard
                            key={book.id}
                            book={book}
                            inLibrary={libraryIds.has(book.id)}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* Curated classics — Wikisource validated texts
                 *  with the obvious non-books (legislative bills,
                 *  war posters, regulatory orders) filtered out via
                 *  a title-pattern heuristic in the edge function. */}
                {(refreshing || wikisourceRail.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>Curated classics</Text>
                      <Text style={s.sectionSubLabel}>
                        From Wikisource
                      </Text>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.railScroll}
                      >
                        {wikisourceRail.map((book) => (
                          <RailCard
                            key={book.id}
                            book={book}
                            inLibrary={libraryIds.has(book.id)}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* Internet Archive classics — Open Library's catalog
                 *  filtered to public-domain titles with downloadable
                 *  EPUBs on archive.org. Sorted by edition count so the
                 *  most-republished works (often the genuine classics)
                 *  lead the rail. Third source after Gutenberg + SE;
                 *  fills coverage gaps for everything those two miss. */}
                {(refreshing || openLibraryRail.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>From the Internet Archive</Text>
                      <Text style={s.sectionSubLabel}>
                        Via Open Library
                      </Text>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.railScroll}
                      >
                        {openLibraryRail.map((book) => (
                          <RailCard
                            key={book.id}
                            book={book}
                            inLibrary={libraryIds.has(book.id)}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* DOAB rail — peer-reviewed open-access academic
                 *  titles via the DOAB REST adapter. Records that
                 *  appear here have OAPEN-hosted PDFs that pass our
                 *  import-from-url allowlist. */}
                {(refreshing || doabRail.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>Academic books</Text>
                      <Text style={s.sectionSubLabel}>
                        From DOAB (open access)
                      </Text>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.railScroll}
                      >
                        {doabRail.map((book) => (
                          <RailCard
                            key={book.id}
                            book={book}
                            inLibrary={libraryIds.has(book.id)}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}

                {/* Short reads */}
                {(refreshing || shortReads.length > 0) && (
                  <>
                    <View style={s.sectionRow}>
                      <Text style={s.sectionTitle}>Short reads</Text>
                      <Pressable
                        hitSlop={8}
                        onPress={() => onCategory('Short reads')}
                      >
                        <Text style={s.seeAll}>See all →</Text>
                      </Pressable>
                    </View>
                    {refreshing ? (
                      <RailSkeletonRow />
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={[s.railScroll, { paddingBottom: 28 }]}
                      >
                        {shortReads.map((book) => (
                          <ShortCard
                            key={book.id}
                            book={book}
                            onPress={() => onBook(book)}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

/**
 * Vertical list of search hits. Each row is a single tappable book
 * card with cover, title, author, and an Add toggle. Empty state shows
 * "No matches" so the user knows the request landed but came back empty.
 */
function SearchResults({
  query,
  results,
  searching,
  libraryIds,
  pendingIds,
  onBook,
  onAdd,
  onRemove,
}: {
  query: string;
  results: DiscoverBook[] | null;
  searching: boolean;
  libraryIds: Set<string>;
  pendingIds: Set<string>;
  onBook: (book: DiscoverBook) => void;
  onAdd: (book: DiscoverBook) => void;
  onRemove: (book: DiscoverBook) => void;
}) {
  // Three render states:
  //   - results=null AND searching → first-ever query, no local
  //     match (rare since localPool covers the most common
  //     searches). Show a small loading zone.
  //   - results=null OR results=[] AND NOT searching → network
  //     came back empty. Show "No matches" + a "Request this book"
  //     affordance (sends a pre-filled email so we can prioritise
  //     adding it to the catalog).
  //   - results=[…] → render the list. Searching state surfaces as
  //     the inline spinner next to the input (not in this component).
  if (results === null) {
    if (searching) {
      return (
        <View style={s.loadingZone}>
          <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
        </View>
      );
    }
    return null;
  }
  if (results.length === 0) {
    return <SearchEmptyState query={query} />;
  }
  return (
    <View style={s.catBookList}>
      {results.map((book, i) => (
        <View key={book.id}>
          {i > 0 && <View style={s.catDivider} />}
          <Pressable onPress={() => onBook(book)} style={s.catBookCard}>
            <CoverBox
              style={s.catBookCover}
              book={book}
              fallbackTextStyle={s.catCoverText}
            />
            <View style={s.catBookInfo}>
              <Text style={s.catBookTitle} numberOfLines={2}>
                {book.title}
              </Text>
              <Text style={s.catBookAuthor} numberOfLines={1}>
                {book.author}
              </Text>
              <View style={s.catTags}>
                {book.tags.slice(0, 2).map((tag) => (
                  <View key={tag} style={s.catTag}>
                    <Text style={s.catTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
              <AddPill
                book={book}
                inLibrary={libraryIds.has(book.id)}
                pending={pendingIds.has(book.id)}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            </View>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/**
 * Empty-state surface for a search that returned zero results.
 *
 * Instead of a one-shot "Request this book" button (which depended
 * on the device having a native mail app set up — many Android
 * testers don't), this surface lets the user assemble the request
 * by tapping each piece individually. Three rows, each tappable to
 * copy that exact string to the clipboard:
 *
 *   1. The support address.
 *   2. A pre-baked subject line ("Book request").
 *   3. A pre-baked body referencing the user's search term, so the
 *      operator knows exactly what was requested without the user
 *      having to retype the title.
 *
 * The user then opens whichever mail surface they actually use
 * (Gmail web in Chrome, Outlook, Yahoo, whatever) and pastes the
 * three pieces into the right slots. Slower than a mailto handoff
 * for users WITH a native mail app, but it works reliably on
 * every device — and matches the same one-tap-to-copy pattern
 * the Send feedback screen uses.
 */
function SearchEmptyState({ query }: { query: string }) {
  const trimmed = query.trim();
  // Single piece of "which row was just tapped" state so the
  // affordance can briefly flip the icon to a check and the hint
  // to "Copied" for ~1.8s before resetting. One source of truth so
  // tapping a different row before the timer fires also clears
  // the previous row's confirmation.
  const [copiedField, setCopiedField] = useState<
    'email' | 'subject' | 'body' | null
  >(null);

  // Body intentionally short and warm — operators (which is just
  // me right now) need enough to know which book without wading
  // through copy. Two short sentences keep it scannable in the
  // Gmail thread list and doesn't feel like a form letter.
  const subject = 'Book request';
  const body =
    `Hi Bookflow team,\n\n` +
    `I was looking for "${trimmed}" but couldn't find it in your ` +
    `catalog. Could you add it? Thanks!`;

  const handleCopy = useCallback(
    async (field: 'email' | 'subject' | 'body', value: string) => {
      try {
        await Clipboard.setStringAsync(value);
        setCopiedField(field);
        setTimeout(() => {
          // Only clear if this row is still the active one — if
          // the user tapped another row in the meantime, that
          // row's own timer owns the reset.
          setCopiedField((current) => (current === field ? null : current));
        }, 1800);
      } catch {
        // Clipboard writes are essentially infallible on modern
        // Android / iOS; if it ever fails the user can long-press
        // the visible text to select + copy manually.
      }
    },
    [],
  );

  return (
    <View style={s.searchRequestZone}>
      <Text style={s.errorTitle}>No matches</Text>
      <Text style={s.errorBody}>
        We couldn't find "{trimmed}" in our catalog. Tap each field
        below to copy it, then paste into your mail app to request
        this book.
      </Text>

      <View style={s.requestCardStack}>
        <CopyableRow
          value={SUPPORT_EMAIL}
          copied={copiedField === 'email'}
          onPress={() => handleCopy('email', SUPPORT_EMAIL)}
          accessibilityLabel={`Copy support email ${SUPPORT_EMAIL}`}
        />
        <CopyableRow
          label="Subject"
          value={subject}
          copied={copiedField === 'subject'}
          onPress={() => handleCopy('subject', subject)}
          accessibilityLabel="Copy subject line"
        />
        <CopyableRow
          label="Body"
          value={body}
          multiline
          copied={copiedField === 'body'}
          onPress={() => handleCopy('body', body)}
          accessibilityLabel="Copy email body"
        />
      </View>
    </View>
  );
}

/**
 * One row of the "request a book" stack — tappable card showing a
 * labelled value with a copy/check icon. Used three times in
 * SearchEmptyState (email, subject, body) so the visual + tap
 * behaviour stays consistent across all three.
 */
function CopyableRow({
  label,
  value,
  multiline,
  copied,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        s.copyCard,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={s.copyCardBody}>
        {label && <Text style={s.copyCardLabel}>{label}</Text>}
        <Text
          style={s.copyCardValue}
          numberOfLines={multiline ? 4 : 1}
        >
          {value}
        </Text>
      </View>
      <Icon
        name={copied ? 'Check' : 'Copy'}
        size={16}
        color={
          copied ? tokens.colors.forest[700] : tokens.textColors.muted
        }
      />
    </Pressable>
  );
}

/**
 * Compact pill rendered on category + search rows. Three states:
 *   - default: forest button "Add"
 *   - pending: forest button with a spinner instead of "Add"
 *   - in-library: muted pill "In library" (non-interactive)
 *
 * Centralised so SearchResults + CategoryView render the same control
 * without duplicating the three-state logic at every site.
 */
function AddPill({
  book,
  inLibrary,
  pending,
  onAdd,
  onRemove,
}: {
  book: DiscoverBook;
  inLibrary: boolean;
  pending: boolean;
  onAdd: (book: DiscoverBook) => void;
  /**
   * Remove handler — when present + `inLibrary` is true, the pill
   * becomes a tappable "Remove from library" affordance. Caller
   * decides whether to confirm and what to do on success. Optional
   * because some surfaces (search results inside Discover) don't
   * yet wire removal up.
   */
  onRemove?: (book: DiscoverBook) => void;
}) {
  if (inLibrary) {
    // Tappable when a remove handler is wired; falls back to a
    // static badge if not. Confirmation is the caller's
    // responsibility — we just propagate the tap.
    return (
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          if (onRemove) onRemove(book);
        }}
        style={s.catAddedBtn}
        disabled={!onRemove}
        accessibilityRole="button"
        accessibilityLabel={
          onRemove ? `Remove ${book.title} from library` : 'In library'
        }
      >
        <Icon
          name="Check"
          size={10}
          color={tokens.colors.forest[800]}
          strokeWidth={2.5}
        />
        <Text style={s.catAddedBtnText}>In library</Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        if (!pending) onAdd(book);
      }}
      style={[s.catAddBtn, pending && { opacity: 0.7 }]}
      disabled={pending}
    >
      {pending ? (
        <ActivityIndicator size="small" color={tokens.colors.cream[50]} />
      ) : (
        <Icon
          name="Plus"
          size={10}
          color={tokens.colors.cream[50]}
          strokeWidth={2.5}
        />
      )}
      <Text style={s.catAddBtnText}>{pending ? 'Adding…' : 'Add'}</Text>
    </Pressable>
  );
}

/**
 * Cover container — renders the real cover image when one is available,
 * with a colored fallback box (text on top) for books missing imagery.
 * Image errors fall back to the colored box at runtime.
 */
function CoverBox({
  book,
  style,
  fallbackTextStyle,
}: {
  book: DiscoverBook;
  style: object;
  fallbackTextStyle: object;
}) {
  const [errored, setErrored] = useState(false);
  const showImage = !!book.coverUrl && !errored;
  return (
    <View style={[style, { backgroundColor: book.coverColor, overflow: 'hidden' }]}>
      {showImage ? (
        <Image
          source={{ uri: book.coverUrl! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <Text style={fallbackTextStyle} numberOfLines={3}>
          {book.coverLabel ?? book.title}
        </Text>
      )}
    </View>
  );
}

function FeaturedCard({
  book, inLibrary, pending, onPress, onAdd,
}: {
  book: DiscoverBook;
  inLibrary: boolean;
  pending: boolean;
  onPress: () => void;
  onAdd: () => void;
}) {
  const buttonLabel = inLibrary
    ? 'In library'
    : pending
      ? 'Adding…'
      : 'Add to library';
  const buttonIcon = inLibrary ? 'Check' : 'Plus';
  return (
    <Pressable onPress={onPress} style={s.featuredCard}>
      <CoverBox
        book={book}
        style={s.featuredCoverCol}
        fallbackTextStyle={s.featuredCoverText}
      />
      <View style={s.featuredInfo}>
        <Text style={s.featuredEyebrow}>✦ Editor's pick</Text>
        <Text style={s.featuredBookTitle} numberOfLines={2}>{book.title}</Text>
        <Text style={s.featuredAuthor} numberOfLines={1}>{book.author}</Text>
        <Text style={s.featuredBlurb} numberOfLines={3}>{book.about}</Text>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            if (!inLibrary && !pending) onAdd();
          }}
          style={[
            s.featuredAddBtn,
            inLibrary && s.featuredAddBtnAdded,
            pending && { opacity: 0.7 },
          ]}
          disabled={inLibrary || pending}
        >
          {pending ? (
            <ActivityIndicator
              size="small"
              color={tokens.colors.forest[900]}
            />
          ) : (
            <Icon
              name={buttonIcon}
              size={11}
              color={inLibrary ? tokens.colors.forest[800] : tokens.colors.forest[900]}
              strokeWidth={2}
            />
          )}
          <Text
            style={[
              s.featuredAddBtnText,
              { color: inLibrary ? tokens.colors.forest[800] : tokens.colors.forest[900] },
            ]}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function RailCard({ book, inLibrary, onPress }: { book: DiscoverBook; inLibrary: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.railCard}>
      <View style={s.railCoverWrap}>
        <CoverBox
          book={book}
          style={s.railCover}
          fallbackTextStyle={s.railCoverText}
        />
        {inLibrary && (
          <View style={s.addedBadge}>
            <Icon name="Check" size={9} color={tokens.colors.cream[50]} strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={s.railCardTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={s.railCardMeta} numberOfLines={1}>{book.author}</Text>
    </Pressable>
  );
}

/**
 * Placeholder card shown in rail rows while content is loading or
 * mid-refresh. Matches the real RailCard's outer dimensions so the
 * row doesn't reflow when actual books arrive — same width, same
 * cover height, same line spacing for the title + author. Just
 * shaded blocks where the content will land. Used by the home view
 * on initial cold-start (no cache) and on pull-to-refresh (the
 * user expects something visibly happening while we re-fetch).
 */
function RailCardSkeleton() {
  return (
    <View style={s.railCard}>
      <View style={[s.railCover, s.skeletonBlock]} />
      <View style={[s.skeletonLine, { width: '90%' }]} />
      <View style={[s.skeletonLine, { width: '60%' }]} />
    </View>
  );
}

/**
 * Renders 6 RailCardSkeleton cards inside a horizontal scroll — the
 * same layout shape the real rails use. We hard-code 6 because
 * that's roughly the visible-card budget at the standard 108pt
 * card width; rendering more is wasted DOM.
 */
function RailSkeletonRow() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.railScroll}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <RailCardSkeleton key={i} />
      ))}
    </ScrollView>
  );
}

function ShortCard({ book, onPress }: { book: DiscoverBook; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.shortCard}>
      <CoverBox
        book={book}
        style={s.shortCover}
        fallbackTextStyle={s.shortCoverText}
      />
      <Text style={[s.railCardTitle, { fontSize: 11 }]} numberOfLines={2}>{book.title}</Text>
      <Text style={s.railCardMeta} numberOfLines={1}>{book.author}</Text>
    </Pressable>
  );
}

// ─── Category view ────────────────────────────────────────────────────────────

function CategoryView({
  category, books, loading, libraryIds, pendingIds, onAdd, onRemove, onBook, onBack, onTabChange,
}: {
  category: string;
  books: DiscoverBook[];
  loading: boolean;
  libraryIds: Set<string>;
  pendingIds: Set<string>;
  onAdd: (book: DiscoverBook) => void;
  /** Tap an "In library" pill to remove. Caller handles confirmation. */
  onRemove: (book: DiscoverBook) => void;
  onBook: (book: DiscoverBook) => void;
  onBack: () => void;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.catHeader}>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={8}>
          <Icon name="ArrowLeft" size={18} color={tokens.colors.ink[700]} />
        </Pressable>
        <View style={s.catHeaderInfo}>
          <Text style={s.catHeaderTitle}>{category}</Text>
          <Text style={s.catHeaderMeta}>
            {loading ? 'Loading…' : `${books.length} books · all free`}
          </Text>
        </View>
        <Pressable style={s.catFilterBtn} hitSlop={8}>
          <Icon name="Filter" size={16} color={tokens.colors.ink[700]} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Render priority:
         *   1. If we have ANY books (cache, prewarm, or seed) → show
         *      them immediately. The header already says "Loading…"
         *      so the user knows fresh results are coming; meanwhile
         *      they can browse instead of staring at a spinner.
         *   2. Truly empty + still fetching → spinner. Only happens
         *      on cold cache with no seed.
         *   3. Truly empty + done fetching → empty-state copy.
         */}
        {books.length > 0 ? (
          <View style={s.catBookList}>
            {books.map((book, i) => (
              <View key={book.id}>
                {i > 0 && <View style={s.catDivider} />}
                <Pressable onPress={() => onBook(book)} style={s.catBookCard}>
                  <CoverBox
                    book={book}
                    style={s.catBookCover}
                    fallbackTextStyle={s.catCoverText}
                  />
                  <View style={s.catBookInfo}>
                    <Text style={s.catBookTitle} numberOfLines={2}>
                      {book.title}
                    </Text>
                    <Text style={s.catBookAuthor} numberOfLines={1}>
                      {book.author}
                    </Text>
                    <View style={s.catTags}>
                      {book.tags.slice(0, 2).map((tag) => (
                        <View key={tag} style={s.catTag}>
                          <Text style={s.catTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <AddPill
                      book={book}
                      inLibrary={libraryIds.has(book.id)}
                      pending={pendingIds.has(book.id)}
                      onAdd={onAdd}
                      onRemove={onRemove}
                    />
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        ) : loading ? (
          <View style={s.loadingZone}>
            <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
          </View>
        ) : (
          <View style={s.errorZone}>
            <Text style={s.errorTitle}>No books in this category yet</Text>
            <Text style={s.errorBody}>
              Try a different category or pull up the search bar to look
              for something specific.
            </Text>
          </View>
        )}
      </ScrollView>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({
  book, inLibrary, pending, onBack, onAdd, onRemove, onTabChange,
}: {
  book: DiscoverBook;
  inLibrary: boolean;
  pending: boolean;
  onBack: () => void;
  onAdd: () => void;
  /** Remove the book from the user's library. Caller confirms. */
  onRemove: () => void;
  onTabChange: (tab: TabKey) => void;
}) {
  // Hardware back returns to whichever Discover view the user came
  // from (home rails or a category list) — same as the in-screen
  // chevron. Without this, Android's default back behaviour fell
  // through to the root "Press back again to exit" handler.
  useBackHandler(() => {
    onBack();
    return true;
  });
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.detailHeader}>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={8}>
          <Icon name="ArrowLeft" size={18} color={tokens.colors.ink[700]} />
        </Pressable>
        <Text style={s.detailHeaderTitle}>Book details</Text>
        <Pressable style={s.iconBtn} hitSlop={8}>
          <Icon name="Upload" size={17} color={tokens.colors.ink[700]} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.detailScroll}>
        <View style={s.detailCoverWrap}>
          <CoverBox
            book={book}
            style={s.detailCover}
            fallbackTextStyle={s.detailCoverText}
          />
        </View>

        <Text style={s.detailBookTitle}>{book.title}</Text>
        <Text style={s.detailAuthor}>{book.author}</Text>

        <View style={s.detailMetaRow}>
          {book.readTime && (
            <>
              <View style={s.detailMetaItem}>
                <Text style={s.detailMetaValue}>{book.readTime}</Text>
                <Text style={s.detailMetaLabel}>Read time</Text>
              </View>
              <View style={s.detailMetaDivider} />
            </>
          )}
          {typeof book.chapters === 'number' && (
            <>
              <View style={s.detailMetaItem}>
                <Text style={s.detailMetaValue}>{book.chapters}</Text>
                <Text style={s.detailMetaLabel}>Chapters</Text>
              </View>
              <View style={s.detailMetaDivider} />
            </>
          )}
          <View style={s.detailMetaItem}>
            <View style={s.freeBadge}>
              <Text style={s.freeBadgeText}>Free</Text>
            </View>
          </View>
        </View>

        <Text style={s.detailSectionLabel}>About</Text>
        <Text style={s.detailAbout}>{book.about}</Text>

        <Text style={s.detailSectionLabel}>Topics</Text>
        <View style={s.detailTags}>
          {book.tags.map((tag) => (
            <View key={tag} style={s.detailTag}>
              <Text style={s.detailTagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {(book.sourceLabel || book.source) && (
          <>
            <Text style={s.detailSectionLabel}>Source</Text>
            <Text style={s.detailSource}>
              {book.sourceLabel ?? book.source}
            </Text>
          </>
        )}

        {book.related && book.related.length > 0 && (
          <>
            <Text style={[s.detailSectionLabel, { marginBottom: 8 }]}>If you like this</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.relatedRail}>
                {book.related.map((rel) => (
                  <View key={rel.id} style={s.relatedCard}>
                    <View style={[s.relatedCover, { backgroundColor: rel.coverColor }]}>
                      <Text style={s.relatedCoverText}>{rel.title}</Text>
                    </View>
                    <Text style={s.relatedTitle} numberOfLines={2}>{rel.title}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={s.detailCTABar}>
        {/* Single primary CTA cycles through three states:
         *   - default     → "Add to library" (forest filled)
         *   - in-flight   → "Adding…" with spinner
         *   - in library  → "Remove from library" (muted, taps to
         *                    confirm + delete). Was previously a
         *                    non-interactive "In library" badge. */}
        <Pressable
          onPress={() => {
            if (pending) return;
            if (inLibrary) onRemove();
            else onAdd();
          }}
          style={[
            s.detailPrimaryBtn,
            inLibrary && s.detailPrimaryBtnAdded,
            pending && { opacity: 0.7 },
          ]}
          disabled={pending}
          accessibilityRole="button"
          accessibilityLabel={
            inLibrary
              ? `Remove ${book.title} from library`
              : `Add ${book.title} to library`
          }
        >
          {pending ? (
            <ActivityIndicator
              size="small"
              color={tokens.colors.cream[50]}
            />
          ) : (
            <Icon
              name={inLibrary ? 'Check' : 'Plus'}
              size={15}
              color={
                inLibrary ? tokens.colors.forest[800] : tokens.colors.cream[50]
              }
            />
          )}
          <Text
            style={[
              s.detailPrimaryBtnText,
              {
                color: inLibrary
                  ? tokens.colors.forest[800]
                  : tokens.colors.cream[50],
              },
            ]}
          >
            {inLibrary
              ? 'Remove from library'
              : pending
                ? 'Adding…'
                : 'Add to library'}
          </Text>
        </Pressable>
        {/* Listen-sample button — only shown for books already in
            the user's library. Playback runs against the user's
            books table row (page extraction, signed audio URLs,
            etc) and isn't wired up for un-added Discover books;
            the play affordance previously misled the user into
            thinking they could preview before adding. We hide
            rather than disable so the layout doesn't carry a dead
            control around. */}
        {inLibrary ? (
          <Pressable style={s.detailSampleBtn}>
            <Icon name="Play" size={14} color={tokens.colors.ink[700]} />
          </Pressable>
        ) : null}
      </View>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Shared
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Home
  homeHeader: {
    paddingHorizontal: 20,
    // Top padding bumped + explicit lineHeight so Fraunces' tall display
    // caps don't get clipped at the SafeAreaView edge (same fix we
    // applied to the Listen tab header).
    paddingTop: 14,
    paddingBottom: tokens.space.lg,
  },
  homeTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 36,
    color: tokens.colors.ink[900],
    letterSpacing: -0.5,
  },
  searchBar: {
    marginHorizontal: 20,
    marginBottom: tokens.space.lg,
    height: 40,
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: tokens.colors.ink[400],
    fontFamily: tokens.fonts.ui,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: tokens.colors.ink[900],
    fontFamily: tokens.fonts.ui,
    padding: 0,
  },
  loadingZone: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[400],
  },
  errorZone: {
    paddingVertical: 32,
    paddingHorizontal: 32,
    alignItems: 'center',
    gap: 6,
  },
  errorTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    color: tokens.colors.ink[900],
    textAlign: 'center',
  },
  errorBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[500],
    textAlign: 'center',
    lineHeight: 19,
  },
  // Search empty-state "request a book" surface. Tighter padding
  // than the generic errorZone so the three copy cards have room
  // to breathe inside the screen's existing horizontal margins.
  searchRequestZone: {
    paddingVertical: 24,
    paddingHorizontal: 22,
    alignItems: 'stretch',
    gap: 6,
  },
  requestCardStack: {
    marginTop: 18,
    gap: 10,
  },
  // Each copy card — value + copy icon. Tappable as a whole so
  // the user doesn't have to aim at the small icon.
  copyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  copyCardBody: {
    flex: 1,
    gap: 2,
  },
  copyCardLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
  },
  copyCardValue: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.textColors.primary,
  },
  // Rail cover needs a relative wrapper so the "in library" badge can
  // anchor to its top-right corner. The CoverBox itself paints the full
  // cover area.
  railCoverWrap: {
    position: 'relative',
  },
  chipScroll: {
    paddingHorizontal: 20,
    paddingBottom: tokens.space.lg,
    gap: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: tokens.colors.forest[800] },
  chipInactive: {
    backgroundColor: tokens.colors.cream[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
  },
  chipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.colors.ink[900],
  },
  seeAll: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.forest[800],
  },
  // Compact source-attribution label that sits in the section row in
  // lieu of a "See all →" link (used on shelves backed by sources
  // that aren't paginated through our category screen, e.g. Standard
  // Ebooks). Matches the muted secondary-label voice of seeAll
  // without the affordance styling.
  sectionSubLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },

  // Featured card
  featuredCard: {
    marginHorizontal: 20,
    marginBottom: 22,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  featuredCoverCol: {
    width: 90,
    flexShrink: 0,
    minHeight: 130,
    padding: 10,
    justifyContent: 'flex-end',
  },
  featuredCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 8,
    color: tokens.colors.forest[200],
    lineHeight: 11,
  },
  featuredInfo: {
    flex: 1,
    padding: 14,
    paddingLeft: 12,
  },
  featuredEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.forest[200],
    marginBottom: 6,
  },
  featuredBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    color: tokens.colors.cream[50],
    lineHeight: 18,
    marginBottom: 4,
  },
  featuredAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    marginBottom: 8,
  },
  featuredBlurb: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    lineHeight: 16.5,
    opacity: 0.85,
    marginBottom: 10,
  },
  featuredAddBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.amber[500],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  featuredAddBtnAdded: {
    backgroundColor: tokens.colors.forest[100],
  },
  featuredAddBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
  },

  // Rail cards
  railScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  railCard: {
    width: 108,
    gap: 7,
  },
  // Skeleton block styles — used by RailCardSkeleton above. The
  // background is a neutral surface tone so the shimmer reads as
  // "loading content" rather than "missing cover" (the colored
  // CoverBox fallback). Matches the real RailCard layout
  // dimensions so the row doesn't reflow when real cards land.
  skeletonBlock: {
    backgroundColor: tokens.bgColors.surface,
  },
  skeletonLine: {
    height: 10,
    borderRadius: 4,
    backgroundColor: tokens.bgColors.surface,
  },
  railCover: {
    width: 108,
    height: 158,
    borderRadius: 7,
    padding: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  railCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7,
    color: tokens.colors.cream[50],
    lineHeight: 9,
  },
  railCardTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 12,
    color: tokens.colors.ink[900],
    lineHeight: 15.6,
  },
  railCardMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
  addedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Short reads cards
  shortCard: {
    width: 130,
    gap: 7,
  },
  shortCover: {
    width: 130,
    height: 90,
    borderRadius: 8,
    padding: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  shortCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7.5,
    color: tokens.colors.cream[50],
    lineHeight: 10,
  },
  readTimeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  readTimeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    color: '#fff',
  },

  // Category view
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  catFilterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: tokens.colors.cream[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  catHeaderInfo: { flex: 1 },
  catHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    color: tokens.colors.ink[900],
    letterSpacing: -0.2,
  },
  catHeaderMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
    marginTop: 1,
  },
  catBookList: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  catDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    marginVertical: 14,
  },
  catBookCard: {
    flexDirection: 'row',
    gap: 14,
  },
  catBookCover: {
    width: 72,
    height: 104,
    borderRadius: 6,
    padding: 7,
    justifyContent: 'flex-end',
    flexShrink: 0,
    overflow: 'hidden',
  },
  catCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 6.5,
    color: tokens.colors.cream[50],
    lineHeight: 8.5,
  },
  catBookInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  catBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    color: tokens.colors.ink[900],
    lineHeight: 17.5,
  },
  catBookAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
  },
  catTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  catTag: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  catTagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[500],
  },
  catActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  catAddBtn: {
    // alignSelf pins the button to its content width — without it the
    // Pressable stretches to fill the parent flex column on iOS,
    // making the row look like one giant button.
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
  },
  catAddBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.cream[50],
  },
  catAddedBtn: {
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[50],
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[200],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 6,
  },
  catAddedBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  catReadTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },

  // Detail view
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  detailHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  detailScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  detailCoverWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  detailCover: {
    width: 120,
    height: 176,
    borderRadius: 8,
    padding: 10,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  detailCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 9,
    color: tokens.colors.cream[50],
    lineHeight: 11.25,
  },
  detailBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    color: tokens.colors.ink[900],
    textAlign: 'center',
    letterSpacing: -0.22,
    lineHeight: 26.4,
    marginBottom: 4,
  },
  detailAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.colors.ink[500],
    textAlign: 'center',
    marginBottom: 14,
  },
  detailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  detailMetaItem: {
    alignItems: 'center',
    gap: 3,
  },
  detailMetaValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.colors.ink[900],
  },
  detailMetaLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
  detailMetaDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    alignSelf: 'stretch',
  },
  freeBadge: {
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freeBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  detailSectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 8,
  },
  detailAbout: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[700],
    lineHeight: 21.45,
    marginBottom: 16,
  },
  detailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  detailTag: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailTagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[700],
  },
  detailSource: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
    lineHeight: 16.5,
    marginBottom: 18,
  },
  relatedRail: {
    flexDirection: 'row',
    gap: 10,
  },
  relatedCard: {
    width: 80,
  },
  relatedCover: {
    width: 80,
    height: 116,
    borderRadius: 5,
    padding: 6,
    justifyContent: 'flex-end',
    marginBottom: 5,
    overflow: 'hidden',
  },
  relatedCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 6,
    color: tokens.colors.cream[50],
    lineHeight: 7.5,
  },
  relatedTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 10,
    color: tokens.colors.ink[900],
    lineHeight: 13,
  },
  detailCTABar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.ink[200],
    backgroundColor: tokens.bgColors.canvas,
  },
  detailPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailPrimaryBtnAdded: {
    backgroundColor: tokens.colors.forest[50],
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[200],
  },
  detailPrimaryBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
  },
  detailSampleBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.cream[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
