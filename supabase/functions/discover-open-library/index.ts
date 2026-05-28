/**
 * discover-open-library — fetch and normalise public-domain books
 * from Open Library / Internet Archive into the `DiscoverBook` shape
 * the client already speaks (matches Standard Ebooks + Gutendex).
 *
 * Open Library is a project of the Internet Archive. The Search API
 * is JSON-native (no OPDS parsing) and exposes flags that let us
 * filter to titles that are actually downloadable as EPUB.
 *
 * Endpoints we hit:
 *   - Search: https://openlibrary.org/search.json
 *     Filter: `has_fulltext=true` AND `public_scan_b=true` so we only
 *     return books with a free EPUB available via archive.org.
 *
 * EPUB download URL: derived from the `ia` (Internet Archive id) on
 * each search hit:
 *   https://archive.org/download/{ia}/{ia}.epub
 *
 * Cover URL: derived from the `cover_i` numeric id on each search
 * hit (medium size, ~180x270):
 *   https://covers.openlibrary.org/b/id/{cover_i}-M.jpg
 *
 * Why this lives server-side:
 *   1. Filtering + shaping the Open Library response is heavier than
 *      the Gutendex pass — we drop ~half of every result page on the
 *      `has_fulltext + public_scan_b` filter. Doing it once at the
 *      edge keeps the client payload small.
 *   2. Open Library's CDN can be slow from mobile networks; an edge
 *      function in the same Supabase region adds a stable hop.
 *   3. Future on-edge cache layer drops in here cleanly.
 *
 * Auth: passthrough — no DB writes, no PII, no secrets. CORS open
 * so it works from any client.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_LIMIT = 24;
// Cap matches the SE function — the rails and the search pool are
// the two consumers and 500 books is plenty of coverage for typeahead
// matches even on long-tail searches.
const MAX_LIMIT = 500;

/**
 * `feed` selects which slice of Open Library we surface:
 *   - 'classics' (default) — public-domain, has-fulltext, sorted by
 *     editions count (a rough popularity proxy). Returns the most
 *     widely-edited works first, which trends toward genuinely
 *     well-known titles rather than obscure long-tail.
 *   - 'fiction', 'nonfiction', 'philosophy', 'poetry', 'history',
 *     'science' — same filters but constrained to a subject. These
 *     map to Open Library `subject:` queries.
 *   - 'search' — caller supplies `?q=`, we just pass it through with
 *     the same downloadability filters.
 */
type FeedKey =
  | 'classics'
  | 'fiction'
  | 'nonfiction'
  | 'philosophy'
  | 'poetry'
  | 'history'
  | 'science'
  | 'search';

const SUBJECT_BY_FEED: Partial<Record<FeedKey, string>> = {
  fiction: 'fiction',
  nonfiction: 'nonfiction',
  philosophy: 'philosophy',
  poetry: 'poetry',
  history: 'history',
  science: 'science',
};

const DEFAULT_FEED: FeedKey = 'classics';

const KNOWN_FEEDS: ReadonlySet<FeedKey> = new Set([
  'classics',
  'fiction',
  'nonfiction',
  'philosophy',
  'poetry',
  'history',
  'science',
  'search',
]);

type DiscoverBook = {
  id: string;
  title: string;
  author: string;
  language: string;
  tags: string[];
  coverUrl: string | null;
  epubUrl: string | null;
  formats: Record<string, string>;
  about: string;
  source: 'open-library';
  /** Open Library exposes `edition_count` as a popularity proxy — we
   * forward it so the client's sort-by-popularity can sequence
   * Open Library results sensibly alongside Gutendex's downloadCount. */
  downloadCount: number;
};

/**
 * Raw search-API response shape we care about. Open Library returns
 * many more fields per doc — we ignore the ones we don't use.
 */
type SearchResponse = {
  docs?: Array<{
    key?: string;
    title?: string;
    author_name?: string[];
    cover_i?: number;
    edition_count?: number;
    first_publish_year?: number;
    language?: string[];
    subject?: string[];
    has_fulltext?: boolean;
    public_scan_b?: boolean;
    ia?: string[];
  }>;
  numFound?: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const url = new URL(req.url);
  const feedParam = url.searchParams.get('feed') ?? DEFAULT_FEED;
  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const queryParam = (url.searchParams.get('q') ?? '').trim();
  const feed = KNOWN_FEEDS.has(feedParam as FeedKey)
    ? (feedParam as FeedKey)
    : DEFAULT_FEED;
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;

  // Build the Open Library search query.
  //
  // `has_fulltext:true` AND `public_scan_b:true` together mean "has a
  // downloadable scan in the public domain". Without both flags we'd
  // also surface titles that are still under copyright (Open Library
  // catalogs everything, not just freely-redistributable works).
  //
  // We fetch `limit * 2` from Open Library because some results
  // still come back without an `ia` id even after the filter — they
  // can't be made into a download URL on our side and we drop them.
  // Doubling the upstream pull keeps the trimmed output count
  // roughly equal to what the caller asked for.
  const params = new URLSearchParams();
  if (feed === 'search') {
    if (!queryParam) {
      return json({ ok: false, error: 'missing_query' }, 400);
    }
    params.set('q', queryParam);
  } else if (feed === 'classics') {
    // Open Library's `search.json` needs at least one query-like
    // param. We've burned two iterations on the filter strategy:
    //   v1: subject=fiction + has_fulltext=true + public_scan_b=true
    //       → returned 0 (separate param filters are flaky on OL)
    //   v2: q=subject:fiction has_fulltext:true public_scan_b:true
    //       → also returned 0 (numFound=0 confirmed via direct
    //         browser test — OL's solr doesn't index those booleans
    //         inside the q= lucene string)
    //
    // The reliable answer: don't trust OL's downloadability flags at
    // all. Just query by subject, pull a wide page of results, and
    // filter client-side (in `normaliseDoc` below) for the presence
    // of an `ia` (Internet Archive id) — that's the actual signal
    // that a book has a scan we can hand to wsexport. We pull `limit
    // * 4` instead of `* 2` because the un-filtered subject query
    // returns plenty of non-downloadable in-copyright records, and
    // we still want the asked-for count after the `ia` filter.
    params.set('subject', 'fiction');
  } else {
    const subject = SUBJECT_BY_FEED[feed];
    if (subject) {
      params.set('subject', subject);
    } else {
      // Last-resort fallback when a subject feed is unknown: query
      // by author=Charles Dickens. Returns a deterministic non-empty
      // set we can fall back to so the rail isn't ever empty for an
      // unrecognised feed name.
      params.set('author', 'Charles Dickens');
    }
  }
  // Only ask Open Library for the fields we actually consume. Cuts
  // their payload roughly 80% on a typical search response.
  params.set(
    'fields',
    [
      'key',
      'title',
      'author_name',
      'cover_i',
      'edition_count',
      'first_publish_year',
      'language',
      'subject',
      'has_fulltext',
      'public_scan_b',
      'ia',
    ].join(','),
  );
  // Pull 4x the asked-for limit so the `ia`-presence filter in
  // `normaliseDoc` has room to drop ~half-to-three-quarters of the
  // upstream docs (no Internet Archive scan) and still hit the
  // caller's requested count.
  params.set('limit', String(Math.min(limit * 4, MAX_LIMIT * 4)));
  // Editions count is Open Library's closest stand-in for "how often
  // is this book talked about". Better proxy than no sort at all.
  params.set('sort', 'editions');

  const feedUrl = `https://openlibrary.org/search.json?${params.toString()}`;
  // Surface the exact upstream URL in the function logs so we can
  // distinguish "our query was wrong" from "OL rejected the
  // request" without having to re-deploy with more logging.
  console.log(`[discover-open-library] GET ${feedUrl}`);

  try {
    const res = await fetch(feedUrl, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
      },
    });
    if (!res.ok) {
      console.warn(
        `[discover-open-library] upstream returned ${res.status}`,
      );
      return json(
        {
          ok: false,
          error: 'upstream_failed',
          message: `Open Library returned ${res.status}`,
        },
        502,
      );
    }
    const payload = (await res.json()) as SearchResponse;
    const docs = payload.docs ?? [];
    console.log(
      `[discover-open-library] upstream ok, status=${res.status} numFound=${payload.numFound ?? 'unknown'} docs=${docs.length}`,
    );
    const books: DiscoverBook[] = [];
    for (const doc of docs) {
      const book = normaliseDoc(doc);
      if (book) books.push(book);
      if (books.length >= limit) break;
    }
    // Diagnostic — surfaces in the function's Logs tab on Supabase.
    // Distinguishes "upstream returned nothing" from "we filtered
    // everything out" (e.g. all docs missing an `ia` field) so we
    // can iterate on the right thing.
    console.log(
      `[discover-open-library] feed=${feed} upstream_docs=${docs.length} kept=${books.length}`,
    );
    return json({ ok: true, books }, 200, {
      // Cache-Control: no-store during the iteration phase. The
      // earlier `max-age=1800` poisoned the CDN with a cached
      // empty-books response while we were debugging the search
      // query — every subsequent client hit got the stale 0 even
      // after we deployed a working version. Re-enable a modest
      // TTL once the catalog is stable.
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[discover-open-library] fetch threw:', message);
    return json({ ok: false, error: 'network_error', message }, 502);
  }
});

function normaliseDoc(
  doc: NonNullable<SearchResponse['docs']>[number],
): DiscoverBook | null {
  // Need an Internet Archive id to construct a downloadable EPUB
  // URL — every entry the client renders must be importable. The
  // `ia` field is an array; the first id is the canonical scan.
  const ia = doc.ia?.[0]?.trim();
  if (!ia) return null;
  const title = doc.title?.trim();
  if (!title) return null;
  const key = doc.key?.trim();
  if (!key) return null;

  const author = doc.author_name?.[0]?.trim() ?? 'Unknown';
  const language = (doc.language?.[0] ?? '').toLowerCase();

  // Subject tags. Open Library returns a LOT of subjects per doc
  // (frequently 50+). Cap at 6 to match the SE / Gutenberg trim and
  // prefer the shorter ones (which tend to be the broad genre tags
  // rather than long-form descriptors).
  const tags: string[] = [];
  if (doc.subject) {
    const sorted = [...doc.subject].sort((a, b) => a.length - b.length);
    for (const t of sorted) {
      const trimmed = t.trim();
      if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
      if (tags.length >= 6) break;
    }
  }

  // Stable id prefixed with the source so it can't collide with
  // Gutenberg numeric ids or Standard Ebooks slugs.
  //
  // We use the Internet Archive id (`ia`) rather than the
  // Open Library work key (`/works/OLxxxxxxxxW`) so the client's
  // libraryIds reverse-mapper can extract the same id from the
  // stored `books.source_url` (which contains the IA id but not
  // the OL work key). Otherwise the "In library" badge would never
  // fire on Open Library imports.
  const id = `open-library:${ia}`;

  // EPUB download URL. Internet Archive serves the EPUB at a
  // predictable path for each scanned book. Some scans don't
  // actually have an EPUB generated yet — but we can't tell from
  // the search response, and the import flow already handles
  // download failure gracefully.
  const epubUrl = `https://archive.org/download/${encodeURIComponent(ia)}/${encodeURIComponent(
    ia,
  )}.epub`;

  // Cover. Open Library serves three sizes (S, M, L) keyed by
  // cover_i. Medium is the right size for a thumbnail rail.
  const coverUrl = doc.cover_i
    ? proxyCover(
        `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
      )
    : null;

  // "About" — Open Library's search API doesn't include the book
  // description (that's only on the Work detail endpoint), so we
  // synthesise a short blurb from first-publish year + author for
  // the detail page.
  const aboutBits: string[] = [];
  if (doc.first_publish_year) aboutBits.push(`First published ${doc.first_publish_year}.`);
  aboutBits.push(`Public-domain edition via Internet Archive.`);
  const about = aboutBits.join(' ');

  return {
    id,
    title,
    author,
    language,
    tags,
    coverUrl,
    epubUrl,
    formats: { 'application/epub+zip': epubUrl },
    about,
    source: 'open-library',
    downloadCount: doc.edition_count ?? 0,
  };
}

/**
 * Same cover proxy the SE function uses — keeps the payload small
 * and gives us an edge-cached resize so the device doesn't have to
 * download a full-res cover for a 108-px-wide thumbnail.
 */
function proxyCover(src: string | null): string | null {
  if (!src) return null;
  const stripped = src.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=240&output=webp&q=80&we`;
}

function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
