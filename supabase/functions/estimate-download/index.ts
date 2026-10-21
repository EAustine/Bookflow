/**
 * estimate-download — read-only cost preview for the offline download feature.
 *
 * Downloading a book generates narration for every page not already cached
 * (per-user cache OR cross-user dedup). For a never-narrated book that's the
 * whole book — the single most ElevenLabs-expensive action in the app. This
 * endpoint lets the client warn the user up front: how many pages are already
 * available (free) vs need fresh generation, and roughly how many minutes that
 * is.
 *
 * Generates NOTHING and calls no third party — it only reads `pages` and the
 * two audio caches. It mirrors generate-audio's auth, ownership check, voice
 * normalisation, page_too_short guard, content hashing, and duration estimate
 * so the cached/new split matches exactly what generate-audio would do per
 * page.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x'; // Aria — matches generate-audio
const MIN_CONTENT_CHARS = 30; // matches generate-audio's page_too_short guard
const CHUNK = 100; // cap .in() list size so the query string stays well-formed

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Db = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { book_id?: string; voice_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const bookId = body.book_id;
  if (!bookId) return json({ error: 'missing_fields' }, 400);

  const requested = (body.voice_id ?? '').trim();
  const voice =
    requested.length >= 8 && /^[A-Za-z0-9]+$/.test(requested) ? requested : DEFAULT_VOICE;

  // Auth — resolve the caller from the JWT (RLS-respecting), same as
  // generate-audio. Ownership is then enforced with the service-role client.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: 'unauthorized' }, 401);
  const userId = userData.user.id;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', bookId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) return json({ error: 'lookup_failed' }, 500);
  if (!ownedBook) return json({ error: 'not_found' }, 404);

  const { data: pages, error: pagesErr } = await supabase
    .from('pages')
    .select('id, content, word_count')
    .eq('book_id', bookId);
  if (pagesErr) return json({ error: 'page_lookup_failed' }, 500);

  // Only pages long enough to narrate produce audio (and cost). Front matter /
  // blank spine entries are skipped by generate-audio, so they're invisible here.
  const narratable = (pages ?? []).filter(
    (p) =>
      typeof p.content === 'string' &&
      (p.content as string).trim().length >= MIN_CONTENT_CHARS,
  );

  const pageInfos = await Promise.all(
    narratable.map(async (p) => ({
      id: p.id as string,
      hash: await sha256Hex((p.content as string).trim()),
      // Same duration heuristic generate-audio persists: ~150 wpm.
      seconds: Math.max(5, Math.round((((p.word_count as number) ?? 200) / 150) * 60)),
    })),
  );

  // A page is free to download if it's in the user's per-page cache OR the
  // global content (dedup) cache — exactly the two lookups generate-audio does
  // before paying ElevenLabs.
  const cachedPageIds = await fetchCachedSet(
    supabase,
    'audio_cache',
    'page_id',
    voice,
    pageInfos.map((p) => p.id),
  );
  const cachedHashes = await fetchCachedSet(
    supabase,
    'audio_content_cache',
    'content_hash',
    voice,
    pageInfos.map((p) => p.hash),
  );

  let cachedPages = 0;
  let newPages = 0;
  let newSeconds = 0;
  let totalSeconds = 0;
  for (const p of pageInfos) {
    totalSeconds += p.seconds;
    if (cachedPageIds.has(p.id) || cachedHashes.has(p.hash)) {
      cachedPages++;
    } else {
      newPages++;
      newSeconds += p.seconds;
    }
  }

  return json(
    {
      total_pages: pageInfos.length,
      cached_pages: cachedPages,
      new_pages: newPages,
      new_minutes: Math.round(newSeconds / 60),
      total_minutes: Math.round(totalSeconds / 60),
    },
    200,
  );
});

/** Set of values that already exist in `table.col` for this voice. Chunked so
 * a long `.in()` list can't blow the query string. Fails toward "nothing
 * cached" (overestimates cost — the safe direction for a warning). */
async function fetchCachedSet(
  supabase: Db,
  table: 'audio_cache' | 'audio_content_cache',
  col: 'page_id' | 'content_hash',
  voice: string,
  values: string[],
): Promise<Set<string>> {
  const found = new Set<string>();
  if (!values.length) return found;
  try {
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      const { data } = await supabase
        .from(table)
        .select(col)
        .eq('voice_id', voice)
        .in(col, chunk);
      for (const row of (data ?? []) as Array<Record<string, string>>) {
        if (row[col]) found.add(row[col]);
      }
    }
  } catch (_e) {
    // Table missing (pre-migration) or query failure → treat as uncached.
  }
  return found;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
