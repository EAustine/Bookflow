/**
 * process-book — Edge Function that ingests an uploaded book file.
 *
 * Flow:
 *   1. Receive POST { book_id, file_storage_path }.
 *   2. Download the file from the `books` bucket using the service-role
 *      client (bypasses Storage RLS — we trust the caller has already
 *      validated ownership).
 *   3. Detect file type from extension (.pdf | .epub).
 *   4. Parse into chapters:
 *      - EPUB: walk the spine, extract title + text from each item, strip HTML.
 *      - PDF:  unpdf for per-page text + metadata, then split on chapter heading patterns.
 *      - Scanned PDFs (no extractable text) short-circuit to 'failed' with
 *        error 'scanned_pdf' so the client can show a "use OCR" hint.
 *   5. Insert chapters rows.
 *   6. Update books.processing_status='ready' + total_chapters.
 *   7. Any failure flips books.processing_status='failed' with a message.
 *
 * The function uses the service-role key (env: SUPABASE_SERVICE_ROLE_KEY)
 * to bypass RLS — chapters has no direct user_id and joins through books,
 * but we want one path that always succeeds regardless of caller auth
 * (e.g. background retries from a cron). Authorization of the caller is
 * Supabase's default verify_jwt — see config.toml. Once a JWT passes, we
 * trust the caller passed a book_id they own; the books RLS would reject
 * that ownership check anyway if they didn't.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
// epubjs is browser-oriented and was painful in Deno (DOM shims, factory
// vs constructor confusion, slow per-item reads). We now parse EPUBs
// directly with JSZip + a small OPF parser — no DOM, no factory dance,
// and we can fan out the spine reads in parallel.
import JSZip from 'npm:jszip@3.10.1';
// unpdf is a serverless-friendly pdfjs wrapper. We use it for the
// whole PDF pipeline now: cover extraction (image bytes per page),
// per-page text (`extractText` with mergePages: false), and document
// metadata (`getMeta` for title/author from the info dictionary).
// Migrated away from `pdf-parse` which is unmaintained and was a
// Node-shim on Deno; unpdf is async-native, edge-runtime-friendly,
// and lets us reuse a single opened document for every read.
import {
  extractImages,
  extractText,
  getDocumentProxy,
  getMeta,
} from 'npm:unpdf@0.12.1';
// pdf-lib lets us splice an in-memory PDF into smaller page ranges.
// Anthropic caps PDF inputs at 100 pages / 32MB per request, so to OCR
// books larger than that we copy page slices into fresh PDFDocuments
// and send each chunk as its own Claude call.
import { PDFDocument } from 'npm:pdf-lib@1.17.1';

// ─── Constants ───────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const STORAGE_BUCKET = 'books';
const MIN_PDF_TEXT_CHARS = 100;
// Anthropic accepts PDFs up to 100 pages / 32MB per request. For larger
// books we chunk via pdf-lib and run one Claude call per chunk. 500 is
// a soft ceiling — five Haiku calls of ~$0.50 each costs ~$2.50 for a
// dense scanned textbook, which we're willing to eat. Anything bigger
// still fails to the "Switch to Full mode" UI; chunking past 500 pages
// would need a background worker and progress UI we don't have yet.
const OCR_PAGES_PER_CHUNK = 100;
const OCR_MAX_TOTAL_PAGES = 500;
const OCR_MAX_BYTES_PER_CHUNK = 32 * 1024 * 1024;
// Retry transient Anthropic errors (429, 529, network blips) before
// giving up on the whole OCR pass. Exponential backoff starting at 1s.
const OCR_MAX_RETRIES = 2;
// Target words per page. Determined by product spec — ~200 words is a
// paperback-like density and gives the user a steady, predictable dose
// of content per page across both formats.
const WORDS_PER_PAGE = 200;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Body = {
  book_id: string;
  file_storage_path: string;
};

/**
 * Fire-and-forget progress callback. Writes a short human-readable
 * message to `books.processing_message` so the client can show what
 * the server is currently doing. Pass `null` to clear the message.
 *
 * Implementations should swallow errors — a failed status write must
 * never fail the actual book processing.
 */
type ProgressReporter = (message: string | null) => void;

/**
 * One row in the `pages` table. Pages are ~200-word slices of the book's
 * content; both PDF and EPUB get sliced into this same unit.
 *
 *   - For PDFs, `pdf_page_number` carries the original page from the
 *     file so the native PDF reader can still snap to it. The text
 *     reader and AI tools operate on the slice.
 *   - For EPUBs, `pdf_page_number` is null. `html_content` is set on
 *     the *first* page of each spine item (it carries the spine's full
 *     sanitised HTML for the WebView "full mode" reader), and null on
 *     subsequent pages of that spine. Full mode resolves the right HTML
 *     by looking back to the most recent page in this book with
 *     html_content set.
 *   - `title` is set on the first page of each spine when we found a
 *     TOC label for it; null otherwise. Used to label section starts in
 *     the page navigator.
 */
type ParsedPage = {
  index: number;
  pdf_page_number: number | null;
  title: string | null;
  content: string;
  html_content: string | null;
  word_count: number;
};

/**
 * Inline image extracted from an EPUB chapter. The parser returns these
 * separately so the main handler can fan out the storage uploads in
 * parallel; chapter content carries `[[BOOKFLOW_IMG:<localId>]]` markers
 * that the handler rewrites with the final storage paths once uploads
 * complete. The reader recognises the same marker format and renders
 * an `<Image>` from the signed URL.
 */
type PendingImage = {
  localId: string;
  bytes: Uint8Array;
  contentType: string;
};

/**
 * Output from the per-format parsers. `pages` is the list of ~200-word
 * slices to insert; the main handler does the actual insert + image
 * upload + chapter-marker rewrite. `cover` is null when nothing
 * suitable was found in the file; the client falls back to the
 * coloured-tile placeholder. `images` is the inline images referenced
 * via `[[BOOKFLOW_IMG:...]]` markers in EPUB pages — PDFs always emit
 * an empty list (image positioning would require coordinate-aware
 * rendering, deferred).
 */
type ParsedBook = {
  pages: ParsedPage[];
  cover: { bytes: Uint8Array; contentType: string } | null;
  meta: { title: string | null; author: string | null };
  images: PendingImage[];
};

const IMAGE_MARKER_PREFIX = '[[BOOKFLOW_IMG:';
const IMAGE_MARKER_SUFFIX = ']]';

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { book_id, file_storage_path } = body;
  if (!book_id || !file_storage_path) {
    return json({ error: 'missing_fields' }, 400);
  }

  // Auth — process-book is invoked from two paths:
  //   1. uploadBook.ts on the client, after a successful upload
  //   2. import-from-url's background work, fire-and-forget
  // Both call sites are authenticated; we require the JWT and then
  // verify that the caller owns the book row before we touch its
  // pages. Without this, a signed-in attacker could pass a foreign
  // book_id + their own file_storage_path and overwrite another
  // user's pages with arbitrary parsed content.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'unauthorized' }, 401);
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: 'unauthorized', message: userErr?.message }, 401);
  }
  const userId = userData.user.id;

  // Service-role client. Used for everything: bypasses RLS so we can
  // download the file and write to pages/books in one path.
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Ownership check on the book.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[process-book] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // The storage path MUST live under the caller's prefix. Without
  // this an attacker could pass `{victim_uid}/...` and trick us into
  // downloading their file + writing parsed content into our book.
  // The convention is `{user_id}/{book_id}/source.{ext}` — we just
  // enforce the leading `{user_id}/` segment.
  if (!file_storage_path.startsWith(`${userId}/`)) {
    return json({ error: 'forbidden_path' }, 403);
  }

  // Bound progress reporter for this book. Writes to processing_message
  // in the background; never awaited so a slow status write can't
  // block the actual ingest pipeline.
  const reportProgress = makeProgressReporter(supabase, book_id);

  try {
    // 1. Mark processing in case the caller hadn't.
    await supabase
      .from('books')
      .update({
        processing_status: 'processing',
        processing_message: 'Downloading file…',
      })
      .eq('id', book_id);

    // 2. Download.
    const { data: blob, error: dlErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(file_storage_path);
    if (dlErr || !blob) {
      throw new Error(`download_failed: ${dlErr?.message ?? 'no blob'}`);
    }
    const buffer = new Uint8Array(await blob.arrayBuffer());
    reportProgress('Reading file…');

    // 3. Detect type & parse.
    const ext = file_storage_path.toLowerCase().split('.').pop();
    let parsed: ParsedBook;
    if (ext === 'epub') {
      parsed = await parseEpub(buffer, reportProgress);
    } else if (ext === 'pdf') {
      const pdfResult = await parsePdf(buffer, reportProgress);
      if (pdfResult.scanned) {
        await markFailed(supabase, book_id, 'scanned_pdf');
        return json({ ok: false, error: 'scanned_pdf' }, 200);
      }
      parsed = pdfResult.parsed;
    } else {
      throw new Error(`unsupported_extension: ${ext ?? '(none)'}`);
    }

    const { pages, cover, meta, images } = parsed;
    if (pages.length === 0) {
      throw new Error('no_pages_extracted');
    }

    // 4a. Upload inline images (EPUB only currently). Each image goes to
    // `{user_id}/{book_id}/images/img_{localId}.{ext}` so the per-book
    // cleanup-on-delete catches them along with the original file. We
    // do uploads in parallel; failures for individual images are
    // logged but don't block the book — the marker just resolves to
    // null and the reader skips it. Successful uploads build a
    // {localId → storagePath} map we use to rewrite page content.
    const userPrefix = file_storage_path.split('/').slice(0, -1).join('/');
    const imagePathById = new Map<string, string>();
    if (images.length > 0) {
      reportProgress(`Uploading ${images.length} image${images.length === 1 ? '' : 's'}…`);
      const t0 = Date.now();
      await Promise.all(
        images.map(async (img) => {
          try {
            const ext =
              img.contentType === 'image/png' ? 'png' :
              img.contentType === 'image/gif' ? 'gif' :
              img.contentType === 'image/webp' ? 'webp' : 'jpg';
            const path = `${userPrefix}/images/img_${img.localId}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(path, img.bytes, {
                contentType: img.contentType,
                upsert: true,
              });
            if (upErr) {
              console.warn(`[process-book] image ${img.localId} upload failed:`, upErr.message);
              return;
            }
            imagePathById.set(img.localId, path);
          } catch (err) {
            console.warn(`[process-book] image ${img.localId} upload threw:`, err);
          }
        }),
      );
      console.log(
        `[process-book] uploaded ${imagePathById.size}/${images.length} inline images in ${Date.now() - t0}ms`,
      );
    }

    // Rewrite page content with final storage paths. Markers whose
    // image failed to upload are dropped entirely so the reader doesn't
    // render a broken `<Image>`. We rewrite both the plain-text content
    // (text-mode reader) AND the HTML body (full-mode WebView) — the
    // image marker format is the same in both, so the same regex
    // applies to both fields.
    const markerRe = /\[\[BOOKFLOW_IMG:([^\]]+)\]\]/g;
    const rewriteMarkers = (s: string): string =>
      s.replace(markerRe, (_, localId: string) => {
        const path = imagePathById.get(localId);
        if (!path) return '';
        return `${IMAGE_MARKER_PREFIX}${path}${IMAGE_MARKER_SUFFIX}`;
      });
    const rewrittenPages = pages.map((p) => {
      const hasMarkerInContent = p.content.includes(IMAGE_MARKER_PREFIX);
      const hasMarkerInHtml =
        !!p.html_content && p.html_content.includes(IMAGE_MARKER_PREFIX);
      if (!hasMarkerInContent && !hasMarkerInHtml) return p;
      return {
        ...p,
        content: hasMarkerInContent ? rewriteMarkers(p.content) : p.content,
        html_content: p.html_content
          ? hasMarkerInHtml
            ? rewriteMarkers(p.html_content)
            : p.html_content
          : null,
      };
    });

    // 4b. Insert pages in one batch into the renamed `pages` table. The
    // unique index on (book_id, page_index) means re-processing a book
    // would conflict; we delete-then-insert rather than upsert because
    // a stale row count (e.g. previous run had 320 pages, this run has
    // 280) would leave orphaned high-index pages. Cleaner to clear and
    // rebuild.
    reportProgress(`Saving ${pages.length} pages…`);
    await supabase.from('pages').delete().eq('book_id', book_id);
    const rows = rewrittenPages.map((p) => ({
      book_id,
      page_index: p.index,
      pdf_page_number: p.pdf_page_number,
      title: p.title,
      content: p.content,
      html_content: p.html_content,
      word_count: p.word_count,
    }));
    const { error: insErr } = await supabase.from('pages').insert(rows);
    if (insErr) throw new Error(`pages_insert_failed: ${insErr.message}`);

    // 5. Upload extracted cover (EPUB only today). Best-effort: if the
    // upload fails we log and continue — a missing cover is a much better
    // outcome than a failed book. The path lives next to the original
    // file so cleanup-on-delete still catches it.
    let coverStoragePath: string | null = null;
    if (cover) {
      try {
        // Storage path: `{user_id}/{book_id}/cover.{ext}`. We derive the
        // user prefix from the input path rather than re-querying the row.
        const userPrefix = file_storage_path.split('/').slice(0, -1).join('/');
        const coverExt = cover.contentType === 'image/png' ? 'png' : 'jpg';
        const path = `${userPrefix}/cover.${coverExt}`;
        const { error: upErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, cover.bytes, {
            contentType: cover.contentType,
            upsert: true,
          });
        if (upErr) {
          console.warn('[process-book] cover upload failed:', upErr.message);
        } else {
          coverStoragePath = path;
        }
      } catch (err) {
        console.warn('[process-book] cover upload threw:', err);
      }
    }

    // 6. Mark ready and persist all the new metadata in one update.
    // Pages are the canonical unit; `total_chapters` now carries the
    // count of detected chapter headings (PDF) / spine TOC labels
    // (EPUB) — anything where `pages.title` is non-null. We persist
    // it so the library card / book detail can show "12 chapters"
    // without re-counting client-side. Zero is a valid count for
    // books with no detected chapters.
    //
    // We also clear processing_message here — once status is 'ready',
    // the client stops polling and the column is just dead weight if
    // we leave the last in-flight hint behind.
    const chapterCount = rewrittenPages.filter((p) => p.title).length;
    const fullUpdate: Record<string, unknown> = {
      processing_status: 'ready',
      processing_message: null,
      total_pages: pages.length,
      total_chapters: chapterCount,
    };
    if (coverStoragePath) fullUpdate.cover_storage_path = coverStoragePath;
    if (meta.title) fullUpdate.title = meta.title;
    if (meta.author) fullUpdate.author = meta.author;

    const { error: updErr } = await supabase
      .from('books')
      .update(fullUpdate)
      .eq('id', book_id);

    if (updErr) {
      console.warn('[process-book] full update failed, retrying minimal:', updErr.message);
      const { error: minErr } = await supabase
        .from('books')
        .update({
          processing_status: 'ready',
          processing_message: null,
          total_pages: pages.length,
          total_chapters: chapterCount,
        })
        .eq('id', book_id);
      if (minErr) throw new Error(`book_update_failed: ${minErr.message}`);
    }

    return json(
      { ok: true, page_count: pages.length },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[process-book] failed:', message);
    await markFailed(supabase, book_id, message);
    return json({ ok: false, error: message }, 500);
  }
});

// ─── EPUB ────────────────────────────────────────────────────────────────────

/**
 * Direct JSZip-based EPUB parser. No epubjs, no DOM shims.
 *
 *   1. Load the EPUB as a zip.
 *   2. Read META-INF/container.xml → OPF path.
 *   3. Parse OPF manifest + spine + metadata with regex (the schema is
 *      tightly constrained so this is reliable; full XML parsing would
 *      cost an extra ~1s of init for no real benefit here).
 *   4. Optionally read the NCX (EPUB2) or nav (EPUB3) for chapter labels.
 *   5. Read every spine item *in parallel* via Promise.all — the previous
 *      epubjs path serialised these reads and that was the dominant cost
 *      on large books.
 *   6. Strip HTML, count words, build chapters.
 *   7. Read cover image bytes if discoverable.
 */
async function parseEpub(
  buffer: Uint8Array,
  reportProgress: ProgressReporter = () => {},
): Promise<ParsedBook> {
  const t0 = Date.now();
  reportProgress('Opening EPUB…');
  const zip = await JSZip.loadAsync(buffer);

  // 1. Locate the OPF.
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('epub_no_container');
  const opfPath = containerXml.match(/full-path\s*=\s*"([^"]+)"/)?.[1];
  if (!opfPath) throw new Error('epub_no_opf_path');

  // 2. Read OPF.
  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error(`epub_no_opf:${opfPath}`);

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  // 3. Manifest: id → entry. Tolerant regex: matches `<item ... />` and
  // `<item ...></item>` with attributes in any order, with or without ns
  // prefixes (some publishers use `<opf:item .../>`).
  type ManifestEntry = {
    id: string;
    href: string;
    type: string;
    properties: string | null;
  };
  const manifest = new Map<string, ManifestEntry>();
  const manifestById = new Map<string, ManifestEntry>();
  for (const m of opfXml.matchAll(/<(?:\w+:)?item\b([^>]*?)\/?>/g)) {
    const attrs = m[1];
    const id = getAttr(attrs, 'id');
    const href = getAttr(attrs, 'href');
    const type = getAttr(attrs, 'media-type') ?? '';
    const properties = getAttr(attrs, 'properties');
    if (id && href) {
      const entry: ManifestEntry = { id, href, type, properties };
      manifest.set(href, entry);
      manifestById.set(id, entry);
    }
  }

  // 4. Spine: ordered list of idrefs.
  const spineRefs: string[] = [];
  for (const m of opfXml.matchAll(/<(?:\w+:)?itemref\b([^>]*?)\/?>/g)) {
    const idref = getAttr(m[1], 'idref');
    if (idref) spineRefs.push(idref);
  }
  const spineEntries = spineRefs
    .map((id) => manifestById.get(id))
    .filter((e): e is ManifestEntry => !!e);

  if (spineEntries.length === 0) {
    throw new Error('epub_no_spine');
  }

  // 5. Metadata. dc:title and dc:creator with arbitrary namespace prefix.
  const meta: { title: string | null; author: string | null } = {
    title: matchInner(opfXml, /<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.trim() || null,
    author:
      matchInner(opfXml, /<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i)?.trim() || null,
  };

  // 6. Cover discovery. Same three strategies as before; all parsed from
  // the OPF text directly.
  let coverHref: string | null = null;
  let coverContentType: string | null = null;
  for (const entry of manifest.values()) {
    if (entry.properties && /\bcover-image\b/.test(entry.properties)) {
      coverHref = entry.href;
      coverContentType = entry.type || null;
      break;
    }
  }
  if (!coverHref) {
    const metaPtr = opfXml.match(
      /<meta\b[^>]*\bname\s*=\s*"cover"[^>]*\bcontent\s*=\s*"([^"]+)"/i,
    );
    const refId = metaPtr?.[1];
    if (refId) {
      const refEntry = manifestById.get(refId);
      if (refEntry && refEntry.type.startsWith('image/')) {
        coverHref = refEntry.href;
        coverContentType = refEntry.type;
      }
    }
  }
  if (!coverHref) {
    for (const entry of manifest.values()) {
      if (/cover/i.test(entry.id) && entry.type.startsWith('image/')) {
        coverHref = entry.href;
        coverContentType = entry.type;
        break;
      }
    }
  }

  // 7. Optional TOC for chapter labels. We try EPUB3 nav first (a manifest
  // item with properties="nav"), then fall back to NCX (manifest item
  // with media-type="application/x-dtbncx+xml"). Failure is silent — we
  // fall through to numeric labels.
  const navByHref = new Map<string, string>();
  try {
    const navItem = [...manifest.values()].find(
      (e) => e.properties && /\bnav\b/.test(e.properties),
    );
    if (navItem) {
      const navXml = await zip.file(opfDir + navItem.href)?.async('string');
      if (navXml) parseNavInto(navXml, navByHref);
    } else {
      const ncxItem = [...manifest.values()].find(
        (e) => e.type === 'application/x-dtbncx+xml',
      );
      if (ncxItem) {
        const ncxXml = await zip.file(opfDir + ncxItem.href)?.async('string');
        if (ncxXml) parseNcxInto(ncxXml, navByHref);
      }
    }
  } catch (err) {
    console.warn('[process-book] toc parse failed:', err);
  }

  // 8. Read every spine item in parallel. THIS is where the old code spent
  // most of its time — N sequential awaits became N parallel reads.
  // Each chapter read also walks `<img>` tags, pulls the bytes from the
  // zip, and emits a marker so the main handler can upload + rewrite.
  // We capture both a text version (for the paginated reader, search,
  // and AI tools) and a sanitised HTML version (for the WebView "full"
  // mode that preserves headings, formatting, and inline images).
  type RawChapter = {
    content: string;
    htmlContent: string;
    title: string;
    wordCount: number;
    images: PendingImage[];
  };
  // Shared dedupe map: an EPUB's same image often appears in multiple
  // chapters (chapter-decoration banners, repeated diagrams). De-dup by
  // zip path so we upload each blob exactly once.
  const seenImages = new Map<string, string>(); // zipPath → localId
  let imageCounter = 0;
  const allImages: PendingImage[] = [];

  reportProgress(`Reading ${spineEntries.length} chapter${spineEntries.length === 1 ? '' : 's'}…`);
  const chapterReads = spineEntries.map(async (entry): Promise<RawChapter | null> => {
    const candidates = [
      opfDir + entry.href,
      entry.href,
      stripHash(opfDir + entry.href),
      stripHash(entry.href),
    ];
    let html: string | null = null;
    let resolvedPath: string | null = null;
    for (const c of candidates) {
      const file = zip.file(c);
      if (file) {
        html = await file.async('string');
        resolvedPath = c;
        break;
      }
    }
    if (!html || !resolvedPath) return null;

    // Chapter directory — used to resolve relative <img src>.
    const chapterDir = resolvedPath.includes('/')
      ? resolvedPath.slice(0, resolvedPath.lastIndexOf('/') + 1)
      : '';

    const collected: PendingImage[] = [];
    const htmlWithMarkers = await replaceImagesWithMarkers(
      html,
      chapterDir,
      zip,
      seenImages,
      () => `${++imageCounter}`,
      collected,
    );
    allImages.push(...collected);

    const text = stripHtml(htmlWithMarkers);
    if (!text || text.length < 20) return null;
    // Sanitised body HTML for WebView rendering. Same image markers as
    // the text version; the main handler rewrites them to storage paths
    // alongside the text rewrite.
    const bodyHtml = sanitizeChapterHtml(htmlWithMarkers);
    const labelKey = stripHash(entry.href);
    const title = navByHref.get(labelKey) || '';
    return {
      content: text,
      htmlContent: bodyHtml,
      title,
      wordCount: countWords(text),
      images: collected,
    };
  });

  const rawChapters = (await Promise.all(chapterReads)).filter(
    (r): r is RawChapter => r !== null,
  );

  // 8b. Slice each spine item into ~200-word pages. The first page of
  // each spine carries the spine's full sanitised HTML (for the
  // WebView "full mode" reader); subsequent pages have html_content =
  // null. Full mode resolves the right HTML by walking back to the
  // most recent page in the book that has it set.
  //
  // Spine titles (chapter labels from the TOC) are also attached only
  // to the first page of each spine — the page navigator uses them to
  // mark where each section starts.
  const pages: ParsedPage[] = [];
  let pageIndex = 0;
  for (const raw of rawChapters) {
    const slices = sliceIntoPagesByWordCount(raw.content, WORDS_PER_PAGE);
    for (let i = 0; i < slices.length; i++) {
      pages.push({
        index: pageIndex++,
        pdf_page_number: null,
        title: i === 0 ? (raw.title || null) : null,
        content: slices[i],
        html_content: i === 0 ? raw.htmlContent : null,
        word_count: countWords(slices[i]),
      });
    }
  }

  if (pages.length === 0) {
    throw new Error('no_pages_extracted_from_epub');
  }

  // 9. Cover bytes — single zip read, cheap to do inline.
  let cover: ParsedBook['cover'] = null;
  if (coverHref) {
    try {
      const candidates = [opfDir + coverHref, coverHref, coverHref.replace(/^\.?\/+/, '')];
      for (const c of candidates) {
        const file = zip.file(c);
        if (!file) continue;
        const bytes = (await file.async('uint8array')) as Uint8Array;
        if (bytes && bytes.byteLength > 0) {
          cover = { bytes, contentType: coverContentType ?? guessImageMime(coverHref) };
        }
        break;
      }
    } catch (err) {
      console.warn('[process-book] cover read failed:', err);
    }
  }

  console.log(
    `[process-book] epub parsed in ${Date.now() - t0}ms: spine_items=${rawChapters.length} pages=${pages.length} cover=${cover ? 'yes' : 'no'} title=${meta.title ? 'yes' : 'no'} images=${allImages.length}`,
  );
  return { pages, cover, meta, images: allImages };
}

/**
 * Walk an EPUB chapter's HTML, replace each `<img src="...">` with a
 * marker token, and read the referenced bytes out of the zip into a
 * `PendingImage` for the main handler to upload. Markers are wrapped
 * in their own paragraph (`\n\n` either side) so the paragraph splitter
 * downstream cleanly isolates them from surrounding text.
 *
 * Strategy:
 *   - Resolve `src` relative to the chapter's directory; fall back to
 *     the literal src and a stripped-leading-slash variant.
 *   - Skip data: URIs (we'd need to decode + handle separately; rare
 *     enough that the trade-off isn't worth it on this pass).
 *   - Reject anything that doesn't sniff as JPEG/PNG/GIF/WebP — same
 *     "don't upload unrenderable bytes" rule as the cover path.
 *   - De-dup by zip path via the shared `seen` map so the same image
 *     used in five chapters is uploaded once.
 */
async function replaceImagesWithMarkers(
  html: string,
  chapterDir: string,
  // deno-lint-ignore no-explicit-any
  zip: any,
  seen: Map<string, string>,
  nextLocalId: () => string,
  collected: PendingImage[],
): Promise<string> {
  const imgRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  const matches: { match: string; src: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html))) {
    matches.push({ match: m[0], src: m[1] });
  }
  if (matches.length === 0) return html;

  // Resolve + read in parallel; build a replacement map keyed by raw src.
  const replacements = new Map<string, string>(); // src → marker (or '' to drop)
  await Promise.all(
    matches.map(async ({ src }) => {
      if (replacements.has(src)) return;
      if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
        // Data URIs and remote URLs are skipped — we'd need a side path
        // to handle them and they're uncommon in proper EPUBs. Drop the
        // tag entirely so it doesn't pollute the text.
        replacements.set(src, '');
        return;
      }
      const candidates = [
        joinPath(chapterDir, src),
        src,
        src.replace(/^\.?\/+/, ''),
      ];
      let bytes: Uint8Array | null = null;
      let resolvedPath: string | null = null;
      for (const c of candidates) {
        const file = zip.file(c);
        if (file) {
          bytes = (await file.async('uint8array')) as Uint8Array;
          resolvedPath = c;
          break;
        }
      }
      if (!bytes || !resolvedPath || bytes.byteLength === 0) {
        replacements.set(src, '');
        return;
      }
      const mime = sniffEpubImageMime(bytes);
      if (!mime) {
        replacements.set(src, '');
        return;
      }
      let localId = seen.get(resolvedPath);
      if (!localId) {
        localId = nextLocalId();
        seen.set(resolvedPath, localId);
        collected.push({ localId, bytes, contentType: mime });
      }
      replacements.set(src, `\n\n${IMAGE_MARKER_PREFIX}${localId}${IMAGE_MARKER_SUFFIX}\n\n`);
    }),
  );

  // Apply replacements. Walking matches in order ensures multiple uses
  // of the same image each get the marker.
  let out = html;
  for (const { match, src } of matches) {
    const repl = replacements.get(src) ?? '';
    out = out.replace(match, repl);
  }
  return out;
}

/**
 * Sniff renderable image formats. Stricter than the cover sniffer
 * because the reader's <Image> only handles common web formats. SVG is
 * skipped — RN's Image doesn't render it without an extra library, and
 * EPUB SVGs are typically decorative chapter ornaments we can do
 * without on this pass.
 */
function sniffEpubImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function joinPath(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1);
  // Resolve "../" segments lexically — EPUB hrefs are filesystem-style
  // relative paths, never query strings, so this is sufficient.
  const baseParts = base.split('/').filter(Boolean);
  // base ends in '/', so its last element is empty after filter — fine.
  const relParts = rel.split('/');
  const out = [...baseParts];
  for (const part of relParts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function getAttr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`));
  return m ? m[1] : null;
}

function matchInner(haystack: string, re: RegExp): string | null {
  const m = haystack.match(re);
  if (!m) return null;
  return stripHtml(m[1]);
}

/**
 * Parse an EPUB3 nav HTML doc and populate hrefs → labels.
 * The structure is `<nav epub:type="toc"><ol><li><a href="...">Title</a>...`,
 * but we don't strictly need the toc-typed nav — any `<a href>` inside
 * a `<nav>` works for our purposes.
 */
function parseNavInto(navXml: string, out: Map<string, string>): void {
  const navBlocks = navXml.match(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi) ?? [];
  for (const block of navBlocks) {
    for (const m of block.matchAll(
      /<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    )) {
      const href = stripHash(m[1]);
      const label = stripHtml(m[2]);
      if (href && label) out.set(href, label);
    }
  }
}

/**
 * Parse an EPUB2 NCX file. navMap → navPoint → navLabel/text + content/src.
 * We don't traverse depth — flat map of href → label is enough for the
 * reader chapter list.
 */
function parseNcxInto(ncxXml: string, out: Map<string, string>): void {
  for (const m of ncxXml.matchAll(/<navPoint\b[^>]*>([\s\S]*?)<\/navPoint>/gi)) {
    const inner = m[1];
    const label = matchInner(inner, /<text\b[^>]*>([\s\S]*?)<\/text>/i)?.trim();
    const src = inner.match(/<content\b[^>]*\bsrc\s*=\s*"([^"]+)"/i)?.[1];
    if (label && src) {
      out.set(stripHash(src), label);
    }
  }
}

function guessImageMime(href: string): string {
  const lower = href.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

type PdfResult =
  | { scanned: true; parsed?: never }
  | { scanned: false; parsed: ParsedBook };

async function parsePdf(
  buffer: Uint8Array,
  reportProgress: ProgressReporter = () => {},
): Promise<PdfResult> {
  const t0 = Date.now();

  // unpdf-driven pipeline (one opened document, three reads):
  //   1. Per-page text via `extractText({ mergePages: false })` — gives
  //      us the array we slice into 200-word "pages" below AND the
  //      authoritative page count.
  //   2. Document metadata via `getMeta` for title / author from the
  //      PDF info dictionary.
  //   3. Scanned-vs-text gate: if the joined per-page text is under
  //      MIN_PDF_TEXT_CHARS, fall back to OCR (Claude vision).
  //
  // Was: `pdf-parse@1.1.1` for steps (1) and (2), then unpdf only for
  // per-page text — which meant parsing the PDF twice. The current
  // shape is one parse, three reads, and the upstream is actively
  // maintained.
  reportProgress('Extracting text from PDF…');
  const proxy = await getDocumentProxy(buffer);
  // deno-lint-ignore no-explicit-any
  const extracted = (await extractText(proxy as any, { mergePages: false })) as {
    totalPages: number;
    text: string[];
  };
  const perPageText: string[] = Array.isArray(extracted.text) ? extracted.text : [];
  const rawText = perPageText.join('\n').trim();
  // deno-lint-ignore no-explicit-any
  const metaResult = (await getMeta(proxy as any).catch(() => null)) as
    | { info?: { Title?: string; Author?: string } }
    | null;
  const pdfInfo = (metaResult?.info ?? {}) as {
    Title?: string;
    Author?: string;
  };

  if (rawText.length < MIN_PDF_TEXT_CHARS) {
    // Scanned / image-based PDF. Try OCR via Claude before giving up.
    // extractText already gave us the page count from pdf.js — much
    // more reliable than the old pdf-parse path which sometimes
    // returned 0 for pure-image PDFs.
    const pageCount = Number(extracted.totalPages ?? 0);
    if (
      ANTHROPIC_API_KEY &&
      pageCount > 0 &&
      pageCount <= OCR_MAX_TOTAL_PAGES
    ) {
      console.log(
        `[process-book] pdf has only ${rawText.length} chars of selectable text — falling back to OCR (${pageCount} pages, ${buffer.byteLength} bytes)`,
      );
      reportProgress(
        pageCount > OCR_PAGES_PER_CHUNK
          ? `Scanning ${pageCount} pages with OCR (this can take a few minutes)…`
          : `Scanning ${pageCount} pages with OCR…`,
      );
      const ocrPages = await ocrPdfWithClaude(buffer, pageCount, reportProgress);
      if (ocrPages.length > 0) {
        const meta = {
          title:
            typeof pdfInfo.Title === 'string' && pdfInfo.Title.trim()
              ? pdfInfo.Title.trim()
              : null,
          author:
            typeof pdfInfo.Author === 'string' && pdfInfo.Author.trim()
              ? pdfInfo.Author.trim()
              : null,
        };
        const cover = await extractPdfCover(buffer);
        const detectedChapters = ocrPages.filter((p) => p.title).length;
        console.log(
          `[process-book] ocr parsed in ${Date.now() - t0}ms: pdf_pages=${pageCount} extracted_pages=${ocrPages.length} chapters=${detectedChapters} cover=${cover ? 'yes' : 'no'}`,
        );
        return { scanned: false, parsed: { pages: ocrPages, cover, meta, images: [] } };
      }
      console.log('[process-book] ocr returned no pages — marking scanned');
    } else if (pageCount > OCR_MAX_TOTAL_PAGES) {
      console.log(
        `[process-book] pdf has ${pageCount} pages — exceeds OCR_MAX_TOTAL_PAGES (${OCR_MAX_TOTAL_PAGES}). Marking scanned.`,
      );
    }
    return { scanned: true };
  }

  // Slice each PDF page's text into ~200-word "pages". Most prose PDFs
  // give 1–3 slices per real page (a typical paperback page is ~250
  // words; a denser academic page might be ~500). We track
  // `pdf_page_number` on each slice so the navigation can jump back
  // and forth between the data unit and the original page.
  //
  // Chapter detection: if the top of a real PDF page looks like a
  // chapter heading ("Chapter 5", "Part II: The Voyage", "Prologue"),
  // we strip the heading out of the slice body and attach it as the
  // `title` on the first slice. The reader's ChapterSheet falls back
  // to "Page N" when title is null, so anything we successfully
  // detect just upgrades the navigator label.
  const pages: ParsedPage[] = [];
  let pageIndex = 0;
  // Track the last emitted title so we can suppress immediate
  // duplicates (a heading sometimes appears on its own "cover" page
  // and then again at the top of the body page right after it).
  let lastEmittedTitle: string | null = null;
  for (let i = 0; i < perPageText.length; i++) {
    const cleaned = normalizePdfText(perPageText[i] ?? '');
    if (!cleaned || countWords(cleaned) < 5) continue; // mostly-empty pages
    const detected = detectChapterTitle(cleaned);
    // Heading-only page (no real body). Emit one chapter marker so
    // the heading isn't lost; subsequent body pages stay as normal
    // un-titled slices.
    if (detected && countWords(detected.body) < 5) {
      const nextTitle =
        lastEmittedTitle === detected.title ? null : detected.title;
      pages.push({
        index: pageIndex++,
        pdf_page_number: i + 1,
        title: nextTitle,
        content: detected.title,
        html_content: null,
        word_count: countWords(detected.title),
      });
      if (nextTitle) lastEmittedTitle = nextTitle;
      continue;
    }
    const bodyText = detected ? detected.body : cleaned;
    const slices = sliceIntoPagesByWordCount(bodyText, WORDS_PER_PAGE);
    for (let s = 0; s < slices.length; s++) {
      // Only the first slice of a detected chapter gets the title;
      // continuation slices stay un-titled so the navigator doesn't
      // show repeated "Chapter 5 / Chapter 5 (cont.) / …" rows.
      // We also suppress the title if it matches the most recently
      // emitted one (heading repeats across consecutive PDF pages).
      let sliceTitle: string | null = null;
      if (s === 0 && detected) {
        sliceTitle =
          lastEmittedTitle === detected.title ? null : detected.title;
        if (sliceTitle) lastEmittedTitle = sliceTitle;
      }
      pages.push({
        index: pageIndex++,
        pdf_page_number: i + 1,
        title: sliceTitle,
        content: slices[s],
        // PDFs don't get full-mode HTML — the native PDF reader already
        // renders the original file with full fidelity.
        html_content: null,
        word_count: countWords(slices[s]),
      });
    }
  }

  if (pages.length === 0) {
    throw new Error('no_pages_extracted_from_pdf');
  }

  // PDF info dictionary metadata. `pdfInfo` was resolved once at the
  // top of this function alongside the rest of the document reads
  // (we don't re-parse just for the title/author).
  const meta = {
    title:
      typeof pdfInfo.Title === 'string' && pdfInfo.Title.trim()
        ? pdfInfo.Title.trim()
        : null,
    author:
      typeof pdfInfo.Author === 'string' && pdfInfo.Author.trim()
        ? pdfInfo.Author.trim()
        : null,
  };

  const cover = await extractPdfCover(buffer);

  const detectedChapters = pages.filter((p) => p.title).length;
  console.log(
    `[process-book] pdf parsed in ${Date.now() - t0}ms: pdf_pages=${perPageText.length} extracted_pages=${pages.length} chapters=${detectedChapters} cover=${cover ? 'yes' : 'no'}`,
  );

  return {
    scanned: false,
    parsed: { pages, cover, meta, images: [] },
  };
}

/**
 * Pull the largest image from page 1 of a PDF and return it as the cover.
 * unpdf's `extractImages` returns Uint8Arrays for each image XObject on
 * the page; we pick the largest by byte size as a proxy for "biggest
 * image" since that's almost certainly the cover artwork. The function
 * returns null on any failure — broken PDFs, no images, unpdf load
 * errors all collapse to "no cover".
 */
/**
 * OCR fallback for scanned / image-based PDFs. Claude (native PDF +
 * vision support) transcribes each page; we then slice the output
 * through the same word-count pipeline as text-extracted PDFs so
 * the rest of the function doesn't care where the text came from.
 *
 * Books ≤100 pages and ≤32MB go in a single Claude call.
 * Larger books get split into 100-page chunks via pdf-lib and OCR'd
 * one chunk at a time; the returned pages are renumbered so
 * `pdf_page_number` matches the original book's real page count.
 *
 * Each chunk is retried up to OCR_MAX_RETRIES times on transient
 * Anthropic errors (429 / 5xx / network blips) before giving up.
 *
 * Cost: each PDF page is roughly $0.005–0.02 on Haiku (input is
 * pricey because the page becomes high-res tokens; output is small).
 * A 100-page scanned book lands around $1–2, a 500-page textbook
 * around $5–10. Quality is good on clean scans, OK on noisy ones,
 * poor on handwriting.
 *
 * Failure modes are silent — returns [] (or a partial list if some
 * chunks succeeded) and the caller falls back to the "scanned PDF"
 * UI if nothing came back at all.
 */
async function ocrPdfWithClaude(
  buffer: Uint8Array,
  pageCount: number,
  reportProgress: ProgressReporter = () => {},
): Promise<ParsedPage[]> {
  if (!ANTHROPIC_API_KEY) return [];

  // For files within a single Claude call's limits, skip the chunking
  // dance — pdf-lib copies are not free and the original buffer is
  // already in memory.
  const oneShotOk =
    pageCount <= OCR_PAGES_PER_CHUNK &&
    buffer.byteLength <= OCR_MAX_BYTES_PER_CHUNK;
  if (oneShotOk) {
    const result = await ocrPdfChunk(buffer, pageCount, /*pageOffset=*/ 0);
    return result.pages;
  }

  // Chunk: copy each page-range into a fresh PDF and OCR independently.
  // pageOffset lets each chunk renumber its `pdf_page_number` so the
  // final array reflects the original book's real page numbers.
  const allPages: ParsedPage[] = [];
  let sourceDoc: PDFDocument;
  try {
    sourceDoc = await PDFDocument.load(buffer, {
      // The source PDF may have weird metadata or be partially
      // damaged (common in old scans). Tolerate as much as we can.
      ignoreEncryption: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[process-book] OCR chunking failed to load PDF:', message);
    return [];
  }

  const totalChunks = Math.ceil(pageCount / OCR_PAGES_PER_CHUNK);
  console.log(
    `[process-book] OCR chunking ${pageCount} pages into ${totalChunks} chunks of up to ${OCR_PAGES_PER_CHUNK} pages each`,
  );

  // Carries the last chapter title emitted across chunk boundaries so
  // a heading that straddles a boundary doesn't get emitted twice in
  // the navigator. Initial null = no prior chunk.
  let lastTitleAcrossChunks: string | null = null;
  for (let c = 0; c < totalChunks; c++) {
    const startPage = c * OCR_PAGES_PER_CHUNK; // 0-indexed
    const endPage = Math.min(startPage + OCR_PAGES_PER_CHUNK, pageCount);
    const indices = Array.from(
      { length: endPage - startPage },
      (_, i) => startPage + i,
    );
    // 1-indexed for human display, inclusive range.
    reportProgress(
      `OCR'ing pages ${startPage + 1}–${endPage} of ${pageCount}…`,
    );

    let chunkBytes: Uint8Array;
    try {
      const chunkDoc = await PDFDocument.create();
      const copied = await chunkDoc.copyPages(sourceDoc, indices);
      for (const p of copied) chunkDoc.addPage(p);
      chunkBytes = await chunkDoc.save();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[process-book] OCR chunk ${c + 1}/${totalChunks} failed to build:`,
        message,
      );
      continue;
    }

    if (chunkBytes.byteLength > OCR_MAX_BYTES_PER_CHUNK) {
      console.warn(
        `[process-book] OCR chunk ${c + 1}/${totalChunks} too large after copy (${chunkBytes.byteLength} bytes) — skipping`,
      );
      continue;
    }

    const { pages: chunkPages, lastTitle } = await ocrPdfChunk(
      chunkBytes,
      indices.length,
      /*pageOffset=*/ startPage,
      lastTitleAcrossChunks,
    );
    lastTitleAcrossChunks = lastTitle;
    // Renumber `index` to be continuous across the whole book.
    for (const p of chunkPages) {
      allPages.push({ ...p, index: allPages.length });
    }
    console.log(
      `[process-book] OCR chunk ${c + 1}/${totalChunks} returned ${chunkPages.length} pages (cumulative ${allPages.length}); lastTitle=${lastTitleAcrossChunks ?? 'null'}`,
    );
  }

  return allPages;
}

/**
 * OCR a single ≤100-page PDF chunk via Claude. Wraps the Anthropic call
 * with retry-on-transient-errors. `pageOffset` is added to each
 * returned page's `pdf_page_number` so chunked OCRs end up with real
 * book-relative numbers instead of per-chunk 1..N.
 *
 * `initialLastTitle` carries forward the last chapter title emitted
 * by the previous chunk so chapter-heading dedupe survives across
 * chunk boundaries. Without this, a heading repeated on the last
 * page of chunk N AND the first body page of chunk N+1 would show
 * up twice in the navigator. Returns the final value of
 * `lastEmittedTitle` so the orchestrator can thread it into the
 * next chunk in sequence.
 */
async function ocrPdfChunk(
  buffer: Uint8Array,
  pageCount: number,
  pageOffset: number,
  initialLastTitle: string | null = null,
): Promise<{ pages: ParsedPage[]; lastTitle: string | null }> {
  if (!ANTHROPIC_API_KEY) return { pages: [], lastTitle: initialLastTitle };
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const base64 = uint8ToBase64(buffer);
  // Sentinel split markers — chosen to be vanishingly unlikely in
  // book content. Tags work well because Claude follows XML-style
  // structure prompts more reliably than custom delimiters.
  const PAGE_OPEN = '<bf-page>';
  const PAGE_CLOSE = '</bf-page>';

  // Retry loop. Anthropic occasionally returns 429 (rate limit) or
  // 529 (overloaded) — both transient. Network errors from Deno
  // (timeouts, resets) also bubble up here. We retry up to
  // OCR_MAX_RETRIES times with exponential backoff before giving up.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= OCR_MAX_RETRIES; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: Math.min(16_000, 256 + pageCount * 800),
        system:
          'You are an OCR transcriber. The user gives you a PDF. Transcribe every page in reading order. Preserve paragraph breaks. Do NOT add commentary, page numbers, headers, or footers that are not part of the body text. If a page is blank or only contains a page number, output the marker pair with empty contents.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Transcribe this PDF page by page. Wrap each page's text exactly with ${PAGE_OPEN} and ${PAGE_CLOSE}. Output one pair per page, in order. No other text outside the markers.`,
              },
            ],
          },
        ],
      });

      const fullText = response.content
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { type: string; text: string }) => b.text)
        .join('');

      // Parse <bf-page>…</bf-page> blocks. We deliberately accept
      // pages out-of-order (extremely rare) and just iterate matches
      // in the order Claude returned them.
      const blockRe = new RegExp(`${PAGE_OPEN}([\\s\\S]*?)${PAGE_CLOSE}`, 'g');
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(fullText)) !== null) {
        matches.push(m[1] ?? '');
      }
      if (matches.length === 0) {
        // Fallback: no markers came back. Split by form-feed if
        // present, otherwise treat the whole response as one page —
        // some pages will get crammed into one slice but the user
        // still gets readable text.
        const fallback = fullText.split('\f').filter((s) => s.trim().length > 0);
        if (fallback.length > 0) matches.push(...fallback);
        else matches.push(fullText);
      }

      // Convert the OCR text into the same ParsedPage shape the
      // text-PDF path emits. Each OCR-returned page is treated as
      // one real PDF page;
      // we slice it the same way as the non-OCR path so output rows
      // are consistent and the reader UI doesn't have to special-case
      // the source of the text. `index` here is per-chunk; the caller
      // renumbers it across the whole book.
      //
      // Chapter detection mirrors the text path in parsePdf — same
      // detectChapterTitle helper, same dedupe-against-previous-title
      // logic. The intent is that an OCR'd book reads identically
      // to a text-extracted one once it lands in the reader.
      const pages: ParsedPage[] = [];
      let pageIndex = 0;
      // Seed from the previous chunk so a chapter heading sitting on
      // the chunk boundary doesn't get emitted twice.
      let lastEmittedTitle: string | null = initialLastTitle;
      for (let i = 0; i < matches.length; i++) {
        const cleaned = normalizePdfText(matches[i] ?? '');
        if (!cleaned || countWords(cleaned) < 5) continue;
        const detected = detectChapterTitle(cleaned);
        if (detected && countWords(detected.body) < 5) {
          // Heading-only page (chapter cover).
          const nextTitle =
            lastEmittedTitle === detected.title ? null : detected.title;
          pages.push({
            index: pageIndex++,
            pdf_page_number: pageOffset + i + 1,
            title: nextTitle,
            content: detected.title,
            html_content: null,
            word_count: countWords(detected.title),
          });
          if (nextTitle) lastEmittedTitle = nextTitle;
          continue;
        }
        const bodyText = detected ? detected.body : cleaned;
        const slices = sliceIntoPagesByWordCount(bodyText, WORDS_PER_PAGE);
        for (let s = 0; s < slices.length; s++) {
          let sliceTitle: string | null = null;
          if (s === 0 && detected) {
            sliceTitle =
              lastEmittedTitle === detected.title ? null : detected.title;
            if (sliceTitle) lastEmittedTitle = sliceTitle;
          }
          pages.push({
            index: pageIndex++,
            pdf_page_number: pageOffset + i + 1,
            title: sliceTitle,
            content: slices[s],
            html_content: null,
            word_count: countWords(slices[s]),
          });
        }
      }
      return { pages, lastTitle: lastEmittedTitle };
    } catch (err) {
      lastErr = err;
      if (!isRetryableOcrError(err) || attempt === OCR_MAX_RETRIES) break;
      const backoffMs = 1000 * Math.pow(2, attempt);
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[process-book] OCR chunk attempt ${attempt + 1} failed (${message}); retrying in ${backoffMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  console.warn('[process-book] OCR chunk gave up after retries:', message);
  // Pass the incoming lastTitle through unchanged — this chunk
  // emitted nothing, so dedupe state for the next chunk is whatever
  // the previous successful chunk left behind.
  return { pages: [], lastTitle: initialLastTitle };
}

/**
 * Decide whether an OCR error is worth retrying. Network errors and
 * the standard "try again later" HTTP codes get a retry; everything
 * else (4xx auth/validation, malformed PDF) doesn't — they'd fail
 * the same way next time and waste the retry budget.
 */
function isRetryableOcrError(err: unknown): boolean {
  // The Anthropic SDK throws `APIError` subclasses with a numeric
  // `status` field. Anything in 5xx is server-side or overload; 429
  // is rate-limit. Both are worth retrying.
  // deno-lint-ignore no-explicit-any
  const status = (err as any)?.status;
  if (typeof status === 'number') {
    if (status === 408 || status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }
  // No status code (e.g. fetch/DNS/TCP errors) — assume transient.
  return true;
}

/** Encode a Uint8Array as base64. Chunked so we don't blow the call
 *  stack on String.fromCharCode for large buffers. */
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)),
    );
  }
  // Deno's `btoa` accepts the binary-string form produced above.
  return btoa(binary);
}

async function extractPdfCover(buffer: Uint8Array): Promise<ParsedBook['cover']> {
  const t0 = Date.now();
  try {
    const doc = await getDocumentProxy(buffer);
    if (!doc || doc.numPages < 1) return null;

    // unpdf can return image streams in three forms: directly-usable
    // JPEG/PNG, or raw decoded pixel data (which is unrenderable as-is
    // and the previous version was happily uploading as "image/jpeg",
    // breaking the cover display). We now sniff every image's magic
    // bytes and only consider valid JPEG/PNG candidates — pick the
    // largest among those, which is overwhelmingly the cover artwork.
    const images = (await extractImages(doc, 1)) as Array<
      Uint8Array | { data: Uint8Array; key?: string }
    >;
    if (!images || images.length === 0) {
      console.log('[process-book] pdf cover: no images on page 1');
      return null;
    }

    let best: { bytes: Uint8Array; mime: string } | null = null;
    for (const entry of images) {
      const bytes =
        entry instanceof Uint8Array
          ? entry
          : (entry as { data?: Uint8Array }).data;
      if (!bytes || bytes.byteLength === 0) continue;
      const mime = sniffImageMime(bytes);
      if (!mime) continue; // raw pixel data — skip
      if (bytes.byteLength < 4 * 1024) continue; // too small to be a cover
      if (!best || bytes.byteLength > best.bytes.byteLength) {
        best = { bytes, mime };
      }
    }
    if (!best) {
      console.log(
        `[process-book] pdf cover: no usable JPEG/PNG image among ${images.length} candidates`,
      );
      return null;
    }

    console.log(
      `[process-book] pdf cover extracted in ${Date.now() - t0}ms: ${best.bytes.byteLength} bytes, ${best.mime}`,
    );
    return { bytes: best.bytes, contentType: best.mime };
  } catch (err) {
    console.warn('[process-book] pdf cover extraction failed:', err);
    return null;
  }
}

/**
 * Detect image content type from magic bytes. Returns null when the
 * bytes don't match a known renderable format — the caller should
 * skip those candidates rather than upload unrenderable data.
 */
function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return 'image/png';
    }
  }
  if (bytes.length >= 3) {
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  return null;
}

/**
 * Clean up the messy text that pdf.js (via unpdf) produces. PDFs
 * aren't a flowing text format — they're positioned glyphs, and any
 * extractor reconstructs lines heuristically. The cleanup runs in
 * deliberate order: page-segmentation first (we need page boundaries
 * to detect repeated headers/footers), then cross-line stitching
 * (de-hyphenate, soft-wrap collapse), then character-level
 * normalisation (ligatures, smart punctuation), then final whitespace
 * tidy.
 *
 * What we fix:
 *   - Form-feed page breaks (\f) → marker so we can scan per-page.
 *   - Running headers / footers: a short line that appears on ≥4
 *     pages is almost always a chapter title or book title repeated
 *     as a header. Strip every instance.
 *   - Stray page numbers: standalone digit / Roman-numeral / "Page N"
 *     / "N of M" lines, including when they appear at the top OR
 *     bottom of a page block, not just when surrounded by blank
 *     lines.
 *   - Words split across lines with hyphens: "ex-\ntending" →
 *     "extending".
 *   - Soft-wraps inside paragraphs: a newline between letters is
 *     almost always the extractor's reconstruction of word-wrap;
 *     collapse it.
 *   - Ligatures (ﬁ ﬂ ﬃ ﬄ ﬀ → fi fl ffi ffl ff) — pdf.js passes them
 *     through as single Unicode codepoints, which break word
 *     boundaries and dictionary lookups.
 *   - Soft hyphens (­) — invisible in print, garbage in text.
 *   - 3+ consecutive blank lines: collapsed to two.
 *
 * What we deliberately don't fix:
 *   - Multi-column layouts. pdf.js reads top-to-bottom-left-to-right,
 *     which mangles two-column books. Detecting + reconstructing
 *     columns is its own project.
 *   - Words that ran together because the PDF had no word spacing.
 *     Requires a dictionary, slow, and rarely needed.
 */
function normalizePdfText(text: string): string {
  let out = text;

  // 1. Character-level cleanup that's safe to do up-front.
  out = out
    .replace(/­/g, '') // soft hyphen
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/ /g, ' '); // non-breaking space → regular

  // 2. Page-aware processing. We split on form-feed if present; if not, we
  // use a heuristic: "blank line + 1-or-2 digit line + blank line" is also
  // a page boundary in most PDFs. Strip per-page headers/footers and
  // page-number lines, then re-join with paragraph breaks.
  const pages = splitIntoPages(out);

  // Detect repeated short lines (headers or footers) that appear on ≥4
  // distinct pages. These are running titles like "Chapter 3" or
  // "The Great Gatsby" that got captured by pdf-parse as standalone lines.
  const lineCounts = new Map<string, number>();
  for (const page of pages) {
    const seenInPage = new Set<string>();
    for (const line of page.split('\n')) {
      const key = line.trim();
      if (!key || key.length > 80) continue;
      if (seenInPage.has(key)) continue;
      seenInPage.add(key);
      lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
    }
  }
  const repeatedLines = new Set<string>();
  const PAGE_REPEAT_THRESHOLD = Math.min(4, Math.max(2, Math.floor(pages.length * 0.4)));
  for (const [key, count] of lineCounts) {
    if (count >= PAGE_REPEAT_THRESHOLD) repeatedLines.add(key);
  }

  // Strip per-page chrome.
  const cleanedPages = pages.map((page) => {
    const lines = page.split('\n');
    const kept: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        kept.push('');
        continue;
      }
      if (repeatedLines.has(line)) continue;
      if (isPageNumberLine(line)) continue;
      kept.push(raw);
    }
    return kept.join('\n').trim();
  });

  out = cleanedPages.filter(Boolean).join('\n\n');

  // 3. Cross-line stitching.
  // De-hyphenate words split across lines: "exam-\nple" → "example".
  // Only when the second half starts lowercase, to avoid merging
  // legitimate hyphenated headings or proper-noun fragments.
  out = out.replace(/(\w)-\n(\p{Ll})/gu, '$1$2');

  // Soft-wrap collapse: a newline between letters/punct + letter, not
  // followed by another newline, is a wrap not a paragraph break.
  out = out.replace(/(\p{L}|\p{N}|[,;])\n(?!\n)(\p{L})/gu, '$1 $2');

  // 4. Final whitespace tidy.
  out = out
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s+$/, ''))
    .join('\n');
  out = out.replace(/\n{3,}/g, '\n\n');

  return out.trim();
}

/**
 * Split pdf-parse output into rough "pages". Prefer real form-feeds; when
 * absent, fall back to detecting standalone page-number lines as page
 * separators. Pages are returned without their separator.
 */
function splitIntoPages(text: string): string[] {
  if (text.includes('\f')) {
    return text.split('\f');
  }
  // Heuristic split: a line that's just a 1–4 digit number (or Roman) on
  // its own, surrounded by blank-ish lines, marks a page boundary.
  const lines = text.split('\n');
  const pages: string[] = [];
  let buf: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && isPageNumberLine(line)) {
      const prev = i > 0 ? lines[i - 1].trim() : '';
      const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
      // Only treat as boundary when neighbours are blank — otherwise
      // mid-paragraph numerals would split a sentence in two.
      if (!prev && !next) {
        pages.push(buf.join('\n'));
        buf = [];
        continue;
      }
    }
    buf.push(lines[i]);
  }
  if (buf.length) pages.push(buf.join('\n'));
  return pages.length ? pages : [text];
}

/**
 * True for lines that almost-certainly aren't body content: bare page
 * numbers, "Page N", "N of M", and *lowercase* Roman numerals (the
 * convention used for front-matter folio numbers).
 *
 * We deliberately don't strip uppercase Roman numerals — many books use
 * them as chapter headings (I, II, III), and the chapter detector relies
 * on seeing them. Lowercase romans on their own line are almost always
 * page numbers.
 */
function isPageNumberLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^\d{1,4}$/.test(t)) return true;
  if (/^page\s+\d{1,4}$/i.test(t)) return true;
  if (/^\d{1,4}\s+of\s+\d{1,4}$/i.test(t)) return true;
  // Lowercase Roman only — uppercase often signals a chapter heading.
  if (/^[ivxlcdm]{1,6}$/.test(t)) return true;
  return false;
}

/**
 * Slice a block of text into ~targetWords-sized pages, respecting
 * paragraph boundaries when possible. Used by both PDF and EPUB paths
 * — for PDFs we feed the text of one PDF page; for EPUBs we feed one
 * spine item's text. The output is the per-page text content; the
 * caller wraps each result in a ParsedPage with the right metadata
 * (pdf_page_number, html_content, title).
 *
 * Algorithm:
 *   - Split on blank-line paragraph boundaries.
 *   - Greedily fill buckets up to targetWords; flush when adding the
 *     next paragraph would overflow.
 *   - A paragraph longer than 1.5×targetWords is split mid-paragraph
 *     on word boundaries so a single huge paragraph doesn't blow past
 *     the budget.
 *   - The trailing partial bucket flushes as its own page rather than
 *     merging into the previous one — pages should be roughly the
 *     same size, and the natural "end of section" page is usually
 *     valuable to keep distinct.
 *   - Empty input returns a single empty-string page so the caller
 *     doesn't crash on zero-length spine items (though the caller
 *     usually short-circuits on `length < 20` upstream).
 */
function sliceIntoPagesByWordCount(text: string, targetWords: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return [trimmed];

  const out: string[] = [];
  let buf: string[] = [];
  let bufWords = 0;

  const flush = () => {
    if (buf.length === 0) return;
    out.push(buf.join('\n\n'));
    buf = [];
    bufWords = 0;
  };

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    const w = words.length;

    // Long-paragraph case: split mid-paragraph on word boundaries.
    // Reason: a single 1500-word block in a literary EPUB shouldn't
    // produce a single 1500-word page that wrecks the page-count.
    if (w > targetWords * 1.5) {
      flush();
      for (let i = 0; i < words.length; i += targetWords) {
        const slice = words.slice(i, i + targetWords).join(' ');
        out.push(slice);
      }
      continue;
    }

    if (bufWords + w > targetWords && bufWords > 0) {
      flush();
    }
    buf.push(para);
    bufWords += w;
  }
  flush();

  return out.length > 0 ? out : [trimmed];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a sanitised body HTML for the WebView "full mode" renderer.
 * We want the structural and inline-formatting tags to survive
 * (paragraphs, headings, lists, bold, italic, images, blockquotes)
 * because that's the whole point of full mode — show the EPUB the way
 * its publisher laid it out. We strip:
 *
 *   - script, style, link, meta, head — not body content.
 *   - Anything that pulls in remote resources we can't authenticate
 *     (link rel=stylesheet, etc).
 *   - Class / id attributes — they reference CSS we don't ship; cleaner
 *     output for the reader's WebView template to override.
 *   - Inline `style` attributes that reference url(...) — same reason.
 *
 * What survives is essentially "browser-default-styled HTML with
 * structure + formatting + img tags". The reader then wraps this in a
 * minimal HTML document with its own typography CSS so the whole thing
 * reads consistently regardless of publisher quirks.
 */
function sanitizeChapterHtml(html: string): string {
  let out = html;
  // Drop entire head/script/style/link blocks.
  out = out.replace(/<(script|style|head|title|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  out = out.replace(/<(link|meta)\b[^>]*\/?>/gi, ' ');

  // Unwrap html/body wrappers — keep their inner content. Easier to
  // re-host inside our own template.
  out = out.replace(/<\/?(html|body)[^>]*>/gi, ' ');

  // Strip class/id and url(...) inline styles. Leave other inline
  // styles alone (they may carry inline color / alignment that
  // contributes to the original layout).
  out = out.replace(/\sclass\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\sclass\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\sid\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\sid\s*=\s*'[^']*'/gi, '');
  out = out.replace(/url\s*\(\s*[^)]*\)/gi, '');

  // Collapse runs of whitespace at the doc level (preserve <pre> by
  // scoping to outside-tag whitespace? — we accept the small
  // simplification that <pre> inside an EPUB will still read fine,
  // since most readers re-wrap whitespace themselves).
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function stripHtml(html: string): string {
  // Drop scripts and styles entirely (their text content is never reading
  // material).
  const noScripts = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ');

  // Crucially: replace block-level tags with paragraph breaks BEFORE
  // stripping all tags. The previous version collapsed every tag to a
  // single space, which turned a whole EPUB chapter (a `<p>...</p>`
  // sequence) into one giant paragraph. The reader then exploded that
  // single paragraph into thousands of tappable word-spans and crashed.
  // We map block tags → "\n\n" so the chapter survives as N paragraphs;
  // <br> gets a single newline; everything else (inline tags) becomes
  // empty so words don't accidentally fuse.
  const withBreaks = noScripts
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(
      /<\/?(p|div|section|article|aside|header|footer|nav|li|tr|td|th|h[1-6]|blockquote|pre|hr|figure|figcaption)\b[^>]*>/gi,
      '\n\n',
    );

  const noTags = withBreaks.replace(/<[^>]+>/g, '');

  // Entity decoding. Cover the common named entities, plus numeric and
  // hex character refs — EPUBs frequently use &#8217; for apostrophes
  // and similar codepoints, which the old decoder left as raw text.
  const decoded = noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, d) => safeFromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // last so we don't double-decode &amp;lt;

  // Whitespace tidy: collapse intra-line spaces but PRESERVE newlines so
  // paragraph structure survives. Then collapse runs of >2 newlines.
  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeFromCharCode(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

function stripHash(href: string): string {
  const i = href.indexOf('#');
  return i >= 0 ? href.slice(0, i) : href;
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── Chapter heading detection ───────────────────────────────────────────────

// Number forms that can follow "Chapter" / "Part":
//   - Arabic digits 1-999
//   - Roman numerals up to 7 chars (covers I to MMMCMXCIX)
//   - Spelled-out English numbers up to "Fifty" (anything more would
//     suggest detection's gone off the rails anyway)
const CHAPTER_NUMBER_RE =
  '(?:\\d{1,3}|[IVXLCDM]{1,7}|' +
  'One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|' +
  'Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|' +
  'Twenty(?:[-\\s](?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine))?|' +
  'Thirty(?:[-\\s](?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine))?|' +
  'Forty(?:[-\\s](?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine))?|' +
  'Fifty)';

// Patterns that strongly indicate a single line is a chapter heading.
// All are anchored ^...$ and case-insensitive (i flag) so we match
// uppercase variants like "CHAPTER 1" alongside title-case.
const CHAPTER_HEADING_PATTERNS: RegExp[] = [
  // "Chapter 1", "Chapter One", "CHAPTER I" — with optional inline
  // subtitle after a separator (: . - — –). Captured group #1 is
  // the subtitle (or undefined if absent).
  new RegExp(
    `^(?:Chapter)\\s+${CHAPTER_NUMBER_RE}(?:\\s*[:.\\-—–]\\s*(.{1,80}?))?\\s*$`,
    'i',
  ),
  // "Part 1" / "Part One" — same shape as Chapter.
  new RegExp(
    `^(?:Part)\\s+${CHAPTER_NUMBER_RE}(?:\\s*[:.\\-—–]\\s*(.{1,80}?))?\\s*$`,
    'i',
  ),
  // Named front/back matter sections. These are standalone words
  // that have no number; the optional capture mirrors the other
  // patterns so call-site logic is uniform.
  /^(?:Prologue|Epilogue|Introduction|Foreword|Preface|Afterword|Acknowledg[e]?ments)(?:\s*[:.\-—–]\s*(.{1,80}?))?\s*$/i,
];

// Common short connector words that stay lowercase in Title Case
// headings ("The Tale of Two Cities" — "of" doesn't count against
// the capital ratio). Used by looksLikeTitleCase to avoid penalising
// real titles for their connectors.
const TITLE_CASE_CONNECTORS =
  /^(?:a|an|and|but|or|nor|the|of|in|on|at|to|for|by|with|as|is|was|are|were|be|from|but|so|yet)$/i;

/**
 * Heuristic: does this look like Title Case rather than a sentence?
 * True for "The Beginning of the End", false for "the story begins
 * on a cold night". We skip common connectors when computing the
 * capital ratio; a string passes if ≥ 70% of the significant words
 * start with an uppercase letter.
 *
 * Used to reject paragraph fragments that the chapter-heading regex
 * captures as if they were subtitles ("Chapter 1. The story begins
 * on a cold night" — body, not subtitle).
 */
function looksLikeTitleCase(s: string): boolean {
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  if (words.length === 1) return /^\p{Lu}/u.test(words[0]);
  let cap = 0;
  let significant = 0;
  for (const w of words) {
    if (TITLE_CASE_CONNECTORS.test(w)) continue;
    significant++;
    if (/^\p{Lu}/u.test(w)) cap++;
  }
  if (significant === 0) return false;
  return cap / significant >= 0.7;
}

/**
 * Validate a candidate subtitle string. Returns false for things
 * captured by the chapter regex that look more like paragraph
 * fragments than real subtitles:
 *   - too long / too many words
 *   - ends with terminal sentence punctuation
 *   - contains mid-sentence punctuation (". The" inside)
 *   - reads as a sentence rather than Title Case
 */
function isValidSubtitle(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  if (countWords(trimmed) > 12) return false;
  if (/[.!?]$/.test(trimmed)) return false;
  if (/[.!?]\s/.test(trimmed)) return false;
  if (!/^\p{Lu}/u.test(trimmed)) return false;
  if (!looksLikeTitleCase(trimmed)) return false;
  return true;
}

/**
 * Look for a chapter heading at the top of a page's cleaned text. We
 * scan up to the first 5 non-empty lines because real chapter headings
 * sit near the page top, never buried mid-paragraph. A match consumes
 * the heading line (and an optional subtitle continuation on the next
 * line, common in "Chapter 5 / The Voyage" layouts) into `title`; the
 * remaining lines are returned as `body` so the heading doesn't appear
 * inline as page content too.
 *
 * Returns null when no heading was found, when the heading looks like
 * a TOC entry (long trailing dots / page numbers), or when the
 * matched "subtitle" reads as a paragraph fragment rather than a
 * real title.
 *
 * Conservative by design — false positives produce phantom chapter
 * rows in the navigator that confuse users, while false negatives
 * just mean the page falls back to "Page N" which is acceptable.
 */
function detectChapterTitle(
  text: string,
): { title: string; body: string } | null {
  if (!text) return null;
  const lines = text.split('\n');
  let scanned = 0;
  for (let i = 0; i < lines.length && scanned < 5; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    scanned++;
    // Skip if the line is clearly a paragraph rather than a heading.
    // Real chapter headings are short — "Chapter 1: The Beginning" is
    // ~25 chars, the longest plausible heading caps around 100.
    if (trimmed.length > 100) return null;
    // TOC-row guard: a typical table-of-contents entry looks like
    // "Chapter 1 ................... 12". Bail before trying to match
    // — the dots + trailing number are the giveaway.
    if (/\.{4,}\s*\d+\s*$/.test(trimmed)) continue;
    for (const pat of CHAPTER_HEADING_PATTERNS) {
      const m = trimmed.match(pat);
      if (!m) continue;
      let title = trimmed;
      let bodyStart = i + 1;
      const inlineSubtitleRaw = (m[1] ?? '').trim();
      const hasInlineSubtitle = inlineSubtitleRaw.length > 0;
      // Validate any inline subtitle the regex captured. The regex
      // is greedy enough to scoop up a paragraph fragment ("Chapter 1.
      // The story begins on a cold night"); isValidSubtitle filters
      // those out by requiring Title Case + reasonable length + no
      // sentence-ending punctuation.
      if (hasInlineSubtitle && !isValidSubtitle(inlineSubtitleRaw)) {
        return null;
      }
      // For bare headings ("Chapter 5"), examine the next line to:
      //   1. Reject false positives — if the matched line is
      //      *immediately* followed by a regular paragraph line
      //      (not blank, not a subtitle), this is almost certainly
      //      a paragraph that happens to start with "Chapter N."
      //   2. Consume a subtitle continuation when present
      //      ("Chapter 5\n\nThe Voyage" — common layout).
      if (!hasInlineSubtitle) {
        const nextRaw = lines[bodyStart] ?? '';
        const nextTrim = nextRaw.trim();
        const followedByBlank = nextTrim === '';
        const nextLineIsSubtitle = !!nextTrim && isValidSubtitle(nextTrim);
        if (!followedByBlank && !nextLineIsSubtitle) {
          return null;
        }
        if (nextLineIsSubtitle) {
          title = `${trimmed}: ${nextTrim}`;
          bodyStart += 1;
        }
      }
      const body = lines.slice(bodyStart).join('\n').replace(/^\s+/, '');
      // Cap the title at 160 chars — the schema column is unbounded
      // text but the UI truncates around this, and anything longer
      // almost certainly means the regex matched too greedily.
      return { title: title.slice(0, 160), body };
    }
  }
  return null;
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

async function markFailed(
  supabase: ReturnType<typeof createClient>,
  bookId: string,
  reason: string,
): Promise<void> {
  // Store the reason on processing_status itself by truncating; the schema
  // only has one text column for status. Convention: 'failed' on its own
  // for unknown errors, 'failed:<reason>' for structured ones. The client
  // splits on ':' to render the right empty state (e.g. scanned_pdf hint).
  const status =
    reason === 'scanned_pdf' ? 'failed:scanned_pdf' : `failed:${reason.slice(0, 80)}`;
  await supabase
    .from('books')
    .update({
      processing_status: status,
      // Clear the live status hint — the terminal state lives in
      // processing_status now, the message field has no useful value
      // to show alongside a failure.
      processing_message: null,
    })
    .eq('id', bookId);
}

/**
 * Build a fire-and-forget progress reporter bound to one book. The
 * callback writes to books.processing_message via the service-role
 * client; the write is non-awaited because progress hints must never
 * gate the actual processing work, and a stale message is much
 * better than a stalled book.
 *
 * The caller polls books.processing_message alongside
 * processing_status; when the message is null the UI falls back to
 * the phase-derived default ("Reading the file…").
 */
function makeProgressReporter(
  supabase: ReturnType<typeof createClient>,
  bookId: string,
): ProgressReporter {
  return (message) => {
    // Truncate so a runaway message can't fill the column.
    const value =
      message === null ? null : message.length > 240 ? message.slice(0, 240) : message;
    supabase
      .from('books')
      .update({ processing_message: value })
      .eq('id', bookId)
      .then(({ error }) => {
        if (error) {
          console.warn(
            '[process-book] processing_message update failed:',
            error.message,
          );
        }
      });
  };
}
