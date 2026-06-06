/**
 * discover-doab — Edge Function that fetches DOAB's REST search API
 * and normalises records into the same `DiscoverBook` shape every
 * other discovery source produces. ~80k peer-reviewed open-access
 * academic and scholarly titles — fills the contemporary-scholarship
 * gap left by the public-domain catalogs (Gutenberg, Wikisource, etc.)
 * which top out around 1928 for US works.
 *
 * Why REST instead of OAI-PMH (the originally-planned approach):
 *   DOAB exposes an OAI-PMH endpoint, but parsing OAI-PMH XML with
 *   resumption tokens AND finding usable download URLs in the
 *   dc:identifier soup AND handling cross-publisher hosts is
 *   significantly more work than what they actually provide. Their
 *   internal DSpace REST API at /rest/search returns clean JSON with:
 *     - title + author + abstract + subjects + language in a flat
 *       metadata array (simple lookups by `dc.title` etc)
 *     - bitstreams array with per-file metadata, including
 *       `oapen.identifier.downloadUrl` pointing to the actual PDF on
 *       library.oapen.org — a single domain we can allowlist (vs the
 *       wild variety of publisher domains the OAI-PMH dc:identifier
 *       URLs would resolve to)
 *     - THUMBNAIL bitstream gives us a usable cover image
 *
 * Why PDF instead of EPUB:
 *   DOAB / OAPEN distribute academic books as PDFs almost
 *   exclusively (very few publishers provide EPUB for OA scholarly
 *   work). The PdfReader path in the app already handles import,
 *   text extraction, and reading. We surface the PDF URL through
 *   the `epubUrl` field — semantically misleading but pragmatic; the
 *   import flow downloads whatever is at `source_url` and
 *   process-book detects mime type. Adding a real `pdfUrl` field
 *   would ripple through DiscoverBook, ImportableBook, and every
 *   importer call site for no operational benefit.
 *
 * Skipping rule — records WITHOUT an OAPEN-hosted PDF are dropped.
 *   Some DOAB records only have publisher-hosted downloads; we can't
 *   allowlist every academic publisher's domain, so those titles are
 *   browsable on the publisher's site but not importable through
 *   Bookflow. Filtering them server-side keeps the rail UX clean —
 *   every card the user sees is one they can actually add.
 *
 * Auth: passthrough — DOAB content is open access, no PII, anon key OK.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 500;
// We over-fetch because a fraction of DOAB records only have
// publisher-hosted PDFs and get dropped by the OAPEN-bitstream
// filter. The multiplier was 2× in v1 (empirical 60% survival was
// the conservative estimate) — in practice the OAPEN-hosted ratio
// has been closer to 80%, so 1.5× gives us comfortable buffer
// while cutting the upstream payload by ~25% (each DOAB record
// with `expand=metadata,bitstreams` is ~5 KB JSON, so 36 records
// vs 48 = ~60 KB less per refresh).
const FETCH_MULTIPLIER = 1.5;

type DiscoverBook = {
  id: string;
  title: string;
  author: string;
  language: string;
  tags: string[];
  coverUrl: string | null;
  /** Surfaced through epubUrl for compatibility with the existing
   * importer call sites — see file header comment for the
   * "PDF-as-EPUB" pragma. */
  epubUrl: string | null;
  formats: Record<string, string>;
  about: string;
  source: 'doab';
  downloadCount: number;
  sourceLabel: string;
};

// ── DOAB REST shapes (only the fields we use) ───────────────────────────────

type DoabMetadataEntry = {
  key: string;
  value: string;
  language: string | null;
  schema?: string;
  element?: string;
  qualifier?: string | null;
};

type DoabBitstream = {
  uuid: string;
  name: string | null;
  bundleName: string | null;
  mimeType: string | null;
  format: string | null;
  retrieveLink: string | null;
  metadata?: DoabMetadataEntry[] | null;
};

type DoabItem = {
  uuid: string;
  name: string | null;
  handle: string | null;
  metadata?: DoabMetadataEntry[] | null;
  bitstreams?: DoabBitstream[] | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(1, limitParam), MAX_LIMIT)
    : DEFAULT_LIMIT;
  // Optional query (typeahead). Empty/missing returns featured /
  // most-recent titles from the wildcard search.
  const query = url.searchParams.get('q')?.trim() || '*';

  // Over-fetch to compensate for records dropped by the OAPEN-bitstream filter.
  const fetchLimit = Math.min(MAX_LIMIT, limit * FETCH_MULTIPLIER);

  const upstreamUrl = new URL(
    'https://directory.doabooks.org/rest/search',
  );
  upstreamUrl.searchParams.set('query', query);
  upstreamUrl.searchParams.set('expand', 'metadata,bitstreams');
  upstreamUrl.searchParams.set('limit', String(fetchLimit));

  try {
    const res = await fetch(upstreamUrl.toString(), {
      headers: {
        accept: 'application/json',
        'user-agent': 'Bookflow/1.0 (https://getbookflow.co)',
      },
      redirect: 'follow',
    });
    if (!res.ok) {
      console.warn(`[discover-doab] upstream returned ${res.status}`);
      return json(
        {
          ok: false,
          error: 'upstream_failed',
          message: `DOAB returned ${res.status}`,
        },
        502,
      );
    }
    const items = (await res.json()) as DoabItem[];
    if (!Array.isArray(items)) {
      console.warn('[discover-doab] upstream returned non-array');
      return json(
        { ok: false, error: 'invalid_upstream', message: 'expected array' },
        502,
      );
    }
    const books: DiscoverBook[] = [];
    for (const item of items) {
      const book = normaliseItem(item);
      if (book) books.push(book);
      if (books.length >= limit) break;
    }
    return json({ ok: true, books }, 200, {
      // Academic OA catalogs move very slowly — DOAB additions land
      // in monthly batches, not daily. 6 h fresh + 24 h SWR keeps
      // upstream calls to a trickle while still rolling forward
      // within a day of any meaningful update. Pairs with the
      // client-side hourly cache bucket in fetchDoabRest, so within
      // any given hour every client + this edge cache converge on
      // the same URL → same response.
      'Cache-Control': 'public, max-age=21600, stale-while-revalidate=86400',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[discover-doab] fetch threw:', message);
    return json({ ok: false, error: 'network_error', message }, 502);
  }
});

// ─── Normalisation ───────────────────────────────────────────────────────────

function normaliseItem(item: DoabItem): DiscoverBook | null {
  const md = item.metadata ?? [];
  // Title — prefer dc.title, fall back to the item's `name` (DOAB's
  // search-result label that usually matches the title anyway).
  const title = first(md, 'dc.title') ?? item.name ?? '';
  if (!title) return null;

  // Author — DOAB stores per-author rows. Join the first 3 for the
  // card label; the rest aren't worth crowding the UI.
  const authors = many(md, 'dc.contributor.author');
  // Authors can be "Last, First" (academic convention). Flip to
  // natural order so cards read normally.
  const author = authors.slice(0, 3).map(flipName).join(', ') || 'Unknown';

  // Language — prefer ISO code field, fall back to free-text language.
  const langRaw =
    first(md, 'dc.language.iso') ?? first(md, 'dc.language') ?? '';
  const language = normaliseLanguage(langRaw);

  // Subjects / tags — cap at 6 to match the other sources.
  const tagsRaw = many(md, 'dc.subject');
  const tags: string[] = [];
  for (const t of tagsRaw) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    // Skip classification codes (e.g. "PK1-9601", "thema EDItEUR::...")
    // — they're for librarians, not readers.
    if (/^[A-Z]+\d/.test(trimmed)) continue;
    if (trimmed.includes('::')) continue;
    if (!tags.includes(trimmed)) tags.push(trimmed);
    if (tags.length >= 6) break;
  }

  // Abstract — DOAB uses dc.description.abstract for the readable
  // summary. Some records put it under dc.description instead.
  const aboutRaw =
    first(md, 'dc.description.abstract') ?? first(md, 'dc.description') ?? '';
  const about = truncate(stripHtml(aboutRaw), 280);

  // Find the OAPEN-hosted PDF + a thumbnail among the bitstreams.
  //
  // DOAB's bitstream model is unintuitive: for OAPEN-hosted books,
  // DOAB itself doesn't carry an ORIGINAL bitstream. The PDF lives on
  // library.oapen.org, and DOAB records that URL as a metadata field
  // (`oapen.identifier.downloadUrl`) attached to whichever bitstream
  // exists — usually the THUMBNAIL (cover JPEG). Some records do have
  // a real ORIGINAL with the URL on it too; the rule that catches
  // both shapes is "look for that key on ANY bitstream's metadata".
  //
  // Filter: a record only makes it through if SOME bitstream carries
  // an OAPEN download URL ending in .pdf. Records pointing only at
  // publisher-hosted downloads (Springer, etc.) get dropped here —
  // we can't allowlist every academic publisher's domain.
  let pdfUrl: string | null = null;
  let thumbBitstreamLink: string | null = null;
  for (const bs of item.bitstreams ?? []) {
    if (!pdfUrl) {
      const oapenUrl = first(
        bs.metadata ?? [],
        'oapen.identifier.downloadUrl',
      );
      if (oapenUrl && /\.pdf(\?|$)/i.test(oapenUrl)) {
        pdfUrl = canonicaliseOapenPdfUrl(oapenUrl);
      }
    }
    if (!thumbBitstreamLink && (bs.bundleName ?? '') === 'THUMBNAIL') {
      // The thumbnail bitstream's own retrieveLink points at the
      // cover JPEG on directory.doabooks.org (NOT to OAPEN — that
      // metadata field is the PDF URL). Build the absolute URL by
      // prepending DOAB's host.
      thumbBitstreamLink = bs.retrieveLink ?? null;
    }
  }
  if (!pdfUrl) return null;
  const thumbUrl = thumbBitstreamLink
    ? `https://directory.doabooks.org${thumbBitstreamLink}`
    : null;

  // Derive the Discover id from the OAPEN URL — NOT the DOAB item
  // UUID — so the DiscoverScreen "in library" reverse-map can rebuild
  // the same id from the `books.source_url` column it stores at
  // import time. The DOAB UUID would never appear in the URL; using
  // the OAPEN book id (the second numeric segment of the bitstream
  // path) keeps both sides aligned without a roundtrip lookup.
  // Falls back to the DOAB UUID for any URL we can't pattern-match
  // — those rows simply won't reverse-map and the "Add" button
  // will stay tappable, which is harmless.
  const oapenIdMatch = pdfUrl.match(
    /library\.oapen\.org\/bitstream\/handle\/[\w.]+\/(\d+)\//,
  );
  const id = oapenIdMatch
    ? `doab:${oapenIdMatch[1]}`
    : `doab:${item.uuid}`;

  return {
    id,
    title: title.trim(),
    author,
    language,
    tags,
    coverUrl: proxyCover(thumbUrl),
    epubUrl: pdfUrl,
    formats: { 'application/pdf': pdfUrl },
    about,
    source: 'doab',
    downloadCount: 0,
    sourceLabel: 'DOAB',
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * OAPEN's bitstream URLs come in two flavours:
 *   short:  /bitstream/{handlePrefix}/{bookId}/{seq}/{filename}.pdf
 *   handle: /bitstream/handle/{handlePrefix}/{bookId}/{filename}.pdf?sequence={seq}
 *
 * The short form 301-redirects to the handle form — BUT OAPEN's
 * DSpace tacks `;jsessionid=…` (a J2EE matrix parameter) onto the
 * redirect Location. Deno's fetch throws when it tries to parse and
 * follow that URL, so the edge function never gets the file. (curl
 * follows it fine; tested both with and without jsessionid and the
 * handle form returns the same 200 + PDF either way.)
 *
 * We rewrite the short form to the canonical handle form server-side
 * — no redirect needed, no jsessionid involved. If the URL doesn't
 * match the short pattern (other OAPEN paths, future variations) we
 * return it unchanged and let the importer try; worst case the
 * record is dropped and the user moves on.
 */
function canonicaliseOapenPdfUrl(url: string): string {
  // Match host first so we don't accidentally rewrite non-OAPEN URLs
  // that happen to share path structure.
  if (!/^https?:\/\/library\.oapen\.org\//i.test(url)) return url;
  const m = url.match(
    /^(https?:\/\/library\.oapen\.org)\/bitstream\/([\w.]+)\/(\d+)\/(\d+)\/([^?#]+\.pdf)$/i,
  );
  if (!m) return url;
  const [, origin, handlePrefix, bookId, sequence, filename] = m;
  return `${origin}/bitstream/handle/${handlePrefix}/${bookId}/${filename}?sequence=${sequence}`;
}

/** Look up the first metadata entry with the given key. */
function first(md: DoabMetadataEntry[], key: string): string | undefined {
  for (const m of md) {
    if (m.key === key && typeof m.value === 'string' && m.value.length > 0) {
      return m.value;
    }
  }
  return undefined;
}

/** All metadata entries with the given key. */
function many(md: DoabMetadataEntry[], key: string): string[] {
  const out: string[] = [];
  for (const m of md) {
    if (m.key === key && typeof m.value === 'string' && m.value.length > 0) {
      out.push(m.value);
    }
  }
  return out;
}

/**
 * "Last, First" → "First Last". Tolerant of names with no comma
 * (returned unchanged) and multi-comma names (only the first comma
 * is treated as the separator).
 */
function flipName(s: string): string {
  const trimmed = s.trim();
  const i = trimmed.indexOf(',');
  if (i <= 0) return trimmed;
  const last = trimmed.slice(0, i).trim();
  const first = trimmed.slice(i + 1).trim();
  if (!last || !first) return trimmed;
  return `${first} ${last}`;
}

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
  nld: 'nl',
  pol: 'pl',
};

/** Reduce whatever DOAB gives us (ISO 639-3, region-tagged, free-text)
 * to a leading ISO 639-1 code for UI consistency. Best-effort —
 * returns empty for unmappable inputs. */
function normaliseLanguage(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  // Region-tagged (en-US, fr-FR): take leading code.
  const prefix = trimmed.split(/[-_]/)[0] ?? '';
  if (prefix.length === 2) return prefix;
  if (prefix.length === 3) return THREE_TO_TWO[prefix] ?? '';
  return '';
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function truncate(s: string, max: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

/** Run cover URLs through images.weserv.nl — same pipeline as the
 * Gutenberg / Standard Ebooks / OPDS adapters. Keeps payload small,
 * caches at the edge, normalises HTTPS. */
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
