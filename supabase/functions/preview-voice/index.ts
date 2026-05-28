/**
 * preview-voice — Edge Function that returns a public preview MP3 URL
 * for a given ElevenLabs voice.
 *
 * Why this exists: the voice picker on the Listen screen has a
 * "Preview" affordance next to each voice. We don't want to spend
 * ElevenLabs credits generating fresh demo audio per tap (that's
 * what generate-audio does, but it requires a real page of book
 * content and racks up cost). Instead we use the preview URLs that
 * ElevenLabs already publishes on its CDN for every premade voice —
 * those are stable, free to access, and sound exactly the way a
 * full read with that voice will sound.
 *
 * Flow:
 *   1. POST { voice_id } → 200 { url, name }
 *   2. We hit ElevenLabs' /v1/voices/{voice_id} once per request and
 *      forward the `preview_url` field. ElevenLabs caches their CDN
 *      response, so client load is basically a single 304 hit.
 *   3. Errors collapse to a 502 with a structured envelope so the
 *      client can show "Preview unavailable" rather than blowing up.
 *
 * Auth: passthrough — uses the caller's JWT only to gate the function
 * (verify_jwt is on by default). No DB writes. No PII surfaced.
 */

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { voice_id?: unknown };

// 22-character alphanumeric ElevenLabs voice ID. We validate the
// shape before hitting their API so a malformed input gets a clean
// 400 instead of a 422 from the upstream.
const VOICE_ID_RE = /^[A-Za-z0-9]{22}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }
  if (!ELEVENLABS_API_KEY) {
    return json(
      { error: 'server_misconfigured', message: 'ELEVENLABS_API_KEY not set' },
      500,
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const voiceId = typeof body.voice_id === 'string' ? body.voice_id.trim() : '';
  if (!voiceId || !VOICE_ID_RE.test(voiceId)) {
    return json({ error: 'invalid_voice_id' }, 400);
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[preview-voice] elevenlabs returned ${res.status}: ${text.slice(0, 200)}`,
      );
      return json(
        {
          error: 'upstream_failed',
          message: `ElevenLabs returned ${res.status}`,
        },
        502,
      );
    }
    const payload = (await res.json()) as {
      preview_url?: unknown;
      name?: unknown;
    };
    if (typeof payload.preview_url !== 'string' || !payload.preview_url) {
      return json(
        {
          error: 'no_preview',
          message: 'This voice has no published preview URL.',
        },
        404,
      );
    }
    return json(
      {
        url: payload.preview_url,
        name: typeof payload.name === 'string' ? payload.name : null,
      },
      200,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[preview-voice] fetch threw:', message);
    return json({ error: 'network_error', message }, 502);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
