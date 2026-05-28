/**
 * Discover API — multiple free book sources normalised into a single
 * `DiscoverBook` shape so the UI stays source-agnostic.
 *
 * Sources:
 *   - **Gutendex** (https://gutendex.com), the community REST wrapper
 *     for Project Gutenberg's catalog. ~70K public-domain books, EPUB
 *     downloads, no auth, no API key. Direct client→Gutendex fetch.
 *   - **Standard Ebooks** (https://standardebooks.org), ~1,200 hand-
 *     typeset public-domain classics. OPDS Atom feed only — we proxy
 *     it through our `discover-standard-ebooks` edge function to avoid
 *     shipping an XML parser in the RN bundle.
 *
 * Why Gutendex (not the official Gutenberg URL pattern): the canonical
 * Gutenberg site exposes a static HTML catalog and per-book RDF metadata
 * — ergonomically painful for mobile clients. Gutendex normalises
 * everything into a single JSON endpoint with sensible filters.
 *
 * Fallback considerations: if Gutendex goes down (it has — community
 * project on a single VM), readers can still browse Standard Ebooks
 * results AND upload books directly.
 *
 * Type-design note: we re-shape the upstream payload into a stable
 * `DiscoverBook` so the screen stays decoupled from upstream's
 * evolution (Gutendex has changed shape twice in the project's
 * history). The `source` field discriminates them so per-source UI
 * (badges, attribution) can branch on it.
 */
import { supabase } from '~/lib/supabase';

export type DiscoverBook = {
  /** Stable id of form `gutenberg:{n}`. The prefix lets us add other
   * sources later without id collisions. */
  id: string;
  title: string;
  author: string;
  /** ISO 639-1, e.g. 'en'. Empty string when unknown. */
  language: string;
  /** Subject tags from upstream, capped at 6 for UI breathing room. */
  tags: string[];
  /** Cover image URL, or null if no cover available. */
  coverUrl: string | null;
  /** EPUB direct-download URL. The import flow streams from here. */
  epubUrl: string | null;
  /** Mime → URL map of every format Gutendex offered. Useful for fallback
   * to plain text or Kindle if EPUB is missing for a particular book. */
  formats: Record<string, string>;
  /** Brief one-liner derived from subjects + bookshelves. Empty when
   * upstream gives us nothing useful. */
  about: string;
  /** Which catalog this book came from. Drives source badges and the
   * `import-from-url` allowlist branch. */
  source: 'gutenberg' | 'standard-ebooks' | 'open-library' | 'wikisource';
  /** Popularity proxy — Gutenberg's lifetime download count, or 0 for
   * sources that don't expose one. Used to sort within shelves where
   * a download-count signal is meaningful. */
  downloadCount: number;
};

const GUTENDEX_BASE = 'https://gutendex.com/books';
const PAGE_SIZE = 32; // Upstream default

// Gutendex raw types ────────────────────────────────────────────────────────

type GutendexAuthor = {
  name: string;
  birth_year?: number | null;
  death_year?: number | null;
};

type GutendexBook = {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  languages: string[];
  subjects: string[];
  bookshelves: string[];
  formats: Record<string, string>;
  download_count: number;
};

type GutendexResponse = {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
};

// ── Reshape ────────────────────────────────────────────────────────────────

/**
 * Normalise a Gutendex row into our internal `DiscoverBook`. Picks the
 * best cover (jpeg over png), the EPUB url (preferring the no-images
 * variant for size), and trims the subject list to the most useful tags.
 */
function reshape(row: GutendexBook): DiscoverBook {
  const author = row.authors.length > 0 ? formatAuthor(row.authors[0]!) : 'Unknown author';
  const language = row.languages[0] ?? '';

  // Cover preference: prefer jpeg (better-supported), fall back to png.
  // Wrap through images.weserv.nl — a free image-CDN proxy that pulls
  // from Gutenberg's slow origin once, caches globally, and serves a
  // resized webp. Drops first-paint cover loads from 1-3s to a few
  // hundred ms in practice. Falls back gracefully if weserv ever fails
  // (the <Image>'s onError swaps to the colored fallback box).
  const rawCover = row.formats['image/jpeg'] || row.formats['image/png'] || null;
  const coverUrl = rawCover ? proxyImage(rawCover) : null;

  // EPUB preference: Gutendex sometimes lists multiple EPUB formats:
  //   'application/epub+zip' (canonical)
  //   'application/epub+zip; charset=utf-8' (legacy mirror)
  // Pick the canonical one if present, otherwise any matching key.
  const epubKeys = Object.keys(row.formats).filter((k) =>
    k.startsWith('application/epub+zip'),
  );
  const epubUrl =
    row.formats['application/epub+zip'] ??
    (epubKeys.length > 0 ? row.formats[epubKeys[0]!]! : null);

  const tags = pickTags(row.subjects, row.bookshelves);
  const about = buildAbout(row.subjects, row.bookshelves);

  return {
    id: `gutenberg:${row.id}`,
    title: row.title,
    author,
    language,
    tags,
    coverUrl,
    epubUrl,
    formats: row.formats,
    about,
    source: 'gutenberg',
    downloadCount: row.download_count,
  };
}

function formatAuthor(a: GutendexAuthor): string {
  // Gutenberg stores authors "Last, First" — flip to natural order.
  const name = a.name.trim();
  if (!name.includes(',')) return name;
  const [last, first] = name.split(',', 2).map((s) => s.trim());
  return first ? `${first} ${last}` : last ?? name;
}

/**
 * Wrap an image URL through images.weserv.nl. Returns a much-faster
 * loading URL that's pre-resized and re-encoded as webp.
 *
 * - `w=240` matches the largest cover slot we render (the detail page
 *   cover at ~210pt with 2x density buffer)
 * - `output=webp` cuts payload ~40% vs jpeg
 * - `q=80` keeps quality high enough for cover art (no lossy text)
 * - `we` ensures upscaling is disabled when the source is smaller
 */
function proxyImage(src: string): string {
  // weserv expects the url WITHOUT the protocol prefix.
  const stripped = src.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=240&output=webp&q=80&we`;
}

function pickTags(subjects: string[], shelves: string[]): string[] {
  const cleaned = subjects
    .map((s) => s.split('--')[0]?.trim() ?? s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...cleaned, ...shelves]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

function buildAbout(subjects: string[], shelves: string[]): string {
  // Gutendex doesn't ship a description field. We synthesise something
  // brief from subjects + bookshelves so the detail page isn't empty.
  const parts = [...new Set([...subjects, ...shelves])]
    .map((s) => s.split('--')[0]?.trim() ?? s.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (parts.length === 0) return '';
  return `Subjects: ${parts.join(', ')}.`;
}

// ── Public API ─────────────────────────────────────────────────────────────

export type FetchDiscoverResult =
  | { ok: true; books: DiscoverBook[] }
  | { ok: false; error: string };

/**
 * Free-text search across titles, authors, and subjects. Filters to
 * EPUB-having books and English by default (the only language the rest
 * of the app currently supports for processing). Pass `language` to
 * widen.
 *
 * `signal` lets the caller cancel a slow request — the DiscoverScreen
 * uses this to cap search latency at 4 s and fall back to a "no
 * results" empty state so the user isn't watching an open-ended
 * spinner while Gutendex chews.
 */
export async function searchGutenberg(
  query: string,
  opts: { language?: string; limit?: number; signal?: AbortSignal } = {},
): Promise<FetchDiscoverResult> {
  const { language = 'en', limit = 20, signal } = opts;
  const url = new URL(GUTENDEX_BASE);
  url.searchParams.set('search', query);
  if (language) url.searchParams.set('languages', language);
  // Only return books that actually have an EPUB to download.
  url.searchParams.set('mime_type', 'application/epub+zip');
  return fetchGutendex(url.toString(), limit, signal);
}

/**
 * Topic-based browse — Gutendex's `topic` param matches against
 * subjects + bookshelves. Used to populate Discover shelves like
 * "Classics", "Philosophy", "Short reads".
 */
export async function topicGutenberg(
  topic: string,
  opts: { language?: string; limit?: number; sort?: 'popular' | 'ascending' | 'descending' } = {},
): Promise<FetchDiscoverResult> {
  const { language = 'en', limit = 20, sort = 'popular' } = opts;
  const url = new URL(GUTENDEX_BASE);
  url.searchParams.set('topic', topic);
  if (language) url.searchParams.set('languages', language);
  url.searchParams.set('mime_type', 'application/epub+zip');
  url.searchParams.set('sort', sort);
  return fetchGutendex(url.toString(), limit);
}

/**
 * Most popular books overall (Gutendex's lifetime-download ordering).
 * Used as the "For you" shelf when we have no personalisation signal.
 */
export async function popularGutenberg(
  opts: { language?: string; limit?: number } = {},
): Promise<FetchDiscoverResult> {
  const { language = 'en', limit = 20 } = opts;
  const url = new URL(GUTENDEX_BASE);
  if (language) url.searchParams.set('languages', language);
  url.searchParams.set('mime_type', 'application/epub+zip');
  url.searchParams.set('sort', 'popular');
  return fetchGutendex(url.toString(), limit);
}

/**
 * Fetch a single book's full metadata. Used by the detail page if we
 * landed there from a deep link with only an id; the home shelves
 * already deliver enough to render a card.
 */
export async function getGutenbergBook(
  bookId: number,
): Promise<DiscoverBook | null> {
  try {
    const res = await fetch(`${GUTENDEX_BASE}/${bookId}`);
    if (!res.ok) return null;
    const json = (await res.json()) as GutendexBook;
    return reshape(json);
  } catch (err) {
    console.warn('[discoverApi] getGutenbergBook failed:', err);
    return null;
  }
}

// ── Internals ──────────────────────────────────────────────────────────────

async function fetchGutendex(
  url: string,
  limit: number,
  signal?: AbortSignal,
): Promise<FetchDiscoverResult> {
  try {
    const res = await fetch(url, signal ? { signal } : undefined);
    if (!res.ok) {
      return {
        ok: false,
        error: `Gutendex returned HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as GutendexResponse;
    const books = (json.results ?? [])
      .slice(0, Math.min(limit, PAGE_SIZE))
      .map(reshape)
      // Drop books with no EPUB — we can't import those.
      .filter((b) => b.epubUrl !== null);
    return { ok: true, books };
  } catch (err) {
    // Surface the abort case distinctly so callers can render a
    // different empty state (timed-out vs Gutendex-said-nothing).
    if (
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError')
    ) {
      return { ok: false, error: 'aborted' };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Standard Ebooks ─────────────────────────────────────────────────────────

/**
 * Fetch the Standard Ebooks catalog via our `discover-standard-ebooks`
 * edge function. The function does the XML→JSON conversion server-side
 * so the client just receives DiscoverBook[] in our standard shape.
 *
 * `feed` lets the caller pick which slice of the catalog they want:
 *   - 'all' (default) — the full alphabetical catalog
 *   - 'new-releases' — the ~50 most recently added titles
 *
 * Errors are coalesced into `{ ok: false, error }` so the calling UI
 * can fall back to its seed list without parsing structured failure
 * envelopes from the edge function.
 */
export async function fetchStandardEbooks(
  opts: { limit?: number; feed?: 'all' | 'new-releases' } = {},
): Promise<FetchDiscoverResult> {
  const { limit = 24, feed = 'all' } = opts;
  try {
    // Edge functions support a GET-style call too, but supabase-js's
    // `invoke` always POSTs. We pack the filters into the body and let
    // the function ignore the URL query — works identically.
    const { data, error } = await supabase.functions.invoke(
      `discover-standard-ebooks?feed=${encodeURIComponent(feed)}&limit=${limit}`,
      { method: 'GET' },
    );
    if (error) {
      // Surface in Metro logs so a missing / mis-deployed edge
      // function is diagnosable rather than silently leaving the
      // Discover rails empty. Common failure modes: function not
      // deployed (404), region mismatch, expired anon key,
      // upstream OPDS endpoint blocked / timed out.
      //
      // supabase-js wraps the raw Response in error.context. Read
      // the body so the ACTUAL function error (e.g. "upstream_failed",
      // a stack trace, etc.) reaches Metro instead of just the
      // generic "Edge Function returned a non-2xx status code".
      let bodyText: string | undefined;
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          bodyText = await (ctx as Response).text();
        } catch {
          // Body might already be consumed — ignore.
        }
      }
      console.warn(
        '[fetchStandardEbooks] supabase.functions.invoke error:',
        error.message,
        '— response body:',
        bodyText ?? '(unavailable)',
      );
      return {
        ok: false,
        error: bodyText ?? error.message ?? 'standard-ebooks fetch failed',
      };
    }
    const payload = data as { ok?: boolean; books?: DiscoverBook[]; error?: string } | null;
    if (!payload?.ok || !Array.isArray(payload.books)) {
      console.warn(
        '[fetchStandardEbooks] unexpected response shape:',
        payload,
      );
      return {
        ok: false,
        error: payload?.error ?? 'standard-ebooks returned unexpected shape',
      };
    }
    // The edge function already filters to entries that have an EPUB,
    // but defend against drift: drop anything without one rather than
    // letting an un-importable book reach the UI.
    const books = payload.books.filter((b) => !!b.epubUrl);
    return { ok: true, books };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Open Library ────────────────────────────────────────────────────────────

/**
 * Open Library / Internet Archive feed key. Same shape as Standard
 * Ebooks' — the edge function does the heavy lifting of mapping our
 * abstract feeds onto Open Library's JSON Search API.
 */
export type OpenLibraryFeed =
  | 'classics'
  | 'fiction'
  | 'nonfiction'
  | 'philosophy'
  | 'poetry'
  | 'history'
  | 'science'
  | 'search';

/**
 * Fetch a slice of Open Library / Internet Archive's public-domain
 * catalog via our `discover-open-library` edge function. Open Library
 * is the third source after Project Gutenberg and Standard Ebooks; it
 * lifts the catalog from ~1200 SE titles + Gutenberg's set into the
 * millions, with the catalog server-side filtered down to titles
 * that actually have a downloadable EPUB on archive.org.
 *
 * Errors are coalesced into `{ ok: false, error }` so the calling UI
 * can fall back to its seed list — same pattern as fetchStandardEbooks.
 */
export async function fetchOpenLibrary(
  opts: { limit?: number; feed?: OpenLibraryFeed; query?: string } = {},
): Promise<FetchDiscoverResult> {
  const { limit = 24, feed = 'classics', query } = opts;
  try {
    const params = new URLSearchParams();
    params.set('feed', feed);
    params.set('limit', String(limit));
    if (feed === 'search') {
      if (!query || !query.trim()) {
        return { ok: false, error: 'missing_query' };
      }
      params.set('q', query.trim());
    }
    // Same cache-buster pattern as fetchWikisource — see comment
    // there for the why. Older deploys leaked Cache-Control headers
    // that poisoned native HTTP caches with stale responses.
    params.set('_cb', String(Date.now()));
    const { data, error } = await supabase.functions.invoke(
      `discover-open-library?${params.toString()}`,
      { method: 'GET' },
    );
    if (error) {
      let bodyText: string | undefined;
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          bodyText = await (ctx as Response).text();
        } catch {
          // body already consumed — ignore
        }
      }
      console.warn(
        '[fetchOpenLibrary] supabase.functions.invoke error:',
        error.message,
        '— response body:',
        bodyText ?? '(unavailable)',
      );
      return {
        ok: false,
        error: bodyText ?? error.message ?? 'open-library fetch failed',
      };
    }
    const payload = data as
      | { ok?: boolean; books?: DiscoverBook[]; error?: string }
      | null;
    if (!payload?.ok || !Array.isArray(payload.books)) {
      console.warn('[fetchOpenLibrary] unexpected response shape:', payload);
      return {
        ok: false,
        error: payload?.error ?? 'open-library returned unexpected shape',
      };
    }
    // Drop entries that came back without an EPUB URL — the search
    // API can occasionally return a record without an `ia` field
    // (race between catalog update and scan completion). The edge
    // function already filters most of these but defending here
    // keeps the UI from ever surfacing an un-importable card.
    const books = payload.books.filter((b) => !!b.epubUrl);
    return { ok: true, books };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Wikisource ──────────────────────────────────────────────────────────────

/**
 * Wikisource feed slice. Maps to a curated category on the chosen
 * Wikisource language site:
 *   - 'validated' — peer-verified transcriptions. Most reliable.
 *   - 'featured'  — editorial best-of. Smallest pool, highest quality.
 *   - 'recent'    — newly added pages.
 */
export type WikisourceFeed = 'validated' | 'featured' | 'recent';

/**
 * Fetch a slice of Wikisource's validated public-domain catalog via
 * our `discover-wikisource` edge function. Wikisource is the fourth
 * source after Gutenberg, Standard Ebooks (deprecated since SE added
 * auth), and Open Library; it broadens coverage with long-tail
 * historical documents, government records, regional classics, and
 * transcribed manuscripts that aren't on the other catalogs.
 *
 * `lang` selects which language Wikisource to hit ('en', 'fr', 'es',
 * etc.). Defaults to English. Each language Wikisource is independent
 * with its own catalog, so a non-English call won't pull in English
 * books.
 */
export async function fetchWikisource(
  opts: {
    limit?: number;
    feed?: WikisourceFeed;
    lang?: string;
    /**
     * When true, only return books that have a real Wikimedia
     * cover thumbnail — the function drops cover-less entries and
     * fetches a larger candidate pool upstream to compensate. The
     * Discover rail uses this so every visible card has artwork;
     * the typeahead search pool leaves it off so cover-less long-
     * tail titles are still searchable.
     */
    coversOnly?: boolean;
  } = {},
): Promise<FetchDiscoverResult> {
  const { limit = 24, feed = 'validated', lang = 'en', coversOnly = false } = opts;
  try {
    const params = new URLSearchParams();
    params.set('feed', feed);
    params.set('limit', String(limit));
    params.set('lang', lang);
    if (coversOnly) params.set('covers_only', 'true');
    // Cache-buster — earlier deploys returned Cache-Control:
    // max-age=3600 and seeded React Native's native HTTP cache
    // with an empty-books response. Even after we switched the
    // function to `no-store`, the cached `books: []` entry was
    // still being served until its 1-hour TTL elapsed. A unique
    // `_cb` per call sidesteps the cache entirely. Cheap on the
    // backend (function does its own work anyway) and removable
    // once the catalog is stable.
    params.set('_cb', String(Date.now()));
    const { data, error } = await supabase.functions.invoke(
      `discover-wikisource?${params.toString()}`,
      { method: 'GET' },
    );
    if (error) {
      let bodyText: string | undefined;
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          bodyText = await (ctx as Response).text();
        } catch {
          // body already consumed
        }
      }
      console.warn(
        '[fetchWikisource] supabase.functions.invoke error:',
        error.message,
        '— response body:',
        bodyText ?? '(unavailable)',
      );
      return {
        ok: false,
        error: bodyText ?? error.message ?? 'wikisource fetch failed',
      };
    }
    const payload = data as
      | { ok?: boolean; books?: DiscoverBook[]; error?: string }
      | null;
    if (!payload?.ok || !Array.isArray(payload.books)) {
      console.warn('[fetchWikisource] unexpected response shape:', payload);
      return {
        ok: false,
        error: payload?.error ?? 'wikisource returned unexpected shape',
      };
    }
    const books = payload.books.filter((b) => !!b.epubUrl);
    return { ok: true, books };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
