/**
 * Device text-to-speech — the adapter for `expo-speech`.
 *
 * §8's table has no row for this package, which is a gap in the table
 * rather than a decision: it has two live call sites and no web
 * implementation, so without an adapter metro's placeholder list could
 * never empty. The row it should have is "`speech` | `expo-speech` |
 * Web Speech API", and the web side here is that implementation.
 *
 * This is **not** the app's audiobook playback. That is ElevenLabs
 * narration through the `audio` adapter, cached per chapter and voice.
 * This is the device's own voice, used for two incidental read-alouds:
 * the AI summary sheet's Listen button and the reader's sentence and
 * word taps. Keeping them apart matters because they have opposite
 * economics — one is free and local, the other is metered.
 *
 * The surface is `speak` and `stop`, the two functions the call sites
 * use, with the three callbacks they pass. `speak` stays fire-and-
 * forget rather than returning a promise, because every caller drives a
 * boolean `isSpeaking` from the callbacks and never awaits.
 */

import * as Speech from 'expo-speech';

export type SpeakOptions = {
  /** 1 is the platform default; the app uses 0.85–0.95 for study pace. */
  rate?: number;
  /** Finished saying the whole utterance. */
  onDone?: () => void;
  /** Cut short by `stop()`. */
  onStopped?: () => void;
  /** Could not speak, or stopped speaking because of a fault. */
  onError?: () => void;
};

export function speak(text: string, options: SpeakOptions = {}): void {
  Speech.speak(text, options);
}

export function stop(): Promise<void> {
  return Speech.stop();
}
