/**
 * import-from-url — Edge Function that imports a book from a remote
 * URL (initially Project Gutenberg, but the function is source-
 * agnostic). Mirrors the upload flow but pulls bytes from the network
 * instead of receiving them via Storage upload.
 *
 * Flow:
 *   1. Receive POST { source_url, title, author, source }.
 *   2. Authenticate the caller via JWT — we need the user_id for the
 *      books row + the storage path.
 *   3. Allowlist the source URL — only known-safe public-domain hosts.
 *      (Open EPUB endpoints can return arbitrary bytes; we restrict to
 *      sources we trust to keep this from becoming a generic file
 *      proxy.)
 *   4. Insert a books row with status='processing'.
 *   5. Stream-download the EPUB with a 50 MB size cap.
 *   6. Upload to `{user_id}/{book_id}/source.epub` in the books bucket.
 *   7. Update the books row with file_storage_path.
 *   8. Invoke process-book in the background — chunks the EPUB into
 *      pages and flips status to 'ready'.
 *   9. Return the new book_id immediately so the client can navigate
 *      to the library and watch the book's processing state via the
 *      existing realtime subscription.
 *
 * Why we insert the books row before downloading: the user sees the
 * book appear in the library instantly with a "Processing…" status
 * (BookRow already handles that state). If the download fails we
 * mark the row as failed; the realtime subscription delivers the
 * change automatically.
 *
 * Security: source_url is allowlisted by hostname. Without that an
 * attacker could feed us SSRF targets ("http://169.254.169.254/...")
 * or tarpit servers (slow byte streams that hold the function open).
 * The allowlist sticks to public-domain catalogs we vet.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const STORAGE_BUCKET = 'books';
// 50 MB — same cap the client-side uploader uses. Public-domain EPUBs
// are usually 1-5 MB; a 50 MB cap leaves comfortable headroom and rules
// out a hostile server streaming forever.
const MAX_BYTES = 50 * 1024 * 1024;
// 30s download timeout — Gutenberg's CDN typically responds in under
// 5s; anything past 30 is a stall.
const DOWNLOAD_TIMEOUT_MS = 30_000;

// Hostnames we accept source URLs from. Subdomain matches via endsWith.
// archive.org is Open Library's download host — every Open Library
// book we surface has its EPUB at `archive.org/download/{ia}/{ia}.epub`.
// ws-export.wmcloud.org is the Wikisource Export tool that turns a
// wiki page into an EPUB on demand.
//
// OPDS-adapter hosts (added with the generic discover-opds function):
//   feedbooks.com       — Feedbooks Public Domain catalog
//   manybooks.net       — ManyBooks catalog
//   doabooks.org        — DOAB academic OA books (download links live
//                          on the publisher's own domain in many cases;
//                          we add the most-common ones below)
//   oapen.org           — OAPEN academic OA books
//
// DOAB and OAPEN sometimes serve EPUBs from a publisher origin rather
// than their own host (e.g., `library.oapen.org/bitstream/...`). Both
// canonical hosts cover the common case; per-publisher domains can be
// added on demand when an import fails with `host_not_allowed`.
const ALLOWED_HOSTS = [
  'gutenberg.org',
  'www.gutenberg.org',
  'standardebooks.org',
  'archive.org',
  'ws-export.wmcloud.org',
  'feedbooks.com',
  'catalog.feedbooks.com',
  'manybooks.net',
  'doabooks.org',
  'directory.doabooks.org',
  'oapen.org',
  'library.oapen.org',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  source_url: string;
  title: string;
  author?: string;
  /** Discovery source the book came from. The set has grown over time
   * — see the comment block on `DiscoverBook.source` in
   * `src/lib/discoverApi.ts` for the full list. We accept any string
   * at the function boundary (Deno doesn't enforce TS unions at
   * runtime) and let the DB constraint catch unknowns. */
  source: string;
};

/**
 * Decide whether `source_url` points to a PDF or an EPUB. URL-based —
 * inspects the path extension and tolerates the common query/anchor/
 * Java-session suffixes (`?sequence=1`, `;jsessionid=…`, `#page=2`).
 *
 * Falls back to 'epub' because every source we'd previously connected
 * (Gutenberg, Standard Ebooks, Wikisource, Open Library) serves EPUBs.
 * The first PDF source — DOAB via library.oapen.org — is what
 * surfaced this branch.
 */
function detectFileType(sourceUrl: string): 'epub' | 'pdf' {
  // Strip query string + fragment + DSpace session-id segment so the
  // extension check sees the raw path.
  const path = sourceUrl.split('?')[0]!.split('#')[0]!.split(';')[0]!;
  if (/\.pdf$/i.test(path)) return 'pdf';
  return 'epub';
}

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

  const { source_url, title, source } = body;
  const author = body.author?.trim() ?? '';
  if (!source_url || !title || !source) {
    return json({ error: 'missing_fields' }, 400);
  }

  // 1. URL validation + allowlist.
  let parsed: URL;
  try {
    parsed = new URL(source_url);
  } catch {
    return json({ error: 'invalid_url' }, 400);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return json({ error: 'invalid_url' }, 400);
  }
  if (!ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`))) {
    return json({ error: 'host_not_allowed', message: parsed.hostname }, 400);
  }

  // 2. Authenticate the caller. We use the anon-key client + the
  // caller's JWT to resolve the user; the service-role client below
  // does the actual writes (RLS-bypassing) so we control exactly what
  // the row contains.
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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. De-dupe — if this user already has this exact source_url
  // imported (even if processing), skip and return the existing book.
  // Stops the user from accidentally importing the same Gutenberg
  // title twice.
  const { data: existing } = await supabase
    .from('books')
    .select('id, processing_status')
    .eq('user_id', userId)
    .eq('source_url', source_url)
    .maybeSingle();
  if (existing?.id) {
    return json(
      {
        book_id: existing.id,
        status: existing.processing_status ?? 'processing',
        already_imported: true,
      },
      200,
    );
  }

  // 4. Insert the books row first. Status starts as 'processing' so
  // the UI shows a spinner; gets flipped to 'ready' / 'failed' by
  // process-book once chunking completes.
  //
  // file_type is detected from the URL extension — every existing
  // source produced EPUBs, but DOAB (the first academic source)
  // serves PDFs from library.oapen.org. process-book branches on the
  // file extension of the storage path (see `file_storage_path` ext
  // sniff at process-book/index.ts line 261), so getting both the
  // DB column AND the storage path right is what flips its pipeline
  // into PDF mode.
  const fileType = detectFileType(source_url);
  const { data: inserted, error: insertErr } = await supabase
    .from('books')
    .insert({
      user_id: userId,
      title: title.trim() || 'Untitled',
      author: author || null,
      source,
      source_url,
      file_type: fileType,
      processing_status: 'processing',
    })
    .select('id')
    .single();
  if (insertErr || !inserted?.id) {
    return json(
      { error: 'insert_failed', message: insertErr?.message },
      500,
    );
  }
  const bookId = inserted.id as string;

  // 5. Background everything from here. We return the book_id to the
  // client immediately so the "Adding…" spinner clears in <500ms and
  // the user sees the book in their library right away (with a
  // "Processing…" badge). The download / upload / process-book chain
  // continues running via `EdgeRuntime.waitUntil` — the function
  // stays alive until the promise resolves, but its HTTP response
  // is already on the wire.
  //
  // Failures during the background work are written to the books
  // row as `processing_status = 'failed:<reason>'`; the client's
  // realtime subscription delivers that change so the library can
  // render a retry/remove affordance.
  // Storage path matches the canonical convention used by
  // device-upload (`uploadBook.ts` → `original.${fileType}`),
  // reprocess (`reprocessBook.ts`), and the readers
  // (`PdfReaderScreen` hard-codes the same path to fetch the PDF
  // for Full mode). Earlier versions used `source.${ext}` and got
  // away with it for EPUBs because the EPUB reader reads chunked
  // text from the `pages` table — but PDFs need the actual file,
  // and PdfReader's signed-URL lookup was therefore returning
  // `Object not found` for every imported PDF. file-extension
  // sniff in process-book also lands on the right branch.
  const storagePath = `${userId}/${bookId}/original.${fileType}`;

  const backgroundWork = async () => {
    // 5a. Download the EPUB. AbortController gives us the timeout;
    // the size check below kills oversized payloads after-the-fact
    // (the ReadableStream API would let us cancel mid-stream but
    // support varies across Deno versions).
    let bytes: Uint8Array;
    try {
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
      const res = await fetch(source_url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Bookflow/1.0' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        await markBookFailed(supabase, bookId, `download:${res.status}`);
        return;
      }
      const contentLength = Number(res.headers.get('content-length') ?? '0');
      if (contentLength > MAX_BYTES) {
        await markBookFailed(supabase, bookId, 'too_large');
        return;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        await markBookFailed(supabase, bookId, 'too_large');
        return;
      }
      if (buf.byteLength < 1024) {
        // Smaller than a kilobyte is almost certainly an error page
        // or a redirect we couldn't follow.
        await markBookFailed(supabase, bookId, 'empty_response');
        return;
      }
      bytes = buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[import-from-url] download failed:', message);
      await markBookFailed(supabase, bookId, 'download_threw');
      return;
    }

    // 5b. Upload to Storage. Path matches the upload-from-device
    // flow (`{user}/{book}/source.{ext}`) so process-book finds it
    // without any branching. Content type tracks the detected file
    // type so Storage serves the right mime for download.
    const { error: upErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, {
        contentType:
          fileType === 'pdf' ? 'application/pdf' : 'application/epub+zip',
        upsert: true,
      });
    if (upErr) {
      console.error('[import-from-url] storage upload failed:', upErr.message);
      await markBookFailed(supabase, bookId, 'storage_upload_failed');
      return;
    }

    // 5c. Patch the books row with the file path so process-book
    // can pick it up and re-runs land at the right location.
    await supabase
      .from('books')
      .update({ file_storage_path: storagePath })
      .eq('id', bookId);

    // 5d. Kick off process-book — chunks the EPUB into pages and
    // flips status to 'ready'. Fire-and-forget; process-book is its
    // own invocation with its own lifecycle.
    //
    // We explicitly forward the caller's Authorization header so
    // process-book's ownership check sees the same user identity
    // this function authenticated. Without this the invocation would
    // arrive with the service-role key as Bearer and getUser() would
    // reject it as not-a-user-jwt.
    void supabase.functions.invoke('process-book', {
      headers: { Authorization: authHeader },
      body: { book_id: bookId, file_storage_path: storagePath },
    });
  };

  // EdgeRuntime.waitUntil keeps the function alive past the response
  // so the download + upload run to completion. Falls back to a bare
  // `void` if the runtime doesn't expose waitUntil (older Deno
  // versions); in that case the response still goes out fast but the
  // background work might be cut short on cold-instance shutdown.
  const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(backgroundWork());
  } else {
    void backgroundWork();
  }

  // 6. Return the new book id immediately. The client clears its
  // "Adding…" spinner, navigates to the library, and watches
  // realtime for the row's processing → ready transition.
  return json(
    {
      book_id: bookId,
      status: 'processing',
      already_imported: false,
    },
    200,
  );
});

async function markBookFailed(
  supabase: ReturnType<typeof createClient>,
  bookId: string,
  reason: string,
) {
  try {
    await supabase
      .from('books')
      .update({ processing_status: `failed:${reason}` })
      .eq('id', bookId);
  } catch (err) {
    console.warn('[import-from-url] mark-failed threw:', err);
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
