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
 * Cost note: only a true cache miss costs money (~$0.08/min of narration on
 * eleven_turbo_v2_5). Two layers keep that rare: a per-user cache (repeat
 * plays of the same page+voice are free) and a cross-user content cache
 * (identical text+voice is narrated ONCE globally, so the shared public-
 * domain catalog is free after the first listener). Because cached + dedup
 * serves cost nothing, only fresh generation is metered and capped — see the
 * generation gate below; cached serves are never counted or blocked.
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
// Pro GENERATION ceiling — a high but finite monthly cap on NEW narration
// (abuse backstop, not a marketed limit; a normal Pro listener never reaches
// it, because cached + dedup playback is free and uncapped). Free users use
// profiles.audio_seconds_limit (60 min of generation).
const PRO_AUDIO_LIMIT_SECONDS = 180_000; // 50 hours / month

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
// ElevenLabs CURRENT default-library voice IDs. The previous set used
// legacy premade voices (Adam/Antoni/Domi/Sam) that newer accounts can't
// access, which is why narration 502'd ("narration service failed") for
// those. These are the present-day defaults — available on every account,
// and chosen for distinct gender + accent.
const KNOWN_VOICES = new Set([
  '9BWtsMINqrJLrRacOk9x', // Aria   — female, expressive (American)
  'nPczCjzI2devNBz1zQrb', // Brian  — male, deep (American)
  'JBFqnCBsd6RMkjVDRZzb', // George — male, warm (British)
  'IKne3meq5aSn9XLyUdCD', // Charlie — male, casual (Australian)
  'EXAVITQu4vr4xnSDxMaL', // Sarah  — female, gentle (American)
  'pFZP5JQG7iQjIQuC4Bku', // Lily   — female, soft (British)
]);
const DEFAULT_VOICE = '9BWtsMINqrJLrRacOk9x'; // Aria

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

  // Records generated narration seconds against the monthly generation cap
  // (spends the monthly allowance first, then any purchased balance — see the
  // record_audio_usage RPC). Called ONLY on a real cache miss below: cached +
  // dedup serves are free, so they neither count nor block. Never throws — a
  // metering hiccup must not fail a successful generation.
  const recordAudio = async (seconds: number) => {
    try {
      await supabase.rpc('record_audio_usage', {
        p_user: userId,
        p_seconds: Math.max(0, Math.round(seconds || 0)),
      });
    } catch (e) {
      console.warn('[generate-audio] record_audio_usage failed:', e);
    }
  };

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
      // Cache hit — a free serve. Not counted against the generation cap and
      // never blocked, so a user who's exhausted their generation allowance
      // can still replay (and listen offline to) anything already narrated.
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

  // 1b. Cross-user dedup. Identical text + voice → identical audio. Public-
  // domain books (Discover, Bibles) are imported by many users as separate
  // `pages` rows, so without this each user re-pays ElevenLabs for the same
  // narration. A global cache keyed by content hash means the audio is
  // generated ONCE and reused by everyone. Resilient if the table doesn't
  // exist yet (pre-migration) — falls through to normal generation.
  const contentHash = await sha256Hex(page.content.trim());
  try {
    const { data: shared } = await supabase
      .from('audio_content_cache')
      .select('storage_path, alignment_path, duration_seconds')
      .eq('content_hash', contentHash)
      .eq('voice_id', voice)
      .maybeSingle();
    if (shared?.storage_path) {
      const [audioSigned, alignSigned] = await Promise.all([
        supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(shared.storage_path, SIGNED_URL_TTL_S),
        shared.alignment_path
          ? supabase.storage
              .from(STORAGE_BUCKET)
              .createSignedUrl(shared.alignment_path, SIGNED_URL_TTL_S)
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!audioSigned.error && audioSigned.data?.signedUrl) {
        // Point this user's per-page cache at the shared file so the next
        // request hits the per-user cache directly (no content lookup).
        await supabase.from('audio_cache').upsert(
          {
            page_id: page.id,
            voice_id: voice,
            storage_path: shared.storage_path,
            alignment_path: shared.alignment_path,
            duration_seconds: shared.duration_seconds,
          },
          { onConflict: 'page_id,voice_id' },
        );
        // Dedup hit — someone already generated this exact text+voice, so this
        // serve costs us nothing. Free and uncapped, same as a per-user hit.
        return json(
          {
            url: audioSigned.data.signedUrl,
            alignment_url: alignSigned.data?.signedUrl ?? null,
            duration_seconds: shared.duration_seconds,
            cached: true,
            page_index,
            voice_id: voice,
          },
          200,
        );
      }
    }
  } catch (e) {
    console.warn('[generate-audio] content-cache lookup skipped:', e);
  }

  // ── Generation cap (hard server-side enforcement) ───────────────────────
  // We only reach here on a true cache miss — i.e. we're about to pay
  // ElevenLabs to generate NEW narration. That's the only thing that costs
  // money, so it's the only thing we gate; every cached + dedup serve above
  // is free and uncapped. `audio_seconds_used` counts generated seconds and
  // `audio_seconds_limit` is the monthly generation allowance (Pro: a high
  // finite backstop; free: the column, 60 min). Purchased balance extends
  // past the monthly allowance. Fail-open on any read error so a transient DB
  // hiccup never blocks a (possibly paying) user mid-generation.
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select(
        'plan, audio_seconds_used, audio_seconds_limit, audio_seconds_period_start, audio_seconds_balance, audio_seconds_balance_expires_at',
      )
      .eq('id', userId)
      .maybeSingle();
    if (prof) {
      const isPro = prof.plan === 'pro';
      const now = new Date();
      const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
      const psRaw = prof.audio_seconds_period_start as string | null;
      const ps = psRaw ? new Date(psRaw).getTime() : 0;
      const used = ps >= monthStart ? (prof.audio_seconds_used ?? 0) : 0;
      // Pro: a high finite ceiling (overrides the column so a lagging webhook
      // can't strand a paying user at the free cap). Free: the column (60 min).
      const limit = isPro
        ? PRO_AUDIO_LIMIT_SECONDS
        : ((prof.audio_seconds_limit ?? 3600) as number);
      // Purchased audio balance (expiry-aware) extends past the monthly cap.
      const balExpRaw = prof.audio_seconds_balance_expires_at as string | null;
      const balExp = balExpRaw ? new Date(balExpRaw).getTime() : 0;
      const balance =
        balExp > now.getTime() ? (prof.audio_seconds_balance ?? 0) : 0;
      if (used >= limit && balance <= 0) {
        return json(
          {
            // Distinct code for Pro so the client shows a plain "limit
            // reached" message rather than an upgrade paywall.
            error: isPro ? 'audio_limit_reached_pro' : 'audio_limit_reached',
            message: 'Monthly audio generation limit reached.',
          },
          402,
        );
      }
    }
  } catch (e) {
    console.warn('[generate-audio] generation gate read failed (fail-open):', e);
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
          // turbo_v2_5 generates several times faster than multilingual_v2
          // (the prior model) at near-identical quality — the main lever
          // for "processing needs to be optimized." Still multilingual, so
          // non-English pages narrate fine. (flash_v2_5 is faster still but
          // audibly lower quality, not worth it for long-form narration.)
          model_id: 'eleven_turbo_v2_5',
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
  // Content-addressed shared path so the file is reused across every user
  // with the same text + voice (see the content cache above + below).
  const audioPath = `shared/audio/${contentHash}_${voice}.mp3`;
  const alignmentPath = alignment
    ? `shared/audio/${contentHash}_${voice}.json`
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

  // Global content cache — lets every other user reuse this audio with no
  // further ElevenLabs cost. Non-fatal if the table is missing (pre-migration).
  const { error: contentCacheErr } = await supabase
    .from('audio_content_cache')
    .upsert(
      {
        content_hash: contentHash,
        voice_id: voice,
        storage_path: audioPath,
        alignment_path: finalAlignmentPath,
        duration_seconds: estimatedDurationSec,
      },
      { onConflict: 'content_hash,voice_id' },
    );
  if (contentCacheErr) {
    console.warn(
      '[generate-audio] content-cache upsert failed:',
      contentCacheErr.message,
    );
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

  await recordAudio(estimatedDurationSec);
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

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  );
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
