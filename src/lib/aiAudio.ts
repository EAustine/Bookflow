import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from 'expo-audio';
import { formatNetworkError } from '~/lib/networkErrors';
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
  /**
   * Lock-screen / notification-tray metadata. When provided, the
   * player calls `setActiveForLockScreen(true, metadata)` after
   * creation so the system renders a media notification on Android
   * and Now Playing info on iOS — book title, author, page, and
   * cover art with play/pause/skip controls.
   *
   * Without this, audio plays in the background but no notification
   * appears, and on newer Android versions the OS will kill the
   * playback after ~3 minutes (the foreground service alone isn't
   * enough; the system needs an active MediaSession to keep the
   * process alive longer).
   *
   * `artworkUrl` is optional — title + artist are sufficient for the
   * notification to render. Pass undefined if the cover URL hasn't
   * resolved yet and update it later via a re-render; the metadata
   * effect handles late-arriving artwork without re-creating the
   * player.
   */
  metadata?: {
    title: string;
    artist: string;
    artworkUrl?: string;
  };
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
  // Metadata mirror — read inside the load effect at player-create
  // time. NOT a dependency, otherwise an artwork URL resolving a
  // beat after the player loads would tear down + recreate the
  // player mid-playback. Late metadata changes are picked up by
  // the dedicated `updateLockScreenMetadata` effect below.
  const metadataRef = useRef(args.metadata);
  metadataRef.current = args.metadata;
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
    //
    // Order matters: pause() synchronously stops audio output BEFORE
    // remove() frees the native resources. Without the pause(), the
    // audio buffer can continue draining for ~100–300ms even after
    // remove() returns — and if the user has already started a new
    // book in that window, BOTH audios play at once until the old
    // buffer empties.
    const prev = playerRef.current;
    playerRef.current = null;
    if (prev) {
      try {
        prev.pause();
      } catch {
        // already paused or released
      }
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
        // Error-message priority:
        //   1. Any network-shaped failure (raw text matches network
        //      pattern, OR error code is the generic
        //      request_failed / function_failed which Supabase
        //      surfaces on transport-layer failures) → use a
        //      network-focused friendly message. This is the most
        //      common failure mode and the most actionable
        //      surface — "audio playback failed" without a network
        //      hint left users guessing why.
        //   2. Otherwise prefer the audio code map — covers
        //      domain-specific cases like page_too_short.
        //   3. Final fallback: friendly mapper on the raw message
        //      so we never store stack-trace-shaped text in
        //      `status.errorMessage` (it gets read by both the
        //      Listen banner and the lock-screen MediaSession).
        const raw = result.message;
        const isNetworkRaw =
          !!raw && /network request failed|network error|failed to fetch|abort|timeout/i.test(raw);
        const isNetworkCode =
          result.error === 'request_failed' || result.error === 'function_failed';
        let friendly: string;
        if (isNetworkRaw || isNetworkCode) {
          // Hard-code a clear "audio + connection" message rather
          // than letting formatNetworkError fall through to its
          // generic "Something went wrong preparing audio" string,
          // which the user reported as unhelpful — they didn't
          // know it was a network issue. This copy names the
          // suspect and the remedy in one line.
          friendly =
            "Couldn't load audio. Check your connection and try again.";
        } else if (result.error) {
          friendly = audioErrorCodeToMessage(result.error);
        } else if (raw) {
          friendly = formatNetworkError(raw, 'preparing audio');
        } else {
          friendly = "Couldn't load audio. Try again in a moment.";
        }
        setStatus({
          ...INITIAL_STATUS,
          errorMessage: friendly,
        });
        return;
      }

      // 3. Create the player. expo-audio loads asynchronously; we
      // subscribe to playbackStatusUpdate to track position + state.
      let player: AudioPlayer;
      try {
        player = createAudioPlayer({ uri: result.data.url });
      } catch (err) {
        console.warn('[aiAudio] createAudioPlayer threw:', err);
        // The signed audio URL came back fine but expo-audio
        // couldn't wire it up — usually a transient native-side
        // issue OR a download failure (signed URL race). Either
        // way the user can act on "try again", so phrase it that
        // way directly.
        setStatus({
          ...INITIAL_STATUS,
          errorMessage:
            "Couldn't load audio. Check your connection and try again.",
        });
        return;
      }
      if (token !== loadTokenRef.current) {
        // Race: page or book changed while createAudioPlayer was
        // running. Pause first so the freshly-created player doesn't
        // briefly start outputting audio that runs in parallel with
        // the next session — same dueling-audio bug as the main
        // cleanup path, just on a tighter race window.
        try {
          player.pause();
        } catch {
          // not yet started
        }
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

      // Wire the player into the system MediaSession (Android: media
      // notification in the tray + lock-screen controls; iOS: Now
      // Playing info + control center). expo-audio's
      // `AudioControlsService` is already in the manifest because the
      // plugin's `enableBackgroundPlayback` defaults to true — what we
      // need here is to feed it metadata so it has something to display
      // and to KEEP the foreground service alive past the ~3-minute
      // Android cap that applies when no MediaSession is active.
      //
      // Failure here is non-fatal: audio continues to play, just
      // without a notification. We log so the device-logs trail
      // makes it diagnosable.
      const md = metadataRef.current;
      if (md) {
        try {
          player.setActiveForLockScreen(
            true,
            {
              title: md.title,
              artist: md.artist,
              artworkUrl: md.artworkUrl,
            },
            {
              showSeekForward: true,
              showSeekBackward: true,
            },
          );
        } catch (err) {
          console.warn('[audio] setActiveForLockScreen failed:', err);
        }
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
        // Halt audio output BEFORE releasing the player — see the
        // comment in the previous-player cleanup at the top of this
        // effect for why. Without an explicit pause(), remove() lets
        // the audio decoder drain its buffer in the background, which
        // means starting a new book while the old one is still playing
        // produces a window of dueling audio.
        try {
          p.pause();
        } catch {
          // already paused or released
        }
        try {
          // Drop the MediaSession before releasing the player so the
          // system notification disappears cleanly. Without this, the
          // notification can briefly orphan and the next session's
          // notification might attach with stale title/artist.
          p.clearLockScreenControls();
        } catch {
          // never registered for lock-screen, or already cleared
        }
        try {
          p._bookflowCleanup?.();
          p.remove();
        } catch {
          // already released
        }
      }
    };
  }, [bookId, pageIndex, voiceId, enabled]);

  // Late-binding metadata effect: if the artwork URL resolves after
  // the player is already created (cover-cache miss → ~100ms network
  // round-trip), push the updated metadata to the live MediaSession
  // without tearing down the player. No-op when the player isn't
  // currently registered for lock-screen controls, so it's safe to
  // call before setActiveForLockScreen has run.
  useEffect(() => {
    const p = playerRef.current;
    const md = args.metadata;
    if (!p || !md) return;
    try {
      p.updateLockScreenMetadata({
        title: md.title,
        artist: md.artist,
        artworkUrl: md.artworkUrl,
      });
    } catch (err) {
      console.warn('[audio] updateLockScreenMetadata failed:', err);
    }
  }, [args.metadata?.title, args.metadata?.artist, args.metadata?.artworkUrl]);

  const play = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.play();
    } catch (err) {
      console.warn('[aiAudio] play threw:', err);
      setStatus((s) => ({
        ...s,
        // Pre-formatted — see loadTrack comment for the why.
        errorMessage: formatNetworkError(err, 'playing audio'),
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
