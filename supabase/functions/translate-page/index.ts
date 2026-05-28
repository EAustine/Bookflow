/**
 * translate-page — Edge Function that translates a single page into a
 * user-chosen target language. Same caching pattern as
 * generate-summary: keyed by (page_id, target_language).
 *
 * Why Sonnet 4.6 (not Haiku): translation quality is the whole
 * product here. Haiku is fine for English↔major-language pairs but
 * struggles with low-resource languages (e.g. Twi); Sonnet handles
 * them with noticeably better grammar + idiom. The page is short so
 * the cost difference per request is small, and we cache aggressively.
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

type Body = {
  book_id: string;
  page_index: number;
  /**
   * Free-form language tag. We lowercase server-side. Common values:
   * 'twi', 'spanish', 'french', 'german', 'italian', 'portuguese',
   * 'japanese', 'mandarin', 'korean', 'arabic'. ISO codes ('es',
   * 'fr', 'de', 'tw') also work — Claude maps them.
   */
  target_language: string;
};

const SYSTEM_PROMPT = `You are a literary translator. You translate prose passages between languages, preserving the author's tone, sentence rhythm, and figurative language. You DO NOT:
- Add commentary about the translation choices.
- Insert footnotes, brackets, or translator-explanatory text.
- Change paragraph structure (the output has the same number of paragraphs as the input).
- Output anything other than the translated text itself.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
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

  const { book_id, page_index, target_language } = body;
  if (
    !book_id ||
    typeof page_index !== 'number' ||
    page_index < 0 ||
    !target_language?.trim()
  ) {
    return json({ error: 'missing_fields' }, 400);
  }
  // Cache stability: lowercase + trim so 'Spanish' and 'spanish' hit
  // the same row.
  const targetLang = target_language.trim().toLowerCase();
  if (targetLang.length > 40) {
    return json({ error: 'invalid_language' }, 400);
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

  // Ownership check before reading the book's pages with service-role.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[translate-page] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // 1. Page lookup.
  const { data: page, error: pageErr } = await supabase
    .from('pages')
    .select('id, content')
    .eq('book_id', book_id)
    .eq('page_index', page_index)
    .maybeSingle();
  if (pageErr) return json({ error: 'page_lookup_failed', message: pageErr.message }, 500);
  if (!page) return json({ error: 'page_not_found' }, 404);
  if (!page.content || page.content.trim().length < 30) {
    return json({ error: 'page_too_short' }, 400);
  }

  // 2. Cache lookup.
  const { data: cached } = await supabase
    .from('translations')
    .select('content, generated_at')
    .eq('page_id', page.id)
    .eq('target_language', targetLang)
    .maybeSingle();

  if (cached?.content) {
    return json(
      {
        translation: cached.content,
        target_language: targetLang,
        cached: true,
        page_index,
      },
      200,
    );
  }

  // 3. Call Anthropic.
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const t0 = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Translate the following passage into ${target_language}. Output only the translated text — preserve the same paragraph structure as the source.\n\n---\n\n${page.content.trim()}`,
        },
      ],
    });

    const translated = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!translated) return json({ error: 'no_translation_generated' }, 500);

    // 4. Cache.
    const { error: insertErr } = await supabase
      .from('translations')
      .insert({ page_id: page.id, target_language: targetLang, content: translated });
    if (insertErr) {
      console.warn('[translate-page] cache insert failed:', insertErr.message);
    }

    console.log(
      `[translate-page] translated to ${targetLang} in ${Date.now() - t0}ms (${translated.length} chars)`,
    );

    return json(
      {
        translation: translated,
        target_language: targetLang,
        cached: false,
        page_index,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[translate-page] anthropic call failed:', message);
    return json({ error: 'llm_failed', message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
