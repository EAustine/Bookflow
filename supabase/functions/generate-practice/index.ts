/**
 * generate-practice — Edge Function that produces multiple-choice
 * practice questions for a single page (or page range, follow-up).
 *
 * Flow:
 *   1. Look up the page row(s) by (book_id, page_index | page_indices).
 *   2. Cache lookup against (page_id, count) — multi-page skips cache.
 *   3. Cache miss → call Anthropic with a structured-output prompt.
 *      We ask for JSON, validate the shape, and retry once if the
 *      first response was malformed (LLMs occasionally mix natural
 *      language with the JSON object).
 *   4. Persist into `practice_questions`.
 *   5. Return the questions array.
 *
 * Response shape (one entry per question):
 *   {
 *     question:    string,
 *     options:     string[]   (length 4),
 *     correctIndex: number    (0..3),
 *     explanation: string
 *   }
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

const VALID_COUNTS = [3, 5, 10] as const;
type ValidCount = (typeof VALID_COUNTS)[number];

const MAX_MULTI_PAGE_CHARS = 80_000;

type Body = {
  book_id: string;
  page_index?: number;
  page_indices?: number[];
  count?: number;
};

type Question = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

const SYSTEM_PROMPT = `You write fair, challenging multiple-choice questions about a passage. Strict rules:

- Exactly four options per question.
- Only one option is correct, supported directly by the passage.
- Wrong options are plausible but verifiably wrong from the text.
- "All of the above" / "None of the above" / "Both A and B" are forbidden.
- Avoid trivia about specific page numbers, chapter numbers, or footnotes.
- The explanation references the passage to justify the correct answer.

Output ONLY a JSON array of question objects, no preamble, no code fences. Each object has keys: question (string), options (array of 4 strings), correctIndex (integer 0-3), explanation (string).`;

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

  const { book_id } = body;
  if (!book_id) return json({ error: 'missing_fields' }, 400);

  // Resolve page indices: prefer page_indices over page_index, same as
  // generate-summary. Default count is 5.
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

  const count: ValidCount = (VALID_COUNTS as readonly number[]).includes(
    body.count ?? 5,
  )
    ? ((body.count ?? 5) as ValidCount)
    : 5;
  const isMultiPage = requestedIndices.length > 1;
  const primaryPageIndex = requestedIndices[0];

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

  // Ownership check before reading the book's pages with service-role.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[generate-practice] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // 1. Pull page rows.
  const { data: pageRows, error: pageErr } = await supabase
    .from('pages')
    .select('id, page_index, content')
    .eq('book_id', book_id)
    .in('page_index', requestedIndices)
    .order('page_index', { ascending: true });
  if (pageErr) return json({ error: 'page_lookup_failed', message: pageErr.message }, 500);

  const pages = (pageRows ?? []) as Array<{
    id: string;
    page_index: number;
    content: string | null;
  }>;
  if (pages.length === 0) return json({ error: 'page_not_found' }, 404);

  // Build source text.
  let sourceText: string;
  if (!isMultiPage) {
    const single = pages[0];
    if (!single.content || single.content.trim().length < 80) {
      return json({ error: 'page_too_short' }, 400);
    }
    sourceText = single.content.trim();
  } else {
    let buf = '';
    for (const p of pages) {
      if (!p.content) continue;
      if (buf.length + p.content.length > MAX_MULTI_PAGE_CHARS) {
        buf += p.content.slice(0, MAX_MULTI_PAGE_CHARS - buf.length);
        break;
      }
      buf += p.content + '\n\n';
    }
    if (buf.length < 200) return json({ error: 'page_too_short' }, 400);
    sourceText = buf.trim();
  }

  // 2. Cache lookup (single-page only, same rationale as summaries).
  if (!isMultiPage) {
    const { data: cached } = await supabase
      .from('practice_questions')
      .select('questions, generated_at')
      .eq('page_id', pages[0].id)
      .eq('count', count)
      .maybeSingle();

    if (cached?.questions && Array.isArray(cached.questions)) {
      return json(
        {
          questions: cached.questions,
          count,
          cached: true,
          page_index: primaryPageIndex,
          page_indices: [primaryPageIndex],
        },
        200,
      );
    }
  }

  // 3. Call Anthropic with a structured-output prompt.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const t0 = Date.now();

  const userContent = `Generate exactly ${count} multiple-choice questions from this passage.${
    isMultiPage
      ? ` It covers ${pages.length} pages — draw questions from across the whole passage, not just one section.`
      : ''
  }\n\n---\n\n${sourceText}`;

  let questions: Question[] | null = null;
  let lastModelOutput = '';
  for (let attempt = 0; attempt < 2 && !questions; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              attempt === 0
                ? userContent
                : userContent +
                  '\n\nYour previous response was not valid JSON. Output ONLY a JSON array, with no surrounding text.',
          },
        ],
      });

      lastModelOutput = response.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      questions = parseQuestions(lastModelOutput, count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[generate-practice] anthropic call failed:', message);
      return json({ error: 'llm_failed', message }, 500);
    }
  }

  if (!questions) {
    console.error(
      '[generate-practice] could not parse JSON after 2 attempts; tail:',
      lastModelOutput.slice(-200),
    );
    return json(
      { error: 'invalid_llm_output', message: 'Model returned malformed questions.' },
      500,
    );
  }

  // 4. Cache (single-page).
  if (!isMultiPage) {
    const { error: insertErr } = await supabase
      .from('practice_questions')
      .insert({ page_id: pages[0].id, count, questions });
    if (insertErr) {
      console.warn('[generate-practice] cache insert failed:', insertErr.message);
    }
  }

  console.log(
    `[generate-practice] generated in ${Date.now() - t0}ms (count=${count} pages=${pages.length})`,
  );

  return json(
    {
      questions,
      count,
      cached: false,
      page_index: primaryPageIndex,
      page_indices: pages.map((p) => p.page_index),
    },
    200,
  );
});

/**
 * Parse and validate the LLM's JSON output. Returns null if the
 * structure isn't a clean array of `count` well-formed Question
 * objects — the caller will retry once.
 *
 * We also strip common framing the model sometimes adds despite the
 * "no code fences" instruction (```json fences, leading prose).
 */
function parseQuestions(raw: string, expectedCount: number): Question[] | null {
  if (!raw) return null;
  let cleaned = raw.trim();
  // Strip code fences if present.
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  // Find the first `[` and the matching last `]` — tolerates leading
  // prose that occasionally slips through.
  const firstBracket = cleaned.indexOf('[');
  const lastBracket = cleaned.lastIndexOf(']');
  if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
    return null;
  }
  cleaned = cleaned.slice(firstBracket, lastBracket + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  // We accept ±1 from expected count — sometimes the model gives one
  // fewer because it couldn't find enough material. Take the first
  // `expectedCount` after validation; pad isn't possible.
  const out: Question[] = [];
  for (const item of parsed) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Question).question === 'string' &&
      Array.isArray((item as Question).options) &&
      (item as Question).options.length === 4 &&
      (item as Question).options.every((o) => typeof o === 'string') &&
      typeof (item as Question).correctIndex === 'number' &&
      (item as Question).correctIndex >= 0 &&
      (item as Question).correctIndex < 4 &&
      typeof (item as Question).explanation === 'string'
    ) {
      out.push(item as Question);
    }
    if (out.length >= expectedCount) break;
  }
  if (out.length < Math.min(3, expectedCount)) return null;
  return out;
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
