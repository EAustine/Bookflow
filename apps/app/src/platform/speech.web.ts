/**
 * Device text-to-speech on web — the Web Speech API. See `speech.ts`
 * for what this is for and, just as importantly, what it is not.
 *
 * Two mappings worth stating, because neither is obvious from the
 * native side:
 *
 * 1. **`onDone` vs `onStopped` has to be reconstructed.** Native tells
 *    the two apart. On web both arrive as the utterance's `end` event,
 *    and `cancel()` is specified to fire it — so the distinction is
 *    recovered by marking an utterance before cancelling it. Marking
 *    the utterance rather than setting a "currently cancelling" flag is
 *    what makes it exact: the `end` event is asynchronous, so a flag
 *    would have to be cleared on a timer and would mislabel whichever
 *    event landed on the wrong side of it.
 *
 *    Without the distinction every Stop tap would report completion,
 *    and the callers' `isSpeaking` would still come out right by luck,
 *    since all three callbacks happen to clear it. Relying on that luck
 *    is how the fourth caller gets a bug.
 * 2. **Absence is an error, not a crash.** `speechSynthesis` is missing
 *    in some browsers and in any non-secure context. Native cannot fail
 *    that way, so the callers have no "unsupported" branch; reporting
 *    it through `onError` puts it on a path they already handle.
 */

import type { SpeakOptions } from './speech';

/** The utterance currently queued or speaking, if any. */
let current: SpeechSynthesisUtterance | null = null;

/**
 * Utterances that were cut short rather than finishing. A WeakSet
 * because membership is only ever read from the utterance's own `end`
 * handler, after which nothing holds it.
 */
const cancelled = new WeakSet<SpeechSynthesisUtterance>();

export const speak: typeof import('./speech').speak = (
  text: string,
  options: SpeakOptions = {},
) => {
  const synth = globalThis.speechSynthesis;
  if (!synth) {
    options.onError?.();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  if (options.rate !== undefined) utterance.rate = options.rate;
  utterance.onend = () => {
    if (current === utterance) current = null;
    if (cancelled.has(utterance)) options.onStopped?.();
    else options.onDone?.();
  };
  utterance.onerror = () => {
    if (current === utterance) current = null;
    options.onError?.();
  };

  // Native replaces whatever is speaking; web would queue behind it.
  // Interrupting is a stop for the utterance being interrupted, and its
  // caller is told so.
  if (current) cancelled.add(current);
  synth.cancel();

  current = utterance;
  synth.speak(utterance);
};

export const stop: typeof import('./speech').stop = async () => {
  const synth = globalThis.speechSynthesis;
  if (!synth) return;
  if (current) cancelled.add(current);
  synth.cancel();
};
