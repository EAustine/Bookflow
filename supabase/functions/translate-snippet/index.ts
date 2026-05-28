/**
 * translate-snippet — Edge Function that translates a short user-
 * supplied snippet (one or two sentences from the reader) into the
 * user's preferred target language.
 *
 * Why it's separate from `translate-page`:
 *   - No `book_id` / page row required — the input is arbitrary text
 *     the user just long-pressed on. Tying it to a page would add a
 *     query for no benefit.
 *   - No caching layer. Snippets are short, distinct per highlight,
 *     and the user expects an instant turnaround. Cache would mostly
 *     miss.
 *   - Cheaper / faster model — Haiku is enough for one sentence at
 *     a time. Cost per call is tiny; latency is what the user
 *     notices.
 *
 * Auth: the caller's JWT is required (we don't expose this as a
 * public translation API). No ownership check needed because the
 * function doesn't read any user data — just translates the text
 * the caller passed.
 *
 * Size guard: `text` is rejected over MAX_CHARS. A few sentences
 * fits comfortably; this protects against a misuse vector where
 * someone routes a whole book through this no-cache endpoint.
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.30.0';
import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const MAX_CHARS = 2000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  text: string;
  /**
   * Free-form language tag. Lowercase server-side. Common values:
   * 'twi', 'spanish', 'french', 'german', 'italian', 'portuguese',
   * 'japanese', 'mandarin', 'korean', 'arabic'. ISO codes ('es',
   * 'fr', 'de', 'tw') also work — Claude maps them.
   */
  target_language: string;
};

const SYSTEM_PROMPT = `You are a translator. Translate the user's text into the target language they specify. Output ONLY the translated text — no preamble, no commentary, no language labels, no quotation marks unless the original had them. Preserve sentence count and rough rhythm; do not paraphrase aggressively.`;

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

  const text = (body.text ?? '').trim();
  const target = (body.target_language ?? '').trim().toLowerCase();
  if (!text || !target) {
    return json({ error: 'missing_fields' }, 400);
  }
  if (text.length > MAX_CHARS) {
    return json({ error: 'text_too_long', message: `Max ${MAX_CHARS} characters.` }, 400);
  }
  if (target.length > 40) {
    return json({ error: 'invalid_language' }, 400);
  }

  // Auth — require a valid user JWT. We don't read any DB rows so
  // there's no ownership check; we just gate the endpoint behind
  // sign-in so it can't be hit anonymously.
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

  // Translate. Haiku is enough for one-sentence prose; Sonnet would
  // double the latency for no perceivable quality gain on a snippet.
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Target language: ${target}\n\nText:\n${text}`,
        },
      ],
    });
    const out = response.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { type: string; text: string }) => b.text)
      .join('')
      .trim();
    if (!out) {
      return json({ error: 'llm_empty' }, 502);
    }
    return json({ translation: out, target_language: target }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[translate-snippet] anthropic failed:', message);
    return json({ error: 'llm_failed', message }, 502);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
