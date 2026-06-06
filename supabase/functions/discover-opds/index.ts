/**
 * discover-opds — Generic OPDS (Open Publication Distribution System)
 * catalog adapter. Fetches and normalises Atom-based OPDS 1.x feeds from
 * any configured library into the same `DiscoverBook` shape the client
 * uses for every other discovery source.
 *
 * Why one function instead of per-library functions:
 *   Each new public-domain catalog we want to add has the same shape:
 *   request → fetch Atom XML → regex-parse entries → return JSON. The
 *   only thing that varies is the feed URL and a handful of per-library
 *   quirks (URL prefixing for relative hrefs, namespace differences,
 *   author convention). Cloning the standard-ebooks function for each
 *   would mean N copies of the same parser maintained in N places. This
 *   generic function lets us add new libraries by adding a config entry
 *   and (if needed) a parsing override — no new deployment, no new
 *   surface area.
 *
 * Supported libraries (request via `?library=ID`):
 *   - feedbooks  → ~3,000 hand-curated public-domain EPUBs
 *   - manybooks  → ~50,000 free titles across genres
 *   - doab       → Directory of Open Access Books, ~80,000 academic OA
 *   - oapen      → OAPEN open-access scholarly books
 *
 * Each library has its own host-allowlist entry in `import-from-url`
 * so downloaded EPUBs from these sources actually reach the user's
 * library. Adding a new library WITHOUT updating that allowlist will
 * leave the discovery UI usable but Add buttons returning
 * `host_not_allowed`.
 *
 * Flow:
 *   1. Receive GET (or POST) with `?library=ID` (+ optional limit, feed).
 *   2. Look up the library's feed URL from `LIBRARIES`.
 *   3. Fetch the OPDS Atom feed (handles redirects).
 *   4. Regex-extract entries — robust enough for machine-generated OPDS.
 *   5. Per-library entry normaliser handles quirks (relative URLs,
 *      namespace prefixes, author/subject conventions).
 *   6. Return `{ ok: true, books: DiscoverBook[] }`.
 *
 * Auth: passthrough — public-domain catalog data, no PII, anon key OK.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 1500;

/** Library identifier the client passes as `?library=`. */
type LibraryId = 'feedbooks' | 'manybooks' | 'doab' | 'oapen';

/** Source string we emit on each parsed book — used by the client's
 * source-aware UI (badges, sort, etc.) and threaded into import-from-url
 * so the server-side host allowlist branch can pick the right code path. */
type LibrarySource = 'feedbooks' | 'manybooks' | 'doab' | 'oapen';

type LibraryConfig = {
  /** Friendly name. Surfaced as a fallback in case the entry lacks one. */
  label: string;
  /** Default feed URL — what we fetch when no `?feed=` override is given. */
  defaultFeedUrl: string;
  /** Source identifier emitted on each `DiscoverBook`. */
  source: LibrarySource;
  /** Some feeds publish covers/EPUBs with relative URLs; we resolve them
   * against this base. Most well-formed OPDS feeds use absolute URLs. */
  baseUrl?: string;
  /** Some libraries (DOAB, OAPEN) use Atom convention where the
   * acquisition link's `type` is missing or generic. When true, we
   * treat any acquisition link with an EPUB-ish href as the EPUB. */
  acceptAcquisitionByExtension?: boolean;
  /** Description shown in the catalog. Helpful for catalog selector UI. */
  description?: string;
};

// Library configs were rolled back — Feedbooks and ManyBooks put
// their OPDS feeds behind Cloudflare bot challenges (server-side
// scrapers get 403'd), and DOAB / OAPEN no longer expose OPDS at all
// (DOAB migrated to REST + OAI-PMH; their REST API is consumed by
// the separate `discover-doab` edge function instead). This adapter
// stays in place as scaffolding for any future working OPDS source —
// adding one is a config entry below + an allowlist host in
// import-from-url + a wrapper in discoverApi.
const LIBRARIES: Record<LibraryId, LibraryConfig> = {} as Record<
  LibraryId,
  LibraryConfig
>;

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
  source: LibrarySource;
  downloadCount: number;
  /** Library label for UI attribution ("From Feedbooks"). */
  sourceLabel?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const url = new URL(req.url);
  const libraryParam = url.searchParams.get('library');
  if (!libraryParam || !(libraryParam in LIBRARIES)) {
    return json(
      {
        ok: false,
        error: 'unknown_library',
        message: `Pass ?library= one of: ${Object.keys(LIBRARIES).join(', ')}`,
      },
      400,
    );
  }
  const libraryId = libraryParam as LibraryId;
  const config = LIBRARIES[libraryId];

  // Optional feed override — useful for browsing sub-catalogs (subjects,
  // popular, recent). Falls back to the library's curated landing feed.
  const feedOverride = url.searchParams.get('feed');
  const feedUrl = feedOverride
    ? resolveUrl(feedOverride, config.baseUrl)
    : config.defaultFeedUrl;

  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const res = await fetch(feedUrl, {
      headers: {
        accept: 'application/atom+xml, application/xml;q=0.9',
        // Some OPDS hosts gate-keep on UA — Feedbooks 200s anyway but
        // sending a real UA avoids occasional 403s from cloud edges.
        'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
      },
      // Follow redirects — libraries often 301 to a versioned feed URL.
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(
        `[discover-opds:${libraryId}] upstream returned ${res.status}`,
      );
      return json(
        {
          ok: false,
          error: 'upstream_failed',
          message: `${config.label} returned ${res.status}`,
        },
        502,
      );
    }
    const xml = await res.text();
    const books = parseOpdsFeed(xml, config).slice(0, limit);
    return json({ ok: true, books }, 200, {
      // Catalog content turns over slowly. 1 h fresh + 4 h SWR matches
      // the cache profile of discover-standard-ebooks so the edge
      // doesn't hammer upstream.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=14400',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[discover-opds:${libraryId}] fetch threw:`, message);
    return json({ ok: false, error: 'network_error', message }, 502);
  }
});

// ─── Atom / OPDS extraction ──────────────────────────────────────────────────

/**
 * Pull every <entry> block out of the feed body, parse each, and drop
 * the ones that lack the bare minimum (id, title, EPUB acquisition).
 *
 * OPDS feeds are machine-generated XML so regex is sufficient — we
 * don't need to handle CDATA, nested entry tags, or other XML weirdness
 * that would require a real parser. Mirrors the proven approach in
 * `discover-standard-ebooks`.
 */
function parseOpdsFeed(xml: string, config: LibraryConfig): DiscoverBook[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];
  const out: DiscoverBook[] = [];
  for (const entry of entries) {
    const book = parseOpdsEntry(entry, config);
    if (book) out.push(book);
  }
  return out;
}

function parseOpdsEntry(
  entry: string,
  config: LibraryConfig,
): DiscoverBook | null {
  const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  // First <author><name>…</name></author> block is the primary author per
  // OPDS convention. Subsequent ones are translators/editors.
  const authorMatch = entry.match(
    /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/,
  );
  // Language can be under <dc:language>, <language>, or omitted.
  const langMatch =
    entry.match(/<dc:language>([\s\S]*?)<\/dc:language>/) ??
    entry.match(/<language>([\s\S]*?)<\/language>/);
  // Summary can be under <summary> or <content>. Some libraries use
  // <content type="html"> with markup inside; we strip tags in either.
  const summaryMatch =
    entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ??
    entry.match(/<content[^>]*>([\s\S]*?)<\/content>/);

  if (!idMatch || !titleMatch) return null;

  // Walk every <link/> in the entry and bucket by rel + type. Two
  // self-closing forms exist (`<link … />` and `<link …></link>`) so we
  // match both. Some feeds inline `<title>` inside link tags too.
  const linkRegex = /<link\b([^>]*?)\/?>(?:<\/link>)?/g;
  let m: RegExpExecArray | null;
  let coverUrl: string | null = null;
  let coverThumbnailUrl: string | null = null;
  let epubUrl: string | null = null;
  const formats: Record<string, string> = {};
  while ((m = linkRegex.exec(entry)) !== null) {
    const attrs = m[1] ?? '';
    const href = /href="([^"]+)"/.exec(attrs)?.[1];
    const rel = /rel="([^"]+)"/.exec(attrs)?.[1] ?? '';
    const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? '';
    if (!href) continue;
    const resolvedHref = resolveUrl(href, config.baseUrl);

    // Image links — OPDS uses two relations for cover/thumbnail.
    if (/^http:\/\/opds-spec\.org\/image$/.test(rel)) {
      coverUrl = resolvedHref;
    } else if (/^http:\/\/opds-spec\.org\/image\/thumbnail$/.test(rel)) {
      coverThumbnailUrl = resolvedHref;
    } else if (rel === 'thumbnail' || rel.endsWith('thumbnail')) {
      // Older / non-canonical thumbnail relation used by some libraries.
      coverThumbnailUrl = coverThumbnailUrl ?? resolvedHref;
    } else if (
      rel === 'http://opds-spec.org/acquisition' ||
      rel === 'http://opds-spec.org/acquisition/open-access' ||
      rel.endsWith('acquisition') ||
      rel.endsWith('acquisition/open-access')
    ) {
      // Pick the EPUB. Strict mime first; if the library's feed omits
      // type metadata (DOAB sometimes does), accept based on URL extension.
      if (type === 'application/epub+zip') {
        if (!epubUrl) epubUrl = resolvedHref;
        formats[type] = resolvedHref;
      } else if (type) {
        if (!formats[type]) formats[type] = resolvedHref;
        // Some libraries label EPUBs with 'application/x-epub+zip' or
        // miscellaneous mime types. Fall back to URL extension.
        if (!epubUrl && /\.epub(\?|$)/i.test(resolvedHref)) {
          epubUrl = resolvedHref;
        }
      } else if (config.acceptAcquisitionByExtension) {
        if (!epubUrl && /\.epub(\?|$)/i.test(resolvedHref)) {
          epubUrl = resolvedHref;
        }
        // Track the format under a synthetic mime so the client can fall
        // back to PDF if EPUB is missing.
        if (/\.pdf(\?|$)/i.test(resolvedHref) && !formats['application/pdf']) {
          formats['application/pdf'] = resolvedHref;
        }
      }
    }
  }

  if (!epubUrl) return null;

  // Subject tags. OPDS uses <category term="…"/>. Some feeds also use
  // <category label="…"/>; we accept either, preferring term.
  const categoryRegex = /<category\b([^/]*)\/>/g;
  const tags: string[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = categoryRegex.exec(entry)) !== null && tags.length < 6) {
    const attrs = cm[1] ?? '';
    const raw =
      /term="([^"]+)"/.exec(attrs)?.[1] ??
      /label="([^"]+)"/.exec(attrs)?.[1] ??
      '';
    const term = decodeXmlEntities(raw).trim();
    if (term && !tags.includes(term)) tags.push(term);
  }

  const rawTitle = decodeXmlEntities((titleMatch[1] ?? '').trim());
  const rawAuthor = decodeXmlEntities(
    (authorMatch?.[1] ?? 'Unknown').trim(),
  );
  const rawLang = (langMatch?.[1] ?? '').trim();
  const rawSummary = decodeXmlEntities(
    (summaryMatch?.[1] ?? '').replace(/<[^>]+>/g, '').trim(),
  );

  // ISO 639-1 normalisation — many feeds emit 'en-US' / 'eng' / 'en-GB'.
  // Take the leading 2 chars as a best-effort.
  const langPrefix = rawLang.split(/[-_]/)[0]?.toLowerCase() ?? '';
  const language = langPrefix.length === 3
    ? // ISO 639-3 → 639-1 for the small set of common ones we see in OA
      THREE_TO_TWO[langPrefix] ?? ''
    : langPrefix;

  const id = idToStableSlug(idMatch[1] ?? '');

  return {
    id: `${config.source}:${id}`,
    title: rawTitle,
    author: rawAuthor,
    language,
    tags,
    coverUrl: proxyCover(coverUrl ?? coverThumbnailUrl),
    epubUrl,
    formats,
    about: rawSummary
      ? rawSummary.length > 280
        ? `${rawSummary.slice(0, 277)}…`
        : rawSummary
      : '',
    source: config.source,
    downloadCount: 0,
    sourceLabel: config.label,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const THREE_TO_TWO: Record<string, string> = {
  eng: 'en',
  fre: 'fr',
  fra: 'fr',
  ger: 'de',
  deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  chi: 'zh',
  zho: 'zh',
  jpn: 'ja',
  kor: 'ko',
  ara: 'ar',
  lat: 'la',
  grc: 'el',
};

/**
 * Resolve a possibly-relative URL against the library's base URL. OPDS
 * permits relative hrefs but not every library uses them; we run every
 * link through this so callers don't have to care.
 */
function resolveUrl(href: string, baseUrl: string | undefined): string {
  if (!baseUrl) return href;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) {
    try {
      const base = new URL(baseUrl);
      return `${base.protocol}//${base.host}${href}`;
    } catch {
      return href;
    }
  }
  // Relative-to-current-document — concatenate with a trailing slash on base.
  return `${baseUrl.replace(/\/$/, '')}/${href}`;
}

/**
 * Stabilise the upstream id into something we can use as a key. Most
 * OPDS ids look like canonical URLs; we strip the scheme and keep a
 * URL-safe subset. The leading source prefix (added by the caller)
 * keeps ids globally unique across libraries.
 */
function idToStableSlug(rawId: string): string {
  const trimmed = rawId.trim().replace(/\/+$/, '');
  return trimmed
    .replace(/^urn:[^:]+:/, '')
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9_./:-]/g, '');
}

/**
 * Decode the XML entities the major OPDS catalogs emit. Same minimal
 * set as discover-standard-ebooks — no need for a full table.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/**
 * Run every cover URL through images.weserv.nl — same proxy used by
 * the Gutenberg / Standard Ebooks cover pipeline. Keeps payload small,
 * normalises HTTPS, edge-caches images so the client never sees a 500
 * from a slow library origin.
 */
function proxyCover(src: string | null): string | null {
  if (!src) return null;
  const stripped = src.replace(/^https?:\/\//, '');
  return `https://images.weserv.nl/?url=${encodeURIComponent(stripped)}&w=240&output=webp&q=80&we`;
}

function json(
  payload: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}
