/**
 * discover-wikisource — fetch and normalise public-domain books from
 * Wikisource into the `DiscoverBook` shape the client already speaks
 * (matches Gutendex + Open Library).
 *
 * Wikisource has no standard OPDS catalog covering the whole site, so
 * we go through the MediaWiki Action API instead:
 *
 *   1. List validated texts from a category. Wikisource's editorial
 *      hierarchy is `Featured texts > Validated texts > Proofread
 *      texts > Regular texts`. Validated = at least two editors have
 *      verified the entire transcription matches a scan. That filter
 *      strips out half-finished and low-confidence pages — the rail
 *      is "complete, verified books only".
 *
 *   2. Batch-fetch metadata for those titles (`prop=categories`) so we
 *      can pull out the author from the `Author:Foo_Bar` category each
 *      page sits under. One round-trip for 50 books vs. 50 individual
 *      page-summary calls.
 *
 *   3. For the EPUB URL we delegate to the Wikisource Export tool
 *      (`ws-export.wmcloud.org`), which generates a fresh EPUB from the
 *      live wiki source on demand. Cheaper than maintaining a parallel
 *      EPUB cache; the tool's been stable for years.
 *
 * Auth: passthrough. CORS open. No DB writes, no secrets.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 200;

/**
 * Which Wikisource shelf to surface:
 *   - 'validated' (default) — the curated "validated" category. Most
 *     of these are recognisable classics: novels, essays, plays,
 *     historical documents.
 *   - 'featured' — even tighter editorial bar, smaller pool (~100).
 *   - 'recent' — newly added pages. Useful for a "fresh" rail.
 */
type FeedKey = 'validated' | 'featured' | 'recent';
const KNOWN_FEEDS: ReadonlySet<FeedKey> = new Set([
  'validated',
  'featured',
  'recent',
]);
const DEFAULT_FEED: FeedKey = 'validated';

// Each feed maps to a list of candidate Wikisource categories. We
// try each in order until one returns members — covers both
// Wikisource's historical category renames (e.g. "Validated" →
// "Validated_texts") and lets us bias toward higher-quality pools.
// Validated_texts is the primary source because it has thousands of
// entries (Featured_texts only has ~50-100 globally and was empty
// on our last test), and the title-pattern filter below
// (`isLikelyNonBook`) handles dropping the long-tail government
// documents and posters that Validated_texts includes.
const CATEGORY_BY_FEED: Record<FeedKey, string[]> = {
  validated: [
    'Category:Validated_texts',
    'Category:Featured_texts',
    'Category:Proofread_books',
  ],
  featured: ['Category:Featured_texts'],
  recent: ['Category:Recently_added', 'Category:New_texts'],
};

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
  source: 'wikisource';
  downloadCount: number;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  // Build the image-proxy base URL from the inbound request — same
  // project domain, swap the function name. Lets React Native's
  // Image load Wikimedia thumbnails through a host it already
  // handles reliably (`*.supabase.co`) instead of going direct to
  // upload.wikimedia.org, which Fresco silently fails on for our
  // user's device.
  //
  // Force `https://` — Supabase terminates TLS upstream of the
  // function, so `req.url` reports `http://` here even though the
  // public URL is HTTPS. React Native (and Android cleartext-
  // traffic policy) will refuse `http://` image URLs, so we MUST
  // hard-code the protocol rather than carry over the inbound one.
  const proxyHost = new URL(req.url).host;
  const proxyBase = `https://${proxyHost}/functions/v1/image-proxy`;

  const url = new URL(req.url);
  const feedParam = url.searchParams.get('feed') ?? DEFAULT_FEED;
  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const lang = (url.searchParams.get('lang') ?? 'en').trim().slice(0, 5) || 'en';
  const feed = KNOWN_FEEDS.has(feedParam as FeedKey)
    ? (feedParam as FeedKey)
    : DEFAULT_FEED;
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;
  // covers_only — when true, drop books that don't have a Wikimedia
  // `pageimage` thumbnail. The Discover rail uses this so every
  // visible card has artwork; the typeahead search pool leaves it
  // off so cover-less long-tail titles are still searchable. We
  // also bump the upstream raw-titles fetch from `limit*3` to
  // `limit*8` when this flag is set, because roughly 75% of the
  // validated-texts catalog has no pageimage — we need a bigger
  // candidate pool to reliably get `limit` cover-bearing books.
  const coversOnly = url.searchParams.get('covers_only') === 'true';

  const apiBase = `https://${lang}.wikisource.org/w/api.php`;
  const categories = CATEGORY_BY_FEED[feed];

  console.log(
    `[discover-wikisource] feed=${feed} lang=${lang} limit=${limit} covers_only=${coversOnly}`,
  );

  try {
    // 1. List members of the category. Walk the candidate-category
    //    list and use the first one that returns any members.
    //    cmnamespace=0 restricts to main-namespace pages (= actual
    //    books, not author pages, talk pages, or templates).
    //
    //    Raw-titles multiplier depends on whether we're filtering
    //    to cover-only later. The validated-texts catalog has ~25%
    //    cover hit rate, so we pull `limit * 8` candidates to
    //    reliably end up with `limit` cover-bearing books after
    //    filtering. When covers_only is false we keep the historic
    //    `limit * 3` (enough buffer for non-book / disambig drops).
    //    The 500 ceiling matches MediaWiki's `cmlimit` cap on
    //    unauthenticated requests.
    const rawMultiplier = coversOnly ? 8 : 3;
    let rawMembers: Array<{ pageid: number; ns: number; title: string }> = [];
    let usedCategory = categories[0];
    for (const candidate of categories) {
      const listParams = new URLSearchParams({
        action: 'query',
        list: 'categorymembers',
        cmtitle: candidate,
        cmnamespace: '0',
        cmlimit: String(Math.min(limit * rawMultiplier, 500)),
        cmtype: 'page',
        format: 'json',
        origin: '*',
      });
      const candidateUrl = `${apiBase}?${listParams.toString()}`;
      console.log(`[discover-wikisource] GET ${candidateUrl}`);
      const listRes = await fetch(candidateUrl, {
        headers: {
          accept: 'application/json',
          'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
        },
      });
      if (!listRes.ok) {
        console.warn(
          `[discover-wikisource] ${candidate} returned ${listRes.status}`,
        );
        continue;
      }
      const listData = (await listRes.json()) as {
        query?: {
          categorymembers?: Array<{
            pageid: number;
            ns: number;
            title: string;
          }>;
        };
      };
      const members = listData.query?.categorymembers ?? [];
      console.log(
        `[discover-wikisource] candidate=${candidate} members=${members.length}`,
      );
      if (members.length > 0) {
        rawMembers = members;
        usedCategory = candidate;
        break;
      }
    }
    // Match the multiplier above — the candidate-titles slice
    // needs to be at least as big as our planned post-filter
    // headroom so we have enough candidates to filter through.
    const titles = rawMembers
      .map((m) => m.title)
      .filter((t) => !!t)
      // Skip subpages (chapters of a multi-page work like
      // "Pride and Prejudice/Chapter 1"). We want the root book
      // page only — wsexport will gather chapters automatically.
      .filter((t) => !t.includes('/'))
      .slice(0, limit * rawMultiplier);

    // Diagnostic — distinguishes "category empty / missing" from
    // "filtered down to nothing" so we can iterate on the right
    // step. `usedCategory` is the candidate name that actually
    // returned members from the fallback loop above.
    console.log(
      `[discover-wikisource] lang=${lang} chose=${usedCategory} raw=${rawMembers.length} after_filter=${titles.length}`,
    );

    if (titles.length === 0) {
      return json({ ok: true, books: [] });
    }

    // 2. Batch-fetch metadata for those titles. Two props in one
    //    round-trip:
    //      - `categories` so we can extract the author from the
    //        `Category:Works by <Name>` (or `Category:Author:<Name>`)
    //        category each book page sits under.
    //      - `pageimages` so we can pull the page's representative
    //        image as a cover thumbnail. Wikisource book pages
    //        almost always have a scanned title-page image set as
    //        their `pageimage`, which is exactly what we want here.
    //    MediaWiki accepts up to 50 titles per call — chunk the
    //    list and fetch chunks in parallel.
    const TITLES_PER_CALL = 50;
    const titleChunks: string[][] = [];
    for (let i = 0; i < titles.length; i += TITLES_PER_CALL) {
      titleChunks.push(titles.slice(i, i + TITLES_PER_CALL));
    }
    const authorByTitle = new Map<string, string>();
    const thumbnailByTitle = new Map<string, string>();
    await Promise.all(
      titleChunks.map(async (chunk) => {
        const metaParams = new URLSearchParams({
          action: 'query',
          titles: chunk.join('|'),
          prop: 'categories|pageimages',
          cllimit: 'max',
          pithumbsize: '300',
          format: 'json',
          origin: '*',
        });
        const metaRes = await fetch(`${apiBase}?${metaParams.toString()}`, {
          headers: {
            accept: 'application/json',
            'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
          },
        });
        if (!metaRes.ok) return;
        const metaData = (await metaRes.json()) as {
          query?: {
            pages?: Record<
              string,
              {
                title?: string;
                categories?: Array<{ title: string }>;
                thumbnail?: { source?: string };
              }
            >;
          };
        };
        const pages = metaData.query?.pages ?? {};
        for (const page of Object.values(pages)) {
          if (!page.title) continue;
          const author = extractAuthorFromCategories(page.categories ?? []);
          if (author) authorByTitle.set(page.title, author);
          const thumbSrc = page.thumbnail?.source;
          if (thumbSrc) thumbnailByTitle.set(page.title, thumbSrc);
        }
      }),
    );

    // 3. Build DiscoverBook entries.
    //
    // Quality filter: drop pages whose titles match the non-book
    // heuristic (legislative bills, regulatory orders, war-poster
    // index codes, government budget statements). Author is best-
    // effort — if our category-regex resolves one we use it,
    // otherwise we fall back to "Wikisource contributors". The
    // earlier attempt at "require a resolved author" dropped the
    // rail to zero because most Wikisource pages don't categorise
    // their author through the patterns we know to look for.
    //
    // Cover image: the `pageimages` thumbnail we collected above.
    //
    // We use Wikimedia's URL directly (no weserv proxy) for two
    // reasons: (1) Wikimedia is already a global CDN with edge-
    // cached thumbnails at the size we asked for (`pithumbsize=300`)
    // so a resize layer adds no value; (2) the URLs come back with
    // `?utm_source=…` tracking params and weserv kept failing on
    // the inner-URL re-encoding, leaving thumbnails blank in the
    // rail. Stripping the query string gives us a clean, cacheable
    // URL that React Native's `<Image>` handles natively.
    //
    // Pages without a pageimage (about 75% of the long-tail
    // entries) fall back to the client's coverColor placeholder.
    //
    // Ordering: we build the full list first, then sort books with
    // a real `coverUrl` ahead of cover-less ones. Within each group
    // we preserve the upstream Wikisource ordering (alphabetical by
    // title). Why: the validated-texts category mixes high-profile
    // titles (which usually have scanned title-page thumbnails) with
    // long-tail entries that lack any image. Before this sort the
    // first 4–5 cards on the rail were often cover-less placeholders,
    // making the rail look broken even though plenty of cover-bearing
    // books existed further down. Sorting fixes the first impression
    // without dropping any books.
    const candidates: DiscoverBook[] = [];
    let droppedByFilter = 0;
    for (const title of titles) {
      if (isLikelyNonBook(title)) {
        droppedByFilter++;
        continue;
      }
      const author = authorByTitle.get(title) ?? 'Wikisource contributors';
      const thumbnail = thumbnailByTitle.get(title);
      candidates.push({
        id: `wikisource:${lang}:${title.replace(/\s+/g, '_')}`,
        title,
        author,
        language: lang,
        tags: ['wikisource'],
        coverUrl: proxyImage(proxyBase, stripQueryString(thumbnail ?? null)),
        epubUrl: buildExportUrl(lang, title),
        formats: {
          'application/epub+zip': buildExportUrl(lang, title),
        },
        about: `Public-domain edition via Wikisource (${lang}). EPUB generated on demand by the Wikisource Export tool.`,
        source: 'wikisource',
        downloadCount: 0,
      });
    }
    // Cover-only filter (rail mode). Drop cover-less entries entirely
    // so every card on the visible rail has artwork. Search-pool
    // callers leave the flag off so cover-less long-tail titles
    // remain searchable via typeahead.
    let filtered = candidates;
    let droppedByCoverFilter = 0;
    if (coversOnly) {
      const before = filtered.length;
      filtered = filtered.filter((b) => !!b.coverUrl);
      droppedByCoverFilter = before - filtered.length;
    } else {
      // Stable partition: cover-bearing books first, cover-less
      // after. `sort` in V8 is stable so ties (same group) keep
      // original order. Only applies in non-filter mode — the
      // filter mode has nothing cover-less to sort behind.
      filtered.sort((a, b) => {
        const aHas = a.coverUrl ? 1 : 0;
        const bHas = b.coverUrl ? 1 : 0;
        return bHas - aHas;
      });
    }
    const books = filtered.slice(0, limit);
    const coverCount = books.filter((b) => b.coverUrl).length;
    console.log(
      `[discover-wikisource] titles_in=${titles.length} dropped_non_book=${droppedByFilter} dropped_cover_filter=${droppedByCoverFilter} books_out=${books.length} with_cover=${coverCount}`,
    );

    return json({ ok: true, books }, 200, {
      // Cache-Control intentionally `no-store` while we iterate on
      // the catalog / filter logic. Earlier iterations were caching
      // an empty-books response at the Supabase / Cloudflare CDN
      // layer and serving it back even after we'd deployed a fixed
      // function. Once the rail stabilises we can add a modest TTL
      // (e.g. 5 min `s-maxage` + 1 hr SWR) — but the cache header
      // needs to be `no-store` during active iteration.
      'Cache-Control': 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[discover-wikisource] fetch threw:', message);
    return json({ ok: false, error: 'network_error', message }, 502);
  }
});

/**
 * Try several Wikisource category-naming conventions to pull an
 * author name out of a page's category list. Returns null when none
 * of the patterns match — callers fall back to a generic author
 * label rather than dropping the book.
 *
 * Conventions seen in the wild (en.wikisource.org):
 *   - `Category:Works by Foo Bar`     (most common for novels)
 *   - `Category:Author:Foo Bar`       (older style, still around)
 *   - `Category:Foo Bar`              (when the author has a category)
 *
 * The "Works by" prefix is the strongest signal — it's specifically
 * the author-attribution category. The "Author:" prefix is the
 * second strongest. Bare-name categories are too ambiguous on their
 * own to use without further checks, so we don't fall back to them
 * (a category like `Category:Fiction` would otherwise be picked up
 * as "author = Fiction"). Better to leave the author blank and let
 * the caller use the generic fallback.
 */
function extractAuthorFromCategories(
  categories: Array<{ title: string }>,
): string | null {
  for (const cat of categories) {
    const worksBy = cat.title?.match(/^Category:Works by (.+)$/);
    if (worksBy && worksBy[1]) {
      return worksBy[1].replace(/_/g, ' ').trim();
    }
  }
  for (const cat of categories) {
    const authorPrefix = cat.title?.match(/^Category:Author:(.+)$/);
    if (authorPrefix && authorPrefix[1]) {
      return authorPrefix[1].replace(/_/g, ' ').trim();
    }
  }
  return null;
}

/**
 * Build a Wikisource Export tool URL. The tool generates an EPUB 3
 * from the live wiki text on demand — same URL we hand to the
 * `import-from-url` edge function later.
 */
function buildExportUrl(lang: string, title: string): string {
  const params = new URLSearchParams({
    lang,
    page: title,
    format: 'epub-3',
  });
  return `https://ws-export.wmcloud.org/?${params.toString()}`;
}

/**
 * Heuristic title filter for non-book entries that slip through the
 * "must have an author" filter. Wikisource catalogs more than books
 * — legislative bills, regulatory orders, abdication speeches, war
 * posters — and many of those DO have an author categorised
 * ("by the Crown", "by the Imperial War Museum", etc.). We catch
 * the common patterns here.
 *
 * False-positive risk is real (a novel literally called "The Act"
 * would get filtered) but the patterns we look for are formal-
 * document phrasing rather than generic words. Acceptable trade for
 * a cleaner rail.
 */
function isLikelyNonBook(title: string): boolean {
  // Titles that start with a year + parenthesised number look like
  // legislative bills: "1836 (33) Registration of Births &c."
  if (/^\d{4}\s*\(\d+\)/.test(title)) return true;
  // IWMPST = Imperial War Museum poster catalog code. Always a poster.
  if (/\(IWMPST\d+\)/i.test(title)) return true;
  // Wartime "$N.NN ... Poster" titles.
  if (/poster$/i.test(title.trim())) return true;
  // Legislation: Act / Order / Regulations with a year suffix.
  // "The Abortion (Northern Ireland) (No. 2) Regulations 2020" slipped
  // through the v1 filter — adding "Regulations" closes that gap.
  if (
    /\b(?:Act|Order|Regulations)\b.*\b(?:19|20)\d{2}\b/.test(title)
  ) return true;
  // "Constitution of …" and "Bill for …" formal-document phrasing.
  if (/^Constitution of/i.test(title)) return true;
  if (/^A bill for/i.test(title)) return true;
  if (/^The .* (?:Order|Bill|Act) /.test(title)) return true;
  // Government spending/budget statements.
  if (/Spending Review$/i.test(title)) return true;
  if (/Budget Statement$/i.test(title)) return true;
  return false;
}

/**
 * Strip the `?utm_source=…&utm_campaign=…&utm_content=…` tracking
 * params MediaWiki appends to its API-returned thumbnail URLs, AND
 * decode encoded parens (`%28`/`%29`) to their literal form.
 *
 * Why decode parens:
 *   React Native's Android image pipeline (Fresco → OkHttp → URI
 *   parser) has long-standing trouble loading URLs whose path
 *   contains `%28`/`%29` — Fresco silently fails the request and
 *   the `<Image>` falls through to its `onError` branch, leaving a
 *   coloured placeholder where the cover should be. Wikimedia
 *   thumbnail filenames frequently include parentheses ("Title
 *   (cover).jpg") so almost every Wikisource title-page thumbnail
 *   hits this exact path. Decoding to literal `(` / `)` works on
 *   both iOS and Android because parens are not reserved
 *   URL-path characters, and Wikimedia's upload server accepts
 *   either form (verified: same 200 + same `etag`).
 *
 *   Limited to parens specifically — a blanket `decodeURIComponent`
 *   would corrupt encoded slashes/spaces/non-ASCII letters that
 *   ARE meaningful in path segments. The replace pair is the
 *   minimum surgical fix for the Fresco quirk.
 *
 * We deliberately do NOT proxy the URL through images.weserv.nl
 * the way the Open Library and Standard Ebooks sources do — see
 * the comment at the call site for the full reasoning. (Tested
 * directly: weserv 404s on these thumb-URL paths regardless of how
 * the inner URL is encoded.)
 */
function stripQueryString(src: string | null): string | null {
  if (!src) return null;
  const q = src.indexOf('?');
  const clean = q < 0 ? src : src.slice(0, q);
  return clean.replace(/%28/g, '(').replace(/%29/g, ')');
}

/**
 * Wrap a Wikimedia thumbnail URL through our `image-proxy` edge
 * function so React Native's Android image pipeline sees a
 * `*.supabase.co` URL (which it loads reliably) instead of going
 * direct to `upload.wikimedia.org` (which silently failed for at
 * least one tester even with the paren-decode fix above).
 *
 * Returns null when the input is null — preserves the "no cover"
 * sentinel the client uses to render the colour-block fallback.
 */
function proxyImage(proxyBase: string, src: string | null): string | null {
  if (!src) return null;
  return `${proxyBase}?url=${encodeURIComponent(src)}`;
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
