/**
 * generate-starters — Edge Function that produces 3 chat starter
 * questions for a single book. Used by ChatScreen ("Ask about the
 * book") so the suggested questions are about THIS book's actual
 * content rather than hardcoded fixtures.
 *
 * Flow:
 *   1. Receive POST { book_id }.
 *   2. Look up the book. If `suggested_questions` is already populated,
 *      return it immediately (this is the cache).
 *   3. Otherwise sample the book's content (first ~6 pages — enough to
 *      cover setup, characters, themes, opening conflict).
 *   4. Ask Claude Haiku 4.5 for 3 specific questions about the book.
 *   5. Persist the array onto books.suggested_questions and return it.
 *
 * Why Haiku: this is one short generation per book, lifetime; cost is
 * negligible. Sonnet would be overkill for "produce three reading-
 * group questions about this passage". The cached column means we pay
 * exactly once per book regardless of how many times the user opens
 * the chat screen.
 *
 * Why store on the books row (not a separate table): we always read
 * it alongside the book row, there's exactly one set per book, and
 * useBooks already pulls the row — adding the column avoids a join.
 *
 * Errors:
 *   - 400 invalid_json / missing_fields
 *   - 404 book_not_found / book_empty (no pages yet — still processing)
 *   - 500 server_misconfigured / persist_failed
 *   - 502 llm_failed / invalid_llm_output
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// 6 pages × ~200 words is enough context to derive interesting,
// book-specific questions without spending a lot of tokens.
const SAMPLE_PAGES = 6;
// Hard cap on the per-page chars we feed in — pages with very long
// content (rare; usually only the legacy first-page from very old
// uploads) shouldn't blow the token budget.
const MAX_CHARS_PER_PAGE = 3000;
const QUESTION_COUNT = 3;

const SYSTEM_PROMPT = `You are a thoughtful reading-group facilitator. Given a sample of a book's opening pages, propose ${QUESTION_COUNT} specific, open-ended questions a curious reader might want to explore.

Rules:
- Each question must be specific to THIS book — reference characters, places, events, themes that appear in the sample. Generic questions ("what are the main themes?") are not acceptable.
- Each question should invite analysis, not have a single factual answer (no "What year is it set in?").
- Keep each question to 1 sentence, under 18 words.
- Return ONLY valid JSON in this exact shape:
{"questions": ["...", "...", "..."]}
- No prose, no preamble, no markdown fences.`;

type Body = { book_id: string };

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
  if (!body.book_id) {
    return json({ error: 'missing_fields' }, 400);
  }

  // Auth — resolve the caller via anon-key client (RLS-respecting).
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

  // 1. Book lookup — and double as the ownership check. Selecting
  // with `user_id = jwt_uid` ensures the caller can only fetch
  // starters for their own books, even though the queries below run
  // as service-role and would otherwise bypass RLS.
  const { data: bookRow, error: bookErr } = await supabase
    .from('books')
    .select('id, title, author, suggested_questions')
    .eq('id', body.book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (bookErr) {
    return json({ error: 'book_lookup_failed', message: bookErr.message }, 500);
  }
  if (!bookRow) {
    return json({ error: 'book_not_found' }, 404);
  }

  if (
    Array.isArray(bookRow.suggested_questions) &&
    bookRow.suggested_questions.length >= QUESTION_COUNT
  ) {
    return json(
      {
        questions: bookRow.suggested_questions.slice(0, QUESTION_COUNT),
        cached: true,
      },
      200,
    );
  }

  // 2. Sample the opening pages.
  const { data: pages, error: pagesErr } = await supabase
    .from('pages')
    .select('page_index, content')
    .eq('book_id', body.book_id)
    .order('page_index', { ascending: true })
    .limit(SAMPLE_PAGES);
  if (pagesErr) {
    return json({ error: 'pages_lookup_failed', message: pagesErr.message }, 500);
  }
  const usable = (pages ?? [])
    .map((p) => ({
      page_index: p.page_index as number,
      content: typeof p.content === 'string' ? p.content : '',
    }))
    .filter((p) => p.content.trim().length >= 80);
  if (usable.length === 0) {
    return json({ error: 'book_empty' }, 404);
  }

  const sample = usable
    .map(
      (p) =>
        `--- Page ${p.page_index + 1} ---\n${p.content.slice(0, MAX_CHARS_PER_PAGE).trim()}`,
    )
    .join('\n\n');

  // 3. LLM call.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const userPrompt = `Book: "${bookRow.title}"${
    bookRow.author ? ` by ${bookRow.author}` : ''
  }\n\nSample passage:\n\n${sample}\n\nGenerate ${QUESTION_COUNT} starter questions in the JSON format described.`;

  let questions: string[];
  try {
    const t0 = Date.now();
    const result = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    console.log(`[generate-starters] haiku in ${Date.now() - t0}ms`);

    const text = result.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text?: string }) => b.text ?? '')
      .join('')
      .trim();

    questions = parseQuestions(text);
    if (!questions || questions.length < QUESTION_COUNT) {
      console.warn('[generate-starters] invalid model output:', text.slice(0, 200));
      return json({ error: 'invalid_llm_output' }, 502);
    }
    questions = questions.slice(0, QUESTION_COUNT);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-starters] anthropic call failed:', message);
    return json({ error: 'llm_failed', message }, 502);
  }

  // 4. Persist. Failure is non-fatal — we can still return the
  // generated questions; the next call will just re-generate.
  const { error: persistErr } = await supabase
    .from('books')
    .update({ suggested_questions: questions })
    .eq('id', body.book_id);
  if (persistErr) {
    console.warn('[generate-starters] persist failed:', persistErr.message);
  }

  return json({ questions, cached: false }, 200);
});

/**
 * Strip code fences / surrounding prose and parse the JSON object the
 * model is supposed to return. Mirrors the recovery logic in
 * generate-practice — Haiku occasionally hedges with a leading sentence
 * or wraps in ```json fences even with explicit instructions.
 */
function parseQuestions(text: string): string[] {
  if (!text) return [];
  let cleaned = text.trim();

  // Strip ```json ... ``` fences.
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) cleaned = fenced[1].trim();

  // Find the first {...} block in case the model emitted prose around it.
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) cleaned = objMatch[0];

  try {
    const parsed = JSON.parse(cleaned) as { questions?: unknown };
    if (!Array.isArray(parsed.questions)) return [];
    return parsed.questions
      .filter((q: unknown): q is string => typeof q === 'string')
      .map((q) => q.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
