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

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STORAGE_BUCKET = 'books';
const SIGNED_URL_TTL_S = 60 * 60; // 1h — ample for a picker session
// Short sample rendered once per voice, then cached. Representative of
// real narration cadence without burning many credits.
const PREVIEW_TEXT =
  "Hi — I'm your Bookflow narrator. This is how I'll read your book aloud to you.";
// MUST stay in sync with generate-audio so the preview sounds exactly like
// the real narration (the previous approach forwarded ElevenLabs' published
// preview_url, which is rendered with different settings → "different voice").
const PREVIEW_MODEL = 'eleven_turbo_v2_5';
const PREVIEW_VOICE_SETTINGS = {
  stability: 0.4,
  similarity_boost: 0.75,
  style: 0.0,
  use_speaker_boost: true,
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = { voice_id?: unknown };

// ElevenLabs voice IDs are 20-char alphanumeric strings (e.g.
// "21m00Tcm4TlvDq8ikWAM"); cloned voices can vary, so accept a sane
// alphanumeric range. The old pattern hard-required 22 chars, which
// rejected EVERY real 20-char id with a 400 before we ever hit the API
// — that's the bug that made voice preview silent for all voices. Keep
// this in sync with generate-audio's looser `length >= 8` check.
const VOICE_ID_RE = /^[A-Za-z0-9]{16,40}$/;

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

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // `_turbo` in the path tags the model/settings the sample was rendered
  // with — bump it if PREVIEW_MODEL/settings change so stale caches don't
  // get served.
  const cachePath = `voice-previews/${voiceId}_turbo.mp3`;

  // 1. Serve the cached sample if we already rendered it for this voice.
  const cachedSigned = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(cachePath, SIGNED_URL_TTL_S);
  if (!cachedSigned.error && cachedSigned.data?.signedUrl) {
    return json({ url: cachedSigned.data.signedUrl, cached: true }, 200);
  }

  // 2. Cache miss — render the sample with the SAME model + settings as
  // narration, so the preview matches what the user actually hears.
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: PREVIEW_TEXT,
          model_id: PREVIEW_MODEL,
          voice_settings: PREVIEW_VOICE_SETTINGS,
        }),
      },
    );
    if (!ttsRes.ok) {
      const text = await ttsRes.text().catch(() => '');
      console.warn(
        `[preview-voice] elevenlabs ${ttsRes.status}: ${text.slice(0, 200)}`,
      );
      return json(
        { error: 'upstream_failed', message: `ElevenLabs returned ${ttsRes.status}` },
        502,
      );
    }
    const audioBytes = new Uint8Array(await ttsRes.arrayBuffer());
    if (audioBytes.byteLength < 100) {
      return json({ error: 'empty_audio' }, 502);
    }

    // Cache for next time. Upload failure is non-fatal — we can still
    // sign+serve this generation (it just won't be cached).
    const up = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(cachePath, audioBytes, { contentType: 'audio/mpeg', upsert: true });
    if (up.error) {
      console.warn('[preview-voice] cache upload failed:', up.error.message);
    }

    const signed = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(cachePath, SIGNED_URL_TTL_S);
    if (signed.error || !signed.data?.signedUrl) {
      return json(
        { error: 'sign_failed', message: signed.error?.message ?? 'no signed url' },
        500,
      );
    }
    return json({ url: signed.data.signedUrl, cached: false }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[preview-voice] generate threw:', message);
    return json({ error: 'network_error', message }, 502);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
