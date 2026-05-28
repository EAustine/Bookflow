/**
 * generate-translation — Edge Function that translates a page (or
 * page range) into a target language.
 *
 * Same shape as generate-summary / generate-practice:
 *   1. Resolve page indices.
 *   2. Cache lookup by (page_id, target_language). Multi-page skips
 *      cache (the (page_id, lang) PK doesn't naturally encode page sets).
 *   3. Cache miss → call Anthropic with a strict translate-only prompt.
 *   4. Persist (single-page only).
 *   5. Return the translated text.
 *
 * Why Anthropic vs a dedicated translation API: Claude handles
 * literary register and ambiguous source phrasing better than
 * sentence-by-sentence engines (DeepL, Google). For "twi" specifically
 * (the user's default per profile), small dedicated models are
 * scarce; a frontier LLM is the most reliable option.
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

const MAX_MULTI_PAGE_CHARS = 60_000;

type Body = {
  book_id: string;
  page_index?: number;
  page_indices?: number[];
  target_language: string;
};

const SYSTEM_PROMPT =
  "You are a literary translator. Translate the passage faithfully into the requested language while preserving the author's voice, register, and figurative language. Don't summarise, paraphrase, or add commentary. Output ONLY the translation — no preamble, no source-language echoes, no notes.";

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

  const { book_id, target_language } = body;
  if (!book_id || !target_language?.trim()) {
    return json({ error: 'missing_fields' }, 400);
  }
  // Lowercase + trim so "Twi", "twi", and " twi " all hit the same cache row.
  const targetLang = target_language.trim().toLowerCase();
  if (targetLang.length > 40) {
    return json({ error: 'target_language_invalid' }, 400);
  }

  // Resolve page indices.
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
    console.warn('[generate-translation] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // 1. Fetch pages.
  const { data: pageRows, error: pageErr } = await supabase
    .from('pages')
    .select('id, page_index, content')
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
  }>;
  if (pages.length === 0) return json({ error: 'page_not_found' }, 404);

  // 2. Build source text.
  let sourceText: string;
  if (!isMultiPage) {
    const single = pages[0];
    if (!single.content || single.content.trim().length < 30) {
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
    if (buf.length < 100) return json({ error: 'page_too_short' }, 400);
    sourceText = buf.trim();
  }

  // 3. Cache lookup (single-page only).
  if (!isMultiPage) {
    const { data: cached } = await supabase
      .from('translations')
      .select('content, generated_at')
      .eq('page_id', pages[0].id)
      .eq('target_language', targetLang)
      .maybeSingle();

    if (cached?.content) {
      return json(
        {
          translation: cached.content,
          target_language: targetLang,
          cached: true,
          page_index: primaryPageIndex,
          page_indices: [primaryPageIndex],
        },
        200,
      );
    }
  }

  // 4. Call Anthropic. Sonnet 4.6 for the translation work — better
  // grasp of literary register and idiom than Haiku, and the
  // additional cost is small relative to total credits per page.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const t0 = Date.now();

  // Budget output to ~1.5x the source token-equivalent. Translation
  // expansion varies widely by language pair; this is conservative.
  const sourceWordEstimate = sourceText.split(/\s+/).length;
  const maxTokens = Math.min(
    4000,
    Math.max(400, Math.round(sourceWordEstimate * 2.4)),
  );

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Translate this passage into ${targetLang}. Preserve paragraph breaks.\n\n---\n\n${sourceText}`,
        },
      ],
    });

    const translation = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!translation) {
      return json({ error: 'no_translation_generated' }, 500);
    }

    // 5. Persist (single-page only).
    if (!isMultiPage) {
      const { error: insertErr } = await supabase
        .from('translations')
        .insert({
          page_id: pages[0].id,
          target_language: targetLang,
          content: translation,
        });
      if (insertErr) {
        console.warn('[generate-translation] cache insert failed:', insertErr.message);
      }
    }

    console.log(
      `[generate-translation] generated in ${Date.now() - t0}ms (lang=${targetLang} pages=${pages.length} src_words=${sourceWordEstimate} out_chars=${translation.length})`,
    );

    return json(
      {
        translation,
        target_language: targetLang,
        cached: false,
        page_index: primaryPageIndex,
        page_indices: pages.map((p) => p.page_index),
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-translation] anthropic call failed:', message);
    return json({ error: 'llm_failed', message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
