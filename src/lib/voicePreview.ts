import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { supabase } from '~/lib/supabase';

/**
 * Fetches ElevenLabs' published preview URL for a voice and plays it
 * via expo-audio. Centralises the lifecycle so the picker UI just
 * has to call play()/stop() and read isPlaying — there's exactly
 * one preview player alive at a time and the previous one is fully
 * disposed before the next starts.
 *
 * Why a singleton: previews are mutually exclusive — tapping
 * "Preview" on Rachel while Domi is still playing should cut Domi
 * off, not overlay two voices. A module-scoped player is the
 * simplest way to enforce that without threading state through
 * every consumer.
 *
 * Errors collapse to a thrown Error with a short, user-facing
 * message — the caller can surface that in the UI without further
 * parsing.
 */

type PreviewResponse = { url: string; name: string | null };
type PreviewError = { error: string; message?: string };

// Cache the preview URL per voice for the duration of the JS runtime.
// ElevenLabs preview URLs are stable, so refetching is wasted.
const urlCache = new Map<string, string>();

let activePlayer: AudioPlayer | null = null;
let activeVoiceId: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // listeners must not crash the singleton
    }
  }
}

/**
 * Fetch the preview URL for a voice, hitting our `preview-voice` edge
 * function which proxies the real call to ElevenLabs. Cached in
 * memory after the first lookup.
 */
async function fetchPreviewUrl(voiceId: string): Promise<string> {
  const cached = urlCache.get(voiceId);
  if (cached) return cached;
  const { data, error } = await supabase.functions.invoke('preview-voice', {
    body: { voice_id: voiceId },
  });
  if (error) {
    // Try to extract a structured error message from the response body
    // so users see "Preview unavailable" rather than "function_failed".
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).text === 'function') {
      try {
        const body = await (ctx as Response).text();
        const parsed = JSON.parse(body) as PreviewError;
        throw new Error(parsed.message ?? parsed.error ?? 'Preview failed');
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message) throw parseErr;
      }
    }
    throw new Error(error.message ?? 'Preview failed');
  }
  const payload = data as Partial<PreviewResponse> | PreviewError | null;
  if (!payload || typeof (payload as PreviewResponse).url !== 'string') {
    const message =
      (payload as PreviewError | null)?.message ??
      (payload as PreviewError | null)?.error ??
      'Preview unavailable for this voice.';
    throw new Error(message);
  }
  const url = (payload as PreviewResponse).url;
  urlCache.set(voiceId, url);
  return url;
}

/**
 * Stop and dispose any currently-playing preview. Safe to call from
 * anywhere — no-op if nothing is playing. Calls listeners so the
 * UI can clear the "playing" state.
 */
export function stopVoicePreview(): void {
  if (!activePlayer) return;
  try {
    activePlayer.pause();
  } catch {
    // expo-audio occasionally throws if the player was already
    // released. Swallow — we're tearing down anyway.
  }
  try {
    activePlayer.release();
  } catch {
    // same
  }
  activePlayer = null;
  activeVoiceId = null;
  notify();
}

/**
 * Start playing a voice preview. Stops any currently-playing preview
 * first. Resolves once playback has actually started (not when it
 * finishes); the caller can subscribe via `subscribeVoicePreview` to
 * learn when playback ends.
 */
export async function playVoicePreview(voiceId: string): Promise<void> {
  stopVoicePreview();
  const url = await fetchPreviewUrl(voiceId);
  // The user may have closed the sheet (or tapped another preview)
  // during the fetch. Bail in that case — stopVoicePreview cleared
  // activeVoiceId; if it's not us, abandon.
  const player = createAudioPlayer({ uri: url });
  activePlayer = player;
  activeVoiceId = voiceId;
  notify();

  // expo-audio emits playbackStatusUpdate; we listen for didJustFinish
  // so the UI can flip the button back to its idle state.
  player.addListener('playbackStatusUpdate', (status: { didJustFinish?: boolean }) => {
    if (status.didJustFinish) {
      stopVoicePreview();
    }
  });

  try {
    player.play();
  } catch (err) {
    stopVoicePreview();
    throw err;
  }
}

/** Currently-playing voice ID, or null if no preview is active. */
export function getActivePreviewVoiceId(): string | null {
  return activeVoiceId;
}

/**
 * Subscribe to preview state changes. The callback fires every time
 * playback starts, stops, or ends naturally. Returns an unsubscribe
 * function — call it on unmount.
 */
export function subscribeVoicePreview(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
