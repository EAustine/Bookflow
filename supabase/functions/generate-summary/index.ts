/**
 * generate-summary — Edge Function that produces an LLM summary of a
 * single page of a book.
 *
 * Flow:
 *   1. Receive POST { book_id, page_index, length }.
 *   2. Look up the page row by (book_id, page_index) — service-role
 *      access bypasses RLS so we don't need to thread an auth token,
 *      but we still trust the caller (verify_jwt is the gate set in
 *      `config.toml`).
 *   3. Check the `summaries` cache by (page_id, length). Cache hit →
 *      return immediately.
 *   4. Cache miss → call Anthropic with the page content and the
 *      length-specific system + user prompt.
 *   5. Insert into `summaries` keyed by (page_id, length).
 *   6. Return JSON { summary, length, cached, page_index }.
 *
 * Errors:
 *   - 400 invalid_json / missing_fields / invalid_length / page_too_short
 *   - 404 page_not_found
 *   - 500 llm_failed (with the error message in `message` for the client
 *     to display in its failure UI)
 *
 * Why a single-page contract: the chapters → pages refactor already
 * decided the page is the canonical content unit. Multi-page summary
 * (Step 5) will layer on top by accepting `page_indices: number[]` and
 * concatenating; the cache key for that case will be the *first* page
 * id since the summaries PK is (page_id, length) — that's a follow-up.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { recordAiUsage, checkAiCreditLimit } from '../_shared/aiCredits.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type SummaryLength = 'tldr' | 'standard' | 'detailed';

type Body = {
  book_id: string;
  /**
   * Single-page form (back-compat). When `page_indices` is also
   * provided it takes precedence; this is kept so older clients keep
   * working through the rollout.
   */
  page_index?: number;
  /**
   * Multi-page form. Each entry is a 0-based DB page index. Order
   * doesn't matter — the function sorts and de-dupes server-side.
   * For "whole book" the client sends [0..totalPages-1].
   */
  page_indices?: number[];
  length: SummaryLength;
  /**
   * When true, bypass the `summaries` cache and regenerate from
   * scratch, then replace the cached row. Wired into the
   * "Submit & regenerate" affordance on the quality-rating card.
   */
  force?: boolean;
};

/**
 * Soft cap on concatenated page content sent to the LLM. Same logic
 * as the chat function: leaves room for the conversation history and
 * response inside the model's window. Multi-page requests that
 * exceed this get the prefix only — answer quality degrades on the
 * truncated tail until RAG lands.
 */
const MAX_MULTI_PAGE_CHARS = 80_000;

const VALID_LENGTHS: SummaryLength[] = ['tldr', 'standard', 'detailed'];

/**
 * Per-length prompt + max-tokens budget. Word targets are deliberately
 * generous on the lower bound so the model doesn't compress beyond
 * usefulness; the upper cap keeps "detailed" from drifting into
 * recap-the-whole-passage territory.
 */
const LENGTH_CONFIG: Record<SummaryLength, { instruction: string; maxTokens: number }> = {
  tldr: {
    instruction:
      'Summarize this passage in one short paragraph (60-100 words). Capture the core argument or event; skip examples.',
    maxTokens: 250,
  },
  standard: {
    instruction:
      'Summarize this passage in 2-3 paragraphs (150-260 words). Cover the main points and their relationship; mention one or two key examples if they\'re central.',
    maxTokens: 500,
  },
  detailed: {
    instruction:
      'Summarize this passage in 4-5 paragraphs (350-500 words). Walk through the structure of the argument or scene, including supporting examples and any notable contrasts the author draws.',
    maxTokens: 900,
  },
};

const SYSTEM_PROMPT = [
  'You are a concise, accurate book-passage summarizer.',
  'Stay grounded in the text — do not introduce details that aren\'t directly supported.',
  'Use plain language.',
  'Output the summary only — no preamble, no headings, no "this passage…" framing.',
  '',
  'The text is divided by markers like [Page 15 | printed xii | Chapter 3].',
  'Cite the page for each substantive claim, as "(p. 15)".',
  'Use ONLY page numbers that appear in those markers. If you are unsure which',
  'page a point came from, leave the citation off rather than guessing — an',
  'unsourced sentence is recoverable, a wrong page number is not.',
  'The markers are not part of the passage; never quote or describe them.',
].join('\n');

/**
 * Page numbers the model cited, as `(p. 15)` or `(pp. 15-16)`.
 *
 * Used to verify citations against what was actually retrieved. The
 * product principle is that every AI claim cites back to its source;
 * a citation pointing at a page the model never saw is worse than none,
 * because it looks checkable and isn't.
 */
function extractCitedPages(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(/\(pp?\.\s*([0-9]+(?:\s*[-\u2013]\s*[0-9]+)?)\)/g)) {
    const span = m[1] ?? '';
    for (const n of span.split(/[-\u2013]/)) {
      const v = Number.parseInt(n.trim(), 10);
      if (Number.isFinite(v)) out.add(v);
    }
  }
  return [...out];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(
      { error: 'server_misconfigured', message: 'ANTHROPIC_API_KEY not set' },
      500,
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { book_id, length } = body;
  if (!book_id || !length) {
    return json({ error: 'missing_fields' }, 400);
  }
  if (!VALID_LENGTHS.includes(length)) {
    return json({ error: 'invalid_length' }, 400);
  }

  // Resolve the requested page indices: `page_indices` (multi-page)
  // wins over `page_index` (legacy single-page) when both are sent.
  // Sort + de-dupe server-side so the cache key + concatenation is
  // deterministic regardless of client order.
  let requestedIndices: number[];
  if (Array.isArray(body.page_indices) && body.page_indices.length > 0) {
    requestedIndices = [...new Set(body.page_indices)]
      .filter((n) => Number.isInteger(n) && n >= 0)
      .sort((a, b) => a - b);
  } else if (typeof body.page_index === 'number' && body.page_index >= 0) {
    requestedIndices = [body.page_index];
  } else {
    return json({ error: 'missing_fields' }, 400);
  }
  if (requestedIndices.length === 0) {
    return json({ error: 'no_pages_requested' }, 400);
  }

  const isMultiPage = requestedIndices.length > 1;
  const primaryPageIndex = requestedIndices[0];

  // Auth — resolve the caller via anon-key client (RLS-respecting).
  // The service-role client below bypasses RLS so we MUST validate
  // book ownership before reading pages.
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

  // Ownership check before reading the book's pages with service-role.
  // Without this any signed-in user could summarise any other user's
  // book content by guessing book_ids — and the resulting summary
  // would be cached on `(page_id, length)` so the leak would persist.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[generate-summary] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // 1. Fetch the page row(s). For single-page we use maybeSingle so a
  // miss surfaces as `page_not_found`; for multi-page we accept any
  // subset of the requested indices that actually exist.
  const { data: pageRows, error: pageErr } = await supabase
    .from('pages')
    // pdf_page_number, page_label and the chapter title are what make a
    // citation point at something the user can open. Without them the
    // model can only say "the passage", which is the problem this fixes.
    .select('id, page_index, content, word_count, pdf_page_number, page_label, chapters(title)')
    .eq('book_id', book_id)
    .in('page_index', requestedIndices)
    .order('page_index', { ascending: true });

  if (pageErr) {
    return json({ error: 'page_lookup_failed', message: pageErr.message }, 500);
  }
  const pages = (pageRows ?? []) as Array<{
    id: string;
    page_index: number;
    content: string | null;
    word_count: number | null;
    pdf_page_number: number | null;
    page_label: string | null;
    /**
     * PostgREST returns an embedded resource as an ARRAY unless it can
     * prove the relationship is to-one, and it cannot here until the
     * generated types know about `pages.chapter_id`. Typed as both
     * shapes and normalised below — asserting the object shape would
     * have made `chapters?.title` silently undefined at runtime, so the
     * chapter would never have appeared in a page marker.
     */
    chapters: { title: string }[] | { title: string } | null;
  }>;
  if (pages.length === 0) {
    return json({ error: 'page_not_found' }, 404);
  }

  /**
   * The page number a citation should use.
   *
   * `pdf_page_number` when the source is a PDF, because that is what the
   * Full view shows and what the user means by "page 15". Falls back to
   * `page_index + 1` for EPUB, which has no original pages.
   *
   * Correct for both extraction versions. At version 1 several rows
   * share one `pdf_page_number` — that is accurate, not a bug: those
   * rows really were slices of one page.
   */
  const citePage = (p: { page_index: number; pdf_page_number: number | null }) =>
    p.pdf_page_number ?? p.page_index + 1;

  /** The set of pages actually in context. Citations are checked against it. */
  const pagesInContext = new Set(pages.map(citePage));

  /**
   * `[Page 15 | printed xii | Chapter 3]` ahead of each page's text.
   *
   * Every page is marked, including in single-page mode. The model
   * cannot cite a number it was never shown, and a summary that says
   * "(p. 15)" without the marker is the model guessing.
   */
  const pageMarker = (p: typeof pages[number]) => {
    const parts = [`Page ${citePage(p)}`];
    if (p.page_label) parts.push(`printed ${p.page_label}`);
    const chapter = Array.isArray(p.chapters)
      ? p.chapters[0]?.title
      : p.chapters?.title;
    if (chapter) parts.push(chapter);
    return `[${parts.join(' | ')}]`;
  };

  // 2. Build the source text, page-anchored.
  let sourceText: string;
  let truncated = false;
  {
    let buf = '';
    for (const p of pages) {
      if (!p.content) continue;
      const block = `${pageMarker(p)}\n${p.content.trim()}`;
      if (isMultiPage && buf.length + block.length > MAX_MULTI_PAGE_CHARS) {
        buf += block.slice(0, Math.max(0, MAX_MULTI_PAGE_CHARS - buf.length));
        truncated = true;
        break;
      }
      buf += block + '\n\n';
    }
    sourceText = buf.trim();
  }
  if (!isMultiPage && sourceText.length < 50 + 20) {
    return json({ error: 'page_too_short' }, 400);
  }
  if (isMultiPage && sourceText.length < 100) {
    return json({ error: 'page_too_short' }, 400);
  }
  if (truncated) {
    console.log(
      `[generate-summary] multi-page text truncated to ${MAX_MULTI_PAGE_CHARS} chars (${pages.length} pages requested)`,
    );
  }

  // 3. Cache lookup — only for the single-page path. Multi-page
  // requests skip the cache for now: the (page_id, length) PK on
  // `summaries` doesn't naturally encode a page set, and cache hit
  // rate on user-arbitrary ranges is low. A future schema change
  // (separate `summary_runs` table keyed by content hash) can lift
  // this restriction.
  //
  // `force: true` (from the client's "Submit & regenerate" button)
  // skips the lookup entirely AND deletes the existing row so the
  // forthcoming insert lands cleanly without a PK conflict.
  const forceRefresh = body?.force === true;
  if (!isMultiPage) {
    const single = pages[0];
    if (forceRefresh) {
      const { error: delErr } = await supabase
        .from('summaries')
        .delete()
        .eq('page_id', single.id)
        .eq('length', length);
      if (delErr) {
        console.warn(
          '[generate-summary] force-regenerate delete failed (continuing):',
          delErr.message,
        );
      }
    } else {
      const { data: cached } = await supabase
        .from('summaries')
        .select('content, generated_at')
        .eq('page_id', single.id)
        .eq('length', length)
        .maybeSingle();

      if (cached?.content) {
        return json(
          {
            summary: cached.content,
            length,
            cached: true,
            page_index: primaryPageIndex,
            page_indices: [primaryPageIndex],
          },
          200,
        );
      }
    }
  }

  // 3. Cache miss — call Anthropic. Haiku 4.5 is the right pick for
  // summary work: fast, inexpensive, plenty of capability for
  // condensing prose. We don't need streaming for first-cut UX.
  // Server-authoritative credit gate. Cache hits returned earlier (free);
  // only fresh generations reach here.
  const creditGate = await checkAiCreditLimit(supabase, userId);
  if (!creditGate.allowed) {
    return json(
      { error: 'credit_limit_reached', message: 'Monthly AI credit limit reached.' },
      402,
    );
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const config = LENGTH_CONFIG[length];

  const t0 = Date.now();
  try {
    const userContent = isMultiPage
      ? `${config.instruction}\n\nThis is a passage covering ${pages.length} pages. Synthesise across them; don't summarise each in turn.\n\n---\n\n${sourceText}`
      : `${config.instruction}\n\n---\n\n${sourceText}`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const summary = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!summary) {
      return json({ error: 'no_summary_generated' }, 500);
    }

    // Verify every citation points at a page that was actually in
    // context. A hallucinated page number is worse than no citation:
    // it looks checkable, so the user trusts it, and source
    // traceability is a marketed promise rather than a nicety.
    //
    // Stripped rather than regenerated. The prose is still grounded —
    // only the pointer is wrong — and a retry costs the user credits
    // for a result that is mostly right.
    const cited = extractCitedPages(summary);
    const invalid = cited.filter((n) => !pagesInContext.has(n));
    let cleanedSummary = summary;
    if (invalid.length > 0) {
      console.warn(
        `[generate-summary] dropped citations to pages not in context: ${invalid.join(', ')} ` +
          `(context had ${[...pagesInContext].join(', ')})`,
      );
      cleanedSummary = summary.replace(
        /\s*\(pp?\.\s*[0-9]+(?:\s*[-\u2013]\s*[0-9]+)?\)/g,
        (match) => {
          const nums = extractCitedPages(match);
          return nums.every((n) => pagesInContext.has(n)) ? match : '';
        },
      );
    }

    // 4. Persist (single-page only — see cache-lookup note above for
    // why multi-page skips this). Failure here is non-fatal: we still
    // return the summary; a future re-request will just regenerate
    // and try the insert again.
    if (!isMultiPage) {
      const { error: insertErr } = await supabase
        .from('summaries')
        .insert({ page_id: pages[0].id, length, content: cleanedSummary });

      if (insertErr) {
        console.warn(
          '[generate-summary] cache insert failed:',
          insertErr.message,
        );
      }
    }

    // Record AI-credit usage (best-effort; never blocks the response).
    await recordAiUsage(supabase, {
      userId,
      tool: 'summary',
      bookId: book_id,
      model: 'claude-haiku-4-5-20251001',
      usage: response.usage,
    });

    console.log(
      `[generate-summary] generated in ${Date.now() - t0}ms (length=${length} pages=${pages.length} words=${cleanedSummary.split(/\s+/).length} cited=${cited.join('/') || 'none'})`,
    );

    return json(
      {
        summary: cleanedSummary,
        length,
        cached: false,
        page_index: primaryPageIndex,
        page_indices: pages.map((p) => p.page_index),
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-summary] anthropic call failed:', message);
    return json({ error: 'llm_failed', message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
