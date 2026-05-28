/**
 * delete-account — Edge Function that fully removes the caller's
 * account and every row they own. Required by Apple Guideline
 * 5.1.1(v): apps that support sign-up MUST offer in-app account
 * deletion.
 *
 * Flow:
 *   1. Authenticate via the caller's JWT (anon-key client + JWT).
 *   2. Best-effort drop the user's storage objects under
 *      `{userId}/...` in the `books` bucket. Storage rows have no
 *      FK to auth.users so they outlive the account otherwise,
 *      leaving orphaned EPUBs / covers / audio mp3s.
 *   3. Service-role: `auth.admin.deleteUser(userId)`. Cascading
 *      FK / RLS on `public.*` tables takes care of the dependent
 *      rows — books, highlights, reading_sessions, conversations,
 *      messages, summaries, audio_cache, etc. (Migrations create
 *      these with `on delete cascade` referencing the user_id.)
 *   4. Return ok. The client then signs out locally.
 *
 * Auth is the only safeguard — there's no body-level confirmation
 * because the deletion is gated by the in-app sheet on the client.
 * Re-confirming server-side would just nag the user without adding
 * security (anyone with a valid JWT for this user can already
 * delete their own account).
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const STORAGE_BUCKET = 'books';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // 1. Authenticate.
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

  // 2. Drop the user's storage objects. Best-effort — if it errors
  // we still proceed with the auth deletion so the user isn't
  // stuck. Storage cleanup can be retried via a backfill job.
  try {
    // List everything under `{userId}/` then `remove` in batches.
    // Supabase storage doesn't have a recursive delete; we walk the
    // top-level entries and call remove on the full paths.
    const collected: string[] = [];
    await walk(supabase, `${userId}`, collected);
    if (collected.length > 0) {
      // remove() takes up to 1000 paths per call. We chunk to be safe.
      for (let i = 0; i < collected.length; i += 100) {
        const chunk = collected.slice(i, i + 100);
        const { error: rmErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove(chunk);
        if (rmErr) {
          console.warn('[delete-account] storage remove chunk failed:', rmErr.message);
        }
      }
    }
  } catch (err) {
    console.warn('[delete-account] storage walk threw:', err);
  }

  // 3. Auth deletion — cascades to every row keyed by user_id.
  try {
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId);
    if (delErr) {
      console.error('[delete-account] auth deleteUser failed:', delErr.message);
      return json({ error: 'delete_failed', message: delErr.message }, 500);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[delete-account] auth deleteUser threw:', message);
    return json({ error: 'delete_failed', message }, 500);
  }

  return json({ ok: true }, 200);
});

/**
 * Recursively collect every storage path under `prefix`. The
 * storage API lists one folder at a time, so we walk depth-first.
 * `prefix` should NOT have a trailing slash.
 */
async function walk(
  supabase: ReturnType<typeof createClient>,
  prefix: string,
  out: string[],
): Promise<void> {
  // Sanity cap so a corrupted tree can't OOM the function.
  if (out.length > 10_000) return;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) {
    console.warn(`[delete-account] list ${prefix} failed:`, error.message);
    return;
  }
  if (!data) return;
  for (const entry of data) {
    if (!entry.name) continue;
    const fullPath = `${prefix}/${entry.name}`;
    // Folders have id = null in the storage list output; files have a real id.
    if (entry.id === null) {
      await walk(supabase, fullPath, out);
    } else {
      out.push(fullPath);
    }
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
