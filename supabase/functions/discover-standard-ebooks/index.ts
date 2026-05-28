/**
 * discover-standard-ebooks — Edge Function that fetches and normalises
 * Standard Ebooks' OPDS catalog into the same `DiscoverBook` shape the
 * client uses for Gutenberg results.
 *
 * Why this lives server-side:
 *   1. Standard Ebooks publishes only an Atom/OPDS XML feed, not JSON.
 *      React Native has no built-in DOMParser; parsing XML on-device
 *      would require pulling in a parsing library and shipping more
 *      bundle. Doing it here means the client just consumes JSON.
 *   2. Future caching layer can land here — Standard Ebooks updates
 *      their catalog weekly at most, so an edge-function-level cache
 *      (or KV / Postgres-backed) would cut catalogue hits to near-zero.
 *      For now we just proxy + parse on each request.
 *
 * Flow:
 *   1. Receive GET (or POST) with optional `?limit=N` and `?feed=…`.
 *   2. Fetch the OPDS feed from `standardebooks.org`.
 *   3. Regex-extract <entry>…</entry> blocks and field values. Regex
 *      is robust enough for OPDS because the feed is machine-generated
 *      and structurally regular (no XML weirdness like CDATA-wrapped
 *      attributes, mixed namespaces in the entry body, etc.).
 *   4. Return `{ ok: true, books: DiscoverBook[] }` mirroring the
 *      client-side discoverApi shape.
 *
 * Auth: passthrough — the client's anon key is enough; no DB writes,
 * no PII, no secrets. CORS open so it works from any client.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Available feeds at standardebooks.org/feeds/opds/.
//   - new-releases: ~50 most recent additions (cheapest, freshest)
//   - all: full catalogue (~1,200 books, ~500 KB Atom feed)
// We default to all-time-popular since the home shelf shows
// well-known classics over fresh additions. The client can ask for
// new-releases when it wants the freshness signal.
type FeedKey = 'all' | 'new-releases' | 'subjects' | 'authors' | 'collections';
const KNOWN_FEEDS: ReadonlySet<FeedKey> = new Set([
  'all',
  'new-releases',
  'subjects',
  'authors',
  'collections',
]);
const DEFAULT_FEED: FeedKey = 'all';
const DEFAULT_LIMIT = 24;
// MAX_LIMIT bumped from 100 → 1500 so the client can pull the FULL
// Standard Ebooks catalog (~1200 entries) into its in-memory search
// pool. With 100 the typeahead missed most SE-only titles because
// fewer than a tenth of the catalog was reachable for local match.
// The OPDS `/all` feed returns every title in one document anyway
// — the cap was purely a defensive guard, not a pagination bound.
const MAX_LIMIT = 1500;

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
  source: 'standard-ebooks';
  /** Standard Ebooks doesn't publish download counts the way Gutenberg
   * does; we leave this 0 so the client's sort-by-popularity heuristic
   * just falls back to insertion order (which the feed itself orders
   * by recency for new-releases or alpha for all). */
  downloadCount: number;
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
  const feed = KNOWN_FEEDS.has(feedParam as FeedKey)
    ? (feedParam as FeedKey)
    : DEFAULT_FEED;
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const feedUrl = `https://standardebooks.org/feeds/opds/${feed}`;

  try {
    const res = await fetch(feedUrl, {
      headers: {
        // Standard Ebooks 200s on default UA but explicit Accept helps
        // their server pick the right variant if they add content
        // negotiation later.
        accept: 'application/atom+xml',
        'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
      },
    });
    if (!res.ok) {
      console.warn(
        `[discover-standard-ebooks] upstream returned ${res.status}`,
      );
      return json(
        {
          ok: false,
          error: 'upstream_failed',
          message: `Standard Ebooks returned ${res.status}`,
        },
        502,
      );
    }
    const xml = await res.text();
    const books = parseOpdsFeed(xml).slice(0, limit);
    return json({ ok: true, books }, 200, {
      // Edge cache: feed changes weekly at most. 1 h cache + 4 h SWR
      // keeps catalog hits to a trickle without serving genuinely
      // stale data.
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=14400',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[discover-standard-ebooks] fetch threw:', message);
    return json({ ok: false, error: 'network_error', message }, 502);
  }
});

// ─── Atom / OPDS extraction ──────────────────────────────────────────────────

/**
 * Pull every <entry> block out of the feed body, then extract the
 * fields we care about with field-specific regexes. Returns an empty
 * array when the feed has no entries (or none parse) so callers can
 * treat "no results" identically regardless of the failure shape.
 */
function parseOpdsFeed(xml: string): DiscoverBook[] {
  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/g) ?? [];
  const out: DiscoverBook[] = [];
  for (const entry of entries) {
    const book = parseOpdsEntry(entry);
    if (book) out.push(book);
  }
  return out;
}

function parseOpdsEntry(entry: string): DiscoverBook | null {
  // Standard Ebooks entry shape:
  //   <id>https://standardebooks.org/ebooks/<author>/<slug></id>
  //   <title>Book title</title>
  //   <author><name>Author Name</name>…</author>
  //   <dc:language>en-GB</dc:language>
  //   <category term="Subject" scheme="…"/>
  //   <summary type="text">…</summary>
  //   <link rel=".../image/thumbnail" href="…cover.jpg" type="image/jpeg"/>
  //   <link rel=".../acquisition" href="….epub" type="application/epub+zip"/>

  const idMatch = entry.match(/<id>([\s\S]*?)<\/id>/);
  const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
  // Author block can repeat (translators, editors). Take the first
  // `<author><name>…</name>…</author>` block as the primary author —
  // OPDS convention is that the first one is the main author.
  const authorMatch = entry.match(
    /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/,
  );
  const langMatch = entry.match(/<dc:language>([\s\S]*?)<\/dc:language>/);
  const summaryMatch = entry.match(/<summary[^>]*>([\s\S]*?)<\/summary>/);

  if (!idMatch || !titleMatch) return null;

  // Every <link rel=… href=…/> in the entry. We then bucket by rel so
  // we can pick the EPUB (acquisition + epub+zip) and the largest cover
  // (thumbnail or image).
  const linkRegex = /<link\b([^/]*)\/>/g;
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
    if (rel.endsWith('image') && /^image\//.test(type)) {
      coverUrl = href;
    } else if (rel.endsWith('image/thumbnail') && /^image\//.test(type)) {
      coverThumbnailUrl = href;
    } else if (
      rel.endsWith('acquisition') &&
      type === 'application/epub+zip'
    ) {
      // Standard Ebooks publishes several EPUB variants per book —
      // the "advanced" one is best (uses modern EPUB3 features). We
      // pick the FIRST EPUB we encounter as a sensible default; the
      // feed orders them advanced→standard→kindle so this lands on
      // the best variant.
      if (!epubUrl) epubUrl = href;
      formats[type] = href;
    } else if (rel.endsWith('acquisition') && type) {
      // Capture other formats too so the client has alternatives if
      // EPUB fails to download. Mirrors what Gutendex returns.
      if (!formats[type]) formats[type] = href;
    }
  }

  if (!epubUrl) return null;

  // Subject tags. Standard Ebooks uses term= attributes on <category>
  // elements. Cap at 6 to match the Gutenberg-side trim.
  const categoryRegex = /<category\s+term="([^"]+)"/g;
  const tags: string[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = categoryRegex.exec(entry)) !== null && tags.length < 6) {
    const term = decodeXmlEntities(cm[1] ?? '').trim();
    if (term && !tags.includes(term)) tags.push(term);
  }

  const rawTitle = decodeXmlEntities((titleMatch[1] ?? '').trim());
  const rawAuthor = decodeXmlEntities((authorMatch?.[1] ?? 'Unknown').trim());
  const rawLang = (langMatch?.[1] ?? '').trim();
  const rawSummary = decodeXmlEntities(
    (summaryMatch?.[1] ?? '').replace(/<[^>]+>/g, '').trim(),
  );

  // ISO 639-1 normalisation — Standard Ebooks emits 'en-GB' / 'en-US'
  // but our client expects 'en'. Strip the regional subtag.
  const language = rawLang.split('-')[0]?.toLowerCase() ?? '';

  // Standard Ebooks' "id" is the book's canonical web URL. We turn
  // it into a stable string prefixed with the source so collisions
  // with Gutenberg ids are impossible. Pull the trailing path
  // segment as a slug; full URL is preserved in the link attribute
  // anyway via formats / source page references.
  const id = idToStableSlug(idMatch[1] ?? '');

  return {
    id: `standard-ebooks:${id}`,
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
    source: 'standard-ebooks',
    downloadCount: 0,
  };
}

/**
 * Standard Ebooks ids look like
 * `https://standardebooks.org/ebooks/robert-louis-stevenson/the-strange-case-of-dr-jekyll-and-mr-hyde`.
 * We just take the trailing `author/slug` and dedupe slashes.
 */
function idToStableSlug(rawId: string): string {
  const trimmed = rawId.trim().replace(/\/+$/, '');
  // After /ebooks/ is the author + slug. Fall back to the whole URL
  // (sans scheme) if the layout changes.
  const idx = trimmed.indexOf('/ebooks/');
  if (idx >= 0) {
    return trimmed
      .slice(idx + '/ebooks/'.length)
      .replace(/[^A-Za-z0-9_./-]/g, '');
  }
  return trimmed.replace(/^https?:\/\//, '').replace(/[^A-Za-z0-9_./-]/g, '');
}

/**
 * Decode the four XML entity references that appear in Standard
 * Ebooks output. We intentionally don't pull in a full XML entity
 * table — the feed is generated by a CMS that uses these four and
 * never any of the obscure ones.
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
 * Same cover proxy the client uses for Gutenberg images — keeps the
 * payload small + cached at the edge. Returns null for null inputs so
 * the client's `<Image>` falls through to the coloured initials.
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
