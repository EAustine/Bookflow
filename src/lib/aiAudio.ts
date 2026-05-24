import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { supabase } from '~/lib/supabase';

/**
 * Per-page TTS playback. The edge function `generate-audio` produces
 * an MP3 in Supabase Storage; we fetch the signed URL, hand it to
 * expo-audio's `createAudioPlayer`, and expose play/pause/seek and a
 * status snapshot. Cached audio is essentially free (the function
 * returns the same URL with no LLM round-trip), so changing pages
 * or voices after the first generation is fast.
 *
 * Why expo-audio (not expo-av): expo-av@16 has a header-import bug
 * against the ExpoModulesCore shipped with SDK 55, and Expo is
 * deprecating it in favour of expo-audio for new-architecture
 * builds. The API is more declarative; we wrap it in the same
 * imperative `useAudio` shape our screens already speak.
 *
 * `useAudio` owns one AudioPlayer at a time. Switching pages or
 * voices releases the previous player before fetching the new URL —
 * expo-audio allocates per-instance and we want the audio to stop
 * cleanly when the user advances.
 */

/**
 * ElevenLabs default voice IDs. These are stable across all accounts
 * (no need to provision them per user). Custom cloned voices added
 * by the user later would slot in here as additional entries — the
 * server doesn't care which ID it gets.
 */
export type AudioVoice = string;

export type VoiceTier = 'free' | 'pro';

export const VOICE_OPTIONS: Array<{
  id: AudioVoice;
  label: string;
  description: string;
  /** Plan gate. Free-plan users can pick `'free'` voices; `'pro'`
   * voices are locked until the user upgrades. Mirrors the
   * per-book VoiceSheet on the Listen screen. */
  tier: VoiceTier;
}> = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', description: 'Calm · American English',         tier: 'free' },
  { id: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi',   description: 'Confident · American English',    tier: 'pro' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella',  description: 'Soft · American English',         tier: 'pro' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni', description: 'Well-rounded · American English', tier: 'pro' },
  { id: 'pNInz6obpgDQGcFmaJgb', label: 'Adam',   description: 'Deep · American English',         tier: 'pro' },
  { id: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam',    description: 'Raspy · American English',        tier: 'pro' },
];

export const DEFAULT_VOICE: AudioVoice = '21m00Tcm4TlvDq8ikWAM'; // Rachel

/**
 * Character-level alignment data from ElevenLabs `/with-timestamps`.
 * The same length across all three arrays — index `i` describes the
 * `i`th character spoken by the model. Drives bimodal highlight in
 * the Listen screen by mapping `audio.positionSeconds` → character
 * index → containing word.
 */
export type AudioAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export type FetchAudioResult =
  | {
      ok: true;
      data: {
        url: string;
        /** Signed URL for the alignment JSON sidecar, or null if no
         * alignment was captured (older cache rows / API failures). */
        alignmentUrl: string | null;
        durationSeconds: number;
        cached: boolean;
        pageIndex: number;
        voiceId: AudioVoice;
      };
    }
  | { ok: false; error: string; message?: string };

export async function fetchPageAudio(args: {
  bookId: string;
  pageIndex: number;
  voiceId?: AudioVoice;
}): Promise<FetchAudioResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-audio', {
      body: {
        book_id: args.bookId,
        page_index: args.pageIndex,
        voice_id: args.voiceId ?? DEFAULT_VOICE,
      },
    });

    if (error) {
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          const body = await (ctx as Response).text();
          if (body) {
            try {
              const parsed = JSON.parse(body) as { error: string; message?: string };
              return { ok: false, error: parsed.error, message: parsed.message };
            } catch {
              return { ok: false, error: 'function_failed', message: body.slice(0, 280) };
            }
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, error: 'function_failed', message: error.message };
    }

    if (typeof data?.url !== 'string') {
      return { ok: false, error: data?.error ?? 'invalid_response', message: data?.message };
    }

    return {
      ok: true,
      data: {
        url: data.url,
        alignmentUrl:
          typeof data.alignment_url === 'string' ? data.alignment_url : null,
        durationSeconds: data.duration_seconds as number,
        cached: !!data.cached,
        pageIndex: data.page_index as number,
        voiceId: data.voice_id as AudioVoice,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: 'request_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type PlaybackStatus = {
  /** True from the moment the user taps "Listen" until the URL resolves and the player is loaded. */
  loading: boolean;
  /** True when audio is loaded and not yet playing or paused. */
  ready: boolean;
  isPlaying: boolean;
  /** 0-based seconds into the current page's audio. */
  positionSeconds: number;
  /** Total duration of the current page's audio. */
  durationSeconds: number;
  /** Last error, if any (mapped to a human message). */
  errorMessage: string | null;
  /** URL for the alignment JSON when the audio supports bimodal
   * highlighting; null for older cached audio without alignment. The
   * `audioSession` provider fetches + parses this lazily. */
  alignmentUrl: string | null;
};

const INITIAL_STATUS: PlaybackStatus = {
  loading: false,
  ready: false,
  isPlaying: false,
  positionSeconds: 0,
  durationSeconds: 0,
  errorMessage: null,
  alignmentUrl: null,
};

/**
 * Hook controller. Caller passes the current `(bookId, pageIndex,
 * voiceId)` and gets back imperative play/pause/seek along with a
 * status snapshot. Switching any of those three releases the previous
 * AudioPlayer automatically.
 *
 * `enabled` is the gate — set to true on the user's first tap of
 * Listen (or whenever you want playback ready). Unmount fully
 * releases the player so audio doesn't keep playing in the background.
 */
export function useAudio(args: {
  bookId: string;
  pageIndex: number;
  voiceId?: AudioVoice;
  enabled: boolean;
  /**
   * Called once when the player finishes the current track. Auto-advance
   * (next-page) lives at the audio-session layer; this hook just emits
   * the signal. Stored in a ref so changing the callback doesn't force
   * the load effect to re-run (which would tear down the player).
   */
  onComplete?: () => void;
  /**
   * Called when the player is created and the first status update has
   * fired. Used by the audio-session layer to call `play()` if the user
   * intent is "play after load" (i.e. they tapped Listen, or auto-advance
   * just incremented the page).
   */
  onLoaded?: () => void;
  /** Playback rate (0.5–2.0). Applied to the player on each load + when changed. */
  playbackRate?: number;
}): {
  status: PlaybackStatus;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
} {
  const { bookId, pageIndex, voiceId = DEFAULT_VOICE, enabled } = args;
  const [status, setStatus] = useState<PlaybackStatus>(INITIAL_STATUS);
  const playerRef = useRef<AudioPlayer | null>(null);
  // Token for stale-load coordination. If the user changes the page
  // before the URL fetch resolves, the new request gets a new token
  // and the old one's onLoad becomes a no-op.
  const loadTokenRef = useRef(0);

  // Mirror callbacks into refs so they can be observed from inside the
  // load effect's closure without becoming dependencies (which would
  // re-trigger the player teardown/setup cycle on every render).
  const onCompleteRef = useRef(args.onComplete);
  const onLoadedRef = useRef(args.onLoaded);
  const playbackRateRef = useRef(args.playbackRate ?? 1);
  useEffect(() => {
    onCompleteRef.current = args.onComplete;
    onLoadedRef.current = args.onLoaded;
  }, [args.onComplete, args.onLoaded]);
  // Apply playback-rate changes to the live player without re-loading.
  useEffect(() => {
    const rate = args.playbackRate ?? 1;
    playbackRateRef.current = rate;
    const p = playerRef.current;
    if (p) {
      try {
        // expo-audio: `setPlaybackRate(rate, pitchCorrection?)`. We don't
        // pass pitchCorrection so the platform default ("low" on iOS,
        // "medium" on Android) applies — fine for narration.
        p.setPlaybackRate(rate);
      } catch {
        // Player not ready yet; the value is captured in the ref and
        // the load effect re-applies it after createAudioPlayer.
      }
    }
  }, [args.playbackRate]);

  useEffect(() => {
    const token = ++loadTokenRef.current;

    // Always release the previous player. expo-audio allocates per
    // instance; we never reuse one across files.
    const prev = playerRef.current;
    playerRef.current = null;
    if (prev) {
      try {
        prev.remove();
      } catch {
        // already released
      }
    }
    setStatus(INITIAL_STATUS);

    if (!enabled || !bookId) return;

    setStatus((s) => ({ ...s, loading: true, errorMessage: null }));

    void (async () => {
      // 1. Configure the audio session so:
      //    - playback works through the iOS silent switch
      //    - narration continues when the user locks the screen or
      //      switches apps (uses expo-audio's `AudioControlsService`
      //      foreground service on Android, declared in the manifest
      //      with `FOREGROUND_SERVICE_MEDIA_PLAYBACK`)
      //    - starting playback pauses other audio (Spotify, podcasts),
      //      since we behave as a media-playback app rather than
      //      something like a notification chime that should layer
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldRouteThroughEarpiece: false,
          shouldPlayInBackground: true,
          interruptionMode: 'doNotMix',
        });
      } catch {
        // mode failures are non-fatal; continue trying to play
      }

      // 2. Fetch the signed URL (generates audio if needed).
      const result = await fetchPageAudio({ bookId, pageIndex, voiceId });
      if (token !== loadTokenRef.current) return; // stale
      if (!result.ok) {
        setStatus({
          ...INITIAL_STATUS,
          errorMessage: result.message ?? audioErrorCodeToMessage(result.error),
        });
        return;
      }

      // 3. Create the player. expo-audio loads asynchronously; we
      // subscribe to playbackStatusUpdate to track position + state.
      let player: AudioPlayer;
      try {
        player = createAudioPlayer({ uri: result.data.url });
      } catch (err) {
        setStatus({
          ...INITIAL_STATUS,
          errorMessage: err instanceof Error ? err.message : 'Could not create audio player',
        });
        return;
      }
      if (token !== loadTokenRef.current) {
        // Race: page changed while createAudioPlayer was running.
        try {
          player.remove();
        } catch {
          // ignore
        }
        return;
      }

      // Track whether we've already emitted the "loaded" signal for this
      // player. The status listener fires repeatedly; we only want to
      // notify the caller once per page load.
      let firedLoaded = false;
      const sub = player.addListener('playbackStatusUpdate', (s: AudioStatus) => {
        if (token !== loadTokenRef.current) return;
        setStatus((prev) => ({
          ...prev,
          loading: false,
          ready: true,
          isPlaying: s.playing,
          positionSeconds: s.currentTime ?? prev.positionSeconds,
          durationSeconds:
            typeof s.duration === 'number' && s.duration > 0
              ? s.duration
              : prev.durationSeconds || result.data.durationSeconds,
        }));
        if (!firedLoaded) {
          firedLoaded = true;
          onLoadedRef.current?.();
        }
        // expo-audio raises didJustFinish=true on the status update where
        // the track reaches its end (currentTime ≈ duration, playing
        // flips false). We forward the signal to the caller; auto-advance
        // is decided one level up.
        const sLoose = s as AudioStatus & { didJustFinish?: boolean };
        if (sLoose.didJustFinish) {
          onCompleteRef.current?.();
        }
      });

      // Attach the cleanup to a token-checked closure so we don't
      // remove the listener for a player that was already swapped out.
      playerRef.current = player;
      const cleanup = () => {
        sub.remove();
      };
      // Stash the cleanup on the player so the unload path runs it.
      (player as AudioPlayer & { _bookflowCleanup?: () => void })._bookflowCleanup = cleanup;

      // Apply the user's chosen playback rate to the freshly-created
      // player. Without this, every page load resets to 1× even if the
      // user picked a different speed earlier in the session.
      try {
        if (playbackRateRef.current && playbackRateRef.current !== 1) {
          player.setPlaybackRate(playbackRateRef.current);
        }
      } catch {
        // ignore — value re-applies on the next setPlaybackRate effect
      }

      // Seed status with the duration estimate from the function
      // immediately so the progress bar has something even before the
      // first playbackStatusUpdate fires. Also stash the alignment
      // URL so the audio session can lazy-fetch the JSON sidecar in
      // parallel with audio loading.
      setStatus((prev) => ({
        ...prev,
        loading: false,
        ready: true,
        durationSeconds: result.data.durationSeconds,
        alignmentUrl: result.data.alignmentUrl,
      }));
    })();

    return () => {
      // Bump the token so any in-flight IIFE bails before
      // creating a player / attaching a listener. Without this,
      // an unmount that lands between `await fetchPageAudio` and
      // the synchronous player-create + listener-attach below
      // wouldn't invalidate the in-flight IIFE — it would happily
      // attach the listener after we'd already torn down,
      // leaking the subscription.
      loadTokenRef.current++;
      const p = playerRef.current as
        | (AudioPlayer & { _bookflowCleanup?: () => void })
        | null;
      playerRef.current = null;
      if (p) {
        try {
          p._bookflowCleanup?.();
          p.remove();
        } catch {
          // already released
        }
      }
    };
  }, [bookId, pageIndex, voiceId, enabled]);

  const play = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.play();
    } catch (err) {
      setStatus((s) => ({
        ...s,
        errorMessage: err instanceof Error ? err.message : 'Playback failed',
      }));
    }
  }, []);

  const pause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.pause();
    } catch {
      // ignore
    }
  }, []);

  const seekTo = useCallback(async (seconds: number) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      await p.seekTo(Math.max(0, seconds));
    } catch {
      // ignore
    }
  }, []);

  // Imperative setter for the rare case the caller wants to push a
  // rate change without re-rendering through the `playbackRate` arg.
  // Audio session uses the arg path; this is here for parity with
  // play/pause/seek shape.
  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    const p = playerRef.current;
    if (p) {
      try {
        p.setPlaybackRate(rate);
      } catch {
        // ignore — value will reapply on the next load
      }
    }
  }, []);

  return { status, play, pause, seekTo, setPlaybackRate };
}

function audioErrorCodeToMessage(code: string): string {
  switch (code) {
    case 'page_not_found':
      return "Couldn't find this page in the book.";
    case 'page_too_short':
      return "This page doesn't have enough text to read aloud.";
    case 'tts_failed':
      return 'The narration service failed. Try again in a moment.';
    case 'tts_empty_response':
      return 'The narration service returned no audio. Try again.';
    case 'storage_upload_failed':
      return "Couldn't save the generated audio. Try again.";
    case 'sign_failed':
      return "Couldn't fetch the audio file URL. Try again.";
    case 'server_misconfigured':
      return 'The narration service is temporarily unavailable.';
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the narration service.';
    default:
      return 'Something went wrong loading audio.';
  }
}
