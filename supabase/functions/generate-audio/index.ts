/**
 * generate-audio — Edge Function that produces an MP3 of a single
 * page using ElevenLabs Text-to-Speech.
 *
 * Why ElevenLabs (not OpenAI tts-1):
 *   - Substantially more natural narration — closer to a real
 *     audiobook reader, especially for literary prose.
 *   - eleven_multilingual_v2 handles non-English text gracefully
 *     (relevant given Twi, Spanish, etc. translations live in the
 *     same app).
 *   - Future room for word-level timestamps (`/with-timestamps`
 *     endpoint) to bring back the bimodal word-by-word highlight
 *     that OpenAI tts-1 didn't support.
 *
 * Cost note: ElevenLabs is ~16× more expensive than OpenAI tts-1 on
 * pay-as-you-go (~$0.30 per 1K chars vs. ~$0.018), but the cache
 * makes repeat plays free and a 200-word page is one round-trip
 * unless the user changes voice. Plans at $22+/mo bring the rate
 * down considerably; the function is otherwise unchanged when you
 * upgrade.
 *
 * Flow:
 *   1. Validate body { book_id, page_index, voice_id }.
 *   2. Cache lookup against `audio_cache` keyed by (page_id, voice_id).
 *      Hit → sign the storage path, return URL.
 *   3. Miss → fetch page content, post to ElevenLabs, upload MP3 to
 *      Supabase Storage at `{user}/{book}/audio/{page_index}_{voice}.mp3`,
 *      insert audio_cache row, return signed URL.
 *
 * Voice IDs come from ElevenLabs' default library (the 22-character
 * IDs starting with letters/digits — they're stable across all
 * accounts). Caller-side labels live in the client; server is
 * voice-name agnostic.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');

const STORAGE_BUCKET = 'books';
const SIGNED_URL_TTL_S = 60 * 60; // 1 hour

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Default voice library. We accept any ID the client sends — these
 * are just the well-known ones we surface in the picker. Custom
 * cloned voices added by the user later would also work without
 * server changes (they're just IDs).
 */
const KNOWN_VOICES = new Set([
  '21m00Tcm4TlvDq8ikWAM', // Rachel
  'AZnzlk1XvdvUeBnXmlld', // Domi
  'EXAVITQu4vr4xnSDxMaL', // Bella
  'ErXwobaYiN019PkySvjV', // Antoni
  'pNInz6obpgDQGcFmaJgb', // Adam
  'yoZ06aMxZJJ28mfd3POQ', // Sam
]);
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

type Body = {
  book_id: string;
  page_index: number;
  voice_id?: string;
};

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

  const { book_id, page_index } = body;
  if (!book_id || page_index === undefined || page_index === null) {
    return json({ error: 'missing_fields' }, 400);
  }
  // ElevenLabs voice IDs are 22-char alphanumeric. We accept anything
  // that LOOKS like a voice ID; ElevenLabs will validate it on its
  // end and surface a useful error if it's not real. Unknown / empty
  // input falls back to Rachel (the most-neutral default).
  const requestedVoice = (body.voice_id ?? '').trim();
  const voice =
    requestedVoice.length >= 8 && /^[A-Za-z0-9]+$/.test(requestedVoice)
      ? requestedVoice
      : DEFAULT_VOICE;
  if (!KNOWN_VOICES.has(voice)) {
    // Not in our default library, but still a syntactically-valid ID
    // — could be a user's cloned voice. Don't reject.
    console.log('[generate-audio] using non-default voice id:', voice);
  }

  // Auth — resolve the caller via anon-key client (RLS-respecting).
  // The userId we use for the storage path MUST come from the JWT,
  // not from the book row. The previous implementation read
  // `books.user_id` and used that as the path prefix, which meant an
  // attacker could trigger generation against another user's book
  // and get a signed URL to an MP3 written under the *target's*
  // storage prefix — both a leak and a write across users.
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

  // Ownership check before reading the page's content with
  // service-role and before we derive the storage path.
  const { data: ownedBook, error: ownErr } = await supabase
    .from('books')
    .select('id')
    .eq('id', book_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) {
    console.warn('[generate-audio] ownership check failed:', ownErr.message);
    return json({ error: 'lookup_failed' }, 500);
  }
  if (!ownedBook) {
    return json({ error: 'not_found' }, 404);
  }

  // Look up the page row.
  const { data: page, error: pageErr } = await supabase
    .from('pages')
    .select('id, content, word_count, book_id')
    .eq('book_id', book_id)
    .eq('page_index', page_index)
    .maybeSingle();
  if (pageErr) {
    return json({ error: 'page_lookup_failed', message: pageErr.message }, 500);
  }
  if (!page) return json({ error: 'page_not_found' }, 404);
  if (!page.content || page.content.trim().length < 30) {
    return json({ error: 'page_too_short' }, 400);
  }

  // 1. Cache lookup. We also pull the alignment_path so the client can
  // render bimodal highlights from cached audio without re-generating.
  const { data: cached } = await supabase
    .from('audio_cache')
    .select('storage_path, duration_seconds, alignment_path')
    .eq('page_id', page.id)
    .eq('voice_id', voice)
    .maybeSingle();

  if (cached?.storage_path) {
    const [audioSigned, alignSigned] = await Promise.all([
      supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(cached.storage_path, SIGNED_URL_TTL_S),
      // Sign the alignment too, when we have one. Cache rows from
      // before this feature shipped have alignment_path = NULL, so we
      // skip the sign call rather than send a bogus 404.
      cached.alignment_path
        ? supabase.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(cached.alignment_path, SIGNED_URL_TTL_S)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (!audioSigned.error && audioSigned.data?.signedUrl) {
      return json(
        {
          url: audioSigned.data.signedUrl,
          alignment_url: alignSigned.data?.signedUrl ?? null,
          duration_seconds: cached.duration_seconds,
          cached: true,
          page_index,
          voice_id: voice,
        },
        200,
      );
    }
    // Cache row exists but signing failed → fall through to regenerate.
    console.warn('[generate-audio] cache sign failed:', audioSigned.error?.message);
  }

  // 2. Cache miss — call ElevenLabs `/with-timestamps`. Returns JSON
  // containing base64-encoded MP3 + character-level alignment data
  // (`audio_base64`, `alignment.{characters,character_start_times_seconds,character_end_times_seconds}`).
  // The alignment lets the client highlight the current word as the
  // narrator speaks it (bimodal mode) — same Multilingual v2 model as
  // the audio-only flow.
  const t0 = Date.now();
  type AlignmentBlock = {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  type WithTimestampsResponse = {
    audio_base64: string;
    alignment: AlignmentBlock | null;
    normalized_alignment: AlignmentBlock | null;
  };

  let audioBytes: Uint8Array;
  let alignment: AlignmentBlock | null = null;
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          text: page.content.trim(),
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('[generate-audio] elevenlabs non-2xx:', ttsRes.status, errText);
      return json(
        { error: 'tts_failed', message: `ElevenLabs ${ttsRes.status}: ${errText.slice(0, 200)}` },
        502,
      );
    }
    const body = (await ttsRes.json()) as WithTimestampsResponse;
    if (!body.audio_base64) {
      return json({ error: 'tts_empty_response' }, 502);
    }
    // Base64 → bytes. Deno's atob returns a binary string; we copy
    // each char-code into a Uint8Array.
    const binary = atob(body.audio_base64);
    audioBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      audioBytes[i] = binary.charCodeAt(i);
    }
    // Prefer normalized_alignment when present (matches the rendered
    // text after ElevenLabs' normalisation — numbers, abbreviations
    // etc. mapped to their spoken form). Falls back to raw alignment
    // for older API responses.
    alignment = body.normalized_alignment ?? body.alignment ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[generate-audio] elevenlabs fetch failed:', message);
    return json({ error: 'tts_failed', message }, 502);
  }

  if (audioBytes.byteLength < 100) {
    return json({ error: 'tts_empty_response' }, 502);
  }

  // 3. Upload audio + alignment to Storage. Same path prefix; sidecar
  // alignment file as JSON. Uploads in parallel — the alignment is
  // small (~30-60KB) so neither blocks the other.
  const audioPath = `${userId}/${book_id}/audio/${page_index}_${voice}.mp3`;
  const alignmentPath = alignment
    ? `${userId}/${book_id}/audio/${page_index}_${voice}.json`
    : null;
  const [audioUp, alignUp] = await Promise.all([
    supabase.storage
      .from(STORAGE_BUCKET)
      .upload(audioPath, audioBytes, {
        contentType: 'audio/mpeg',
        upsert: true,
      }),
    alignment && alignmentPath
      ? supabase.storage.from(STORAGE_BUCKET).upload(
          alignmentPath,
          new TextEncoder().encode(JSON.stringify(alignment)),
          { contentType: 'application/json', upsert: true },
        )
      : Promise.resolve({ error: null }),
  ]);
  if (audioUp.error) {
    console.error('[generate-audio] audio upload failed:', audioUp.error.message);
    return json(
      { error: 'storage_upload_failed', message: audioUp.error.message },
      500,
    );
  }
  if (alignUp.error) {
    // Alignment upload failure is non-fatal — the audio still works,
    // just without the bimodal highlight. Log and continue.
    console.warn('[generate-audio] alignment upload failed:', alignUp.error.message);
  }
  // If alignment upload failed, drop the path so we don't store a
  // dangling reference in the cache row.
  const finalAlignmentPath =
    alignment && alignmentPath && !alignUp.error ? alignmentPath : null;

  // 4. Estimate duration. ElevenLabs averages ~150 wpm; we use the
  // page word_count as a reasonable proxy. The client treats this as
  // an approximation for the progress bar; precise duration comes
  // from the audio metadata once playback starts.
  const estimatedDurationSec = Math.max(
    5,
    Math.round(((page.word_count ?? 200) / 150) * 60),
  );

  // 5. Persist cache row. Failure here is non-fatal — the audio file
  // is uploaded and the URL works; the next generate-audio request
  // will just regenerate.
  const { error: cacheErr } = await supabase
    .from('audio_cache')
    .upsert(
      {
        page_id: page.id,
        voice_id: voice,
        storage_path: audioPath,
        alignment_path: finalAlignmentPath,
        duration_seconds: estimatedDurationSec,
      },
      { onConflict: 'page_id,voice_id' },
    );
  if (cacheErr) {
    console.warn('[generate-audio] cache upsert failed:', cacheErr.message);
  }

  // 6. Sign + return both URLs. Alignment URL is null when we don't
  // have one; the client treats null as "no bimodal highlighting" and
  // falls back to static text.
  const [audioSignFresh, alignSignFresh] = await Promise.all([
    supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(audioPath, SIGNED_URL_TTL_S),
    finalAlignmentPath
      ? supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(finalAlignmentPath, SIGNED_URL_TTL_S)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (audioSignFresh.error || !audioSignFresh.data?.signedUrl) {
    return json(
      {
        error: 'sign_failed',
        message: audioSignFresh.error?.message ?? 'no signed url',
      },
      500,
    );
  }

  console.log(
    `[generate-audio] generated in ${Date.now() - t0}ms (voice=${voice} bytes=${audioBytes.byteLength} alignment=${alignment ? 'yes' : 'no'})`,
  );

  return json(
    {
      url: audioSignFresh.data.signedUrl,
      alignment_url: alignSignFresh.data?.signedUrl ?? null,
      duration_seconds: estimatedDurationSec,
      cached: false,
      page_index,
      voice_id: voice,
    },
    200,
  );
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
