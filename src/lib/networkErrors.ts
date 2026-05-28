/**
 * Friendly mapping for raw network / fetch / Supabase error messages.
 *
 * The native `fetch` and the Supabase JS client both surface error
 * strings shaped like stack-trace excerpts when something goes wrong
 * at the network layer:
 *
 *   "TypeError: Network request failed"
 *   "AbortError: The operation was aborted"
 *   "FetchError: request to https://… failed, reason: ETIMEDOUT"
 *   "Failed to fetch"
 *
 * Showing those strings directly to the user reads like the app is
 * crashing. This helper translates them into copy a non-engineer
 * would expect to see in a "we couldn't reach the server" empty
 * state, while leaving the raw message available via console.warn
 * at the call site for debugging.
 *
 * Usage:
 *
 *   try {
 *     await doNetworkThing();
 *   } catch (err) {
 *     console.warn('[area] thing failed:', err);
 *     setError(formatNetworkError(err));
 *   }
 *
 * Or for already-string errors (e.g. from `{ ok: false, error: '…' }`
 * envelopes), pass the string in directly — the function handles
 * both shapes via `toRaw` below.
 *
 * Branches (in match-order priority):
 *   1. Offline / network failure  → "You're offline…"
 *   2. Aborted / timed out        → "Taking too long…"
 *   3. Auth / session             → "Please sign back in…"
 *   4. Generic fallback           → "Something went wrong…"
 *
 * The mapping is intentionally surgical — we don't try to be cute
 * about Supabase-specific PostgREST codes (`PGRST116` etc) because
 * those almost always indicate a bug rather than a transient
 * network issue, and a user can't act on them anyway. Generic
 * fallback covers the long tail.
 */

/**
 * Normalise an `unknown`/`string`/`Error`/`{ message: string }`
 * value down to a raw error string we can match against. Returns
 * empty string for null/undefined input so the regex match-paths
 * below don't have to defend against it.
 */
function toRaw(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (input instanceof Error) return input.message || input.name || '';
  if (typeof input === 'object' && 'message' in input) {
    const m = (input as { message?: unknown }).message;
    return typeof m === 'string' ? m : '';
  }
  return String(input);
}

/**
 * Map an error to user-friendly copy. Safe to call with `null`,
 * `undefined`, a `string`, an `Error`, or any object with a
 * `.message` property.
 *
 * Optional `context` argument lets callers tweak the noun in the
 * generic fallback ("Something went wrong adding this book", vs.
 * "Something went wrong loading this book"). Leave undefined for
 * the bare default.
 */
export function formatNetworkError(input: unknown, context?: string): string {
  const raw = toRaw(input).toLowerCase();

  // 1. Offline / network failure. These cover RN's `TypeError:
  //    Network request failed` (Android + iOS), the WebKit
  //    `Failed to fetch` text on web/Expo Web, and the Node-style
  //    `network error` wording that Supabase JS sometimes surfaces.
  if (
    /network request failed/i.test(raw) ||
    /network error/i.test(raw) ||
    /failed to fetch/i.test(raw) ||
    /\bnetwork unreachable\b/i.test(raw) ||
    /\boffline\b/i.test(raw)
  ) {
    return "You're offline. Check your connection and try again.";
  }

  // 2. Aborted / timed out — either from our own AbortController
  //    timeouts (e.g. useAllPagesContent's 15 s guard) or from
  //    Supabase's "request_timeout" sentinel we emit ourselves.
  if (
    /abort/i.test(raw) ||
    /timeout/i.test(raw) ||
    raw === 'request_timeout' ||
    /timed out/i.test(raw) ||
    /etimedout/i.test(raw)
  ) {
    return "That's taking too long. Check your connection and try again.";
  }

  // 3. Auth / session. JWT-expired and "not authenticated" surfaces
  //    happen if the device sat with a stale token. Telling the user
  //    to sign back in is more actionable than the raw JWT error.
  if (
    /jwt expired/i.test(raw) ||
    /not authenticated/i.test(raw) ||
    /unauthorized/i.test(raw) ||
    /\bauth\b.*\b(failed|invalid)\b/i.test(raw)
  ) {
    return 'Please sign back in and try again.';
  }

  // 4. Generic fallback. We never surface the raw string here —
  //    it almost always reads like a stack trace to a user. The
  //    raw text still goes to console.warn at the call site, so
  //    debugging isn't impaired.
  if (context) {
    return `Something went wrong ${context}. Try again in a moment.`;
  }
  return 'Something went wrong. Try again in a moment.';
}

/**
 * True if the given error looks like a transient network / timeout
 * problem (vs. a permanent auth error or a 4xx the user can't
 * retry through). Useful for deciding whether to show a "Retry"
 * button alongside the error message.
 */
export function isRetryableNetworkError(input: unknown): boolean {
  const raw = toRaw(input).toLowerCase();
  if (
    /network request failed/i.test(raw) ||
    /network error/i.test(raw) ||
    /failed to fetch/i.test(raw) ||
    /\bnetwork unreachable\b/i.test(raw) ||
    /\boffline\b/i.test(raw) ||
    /abort/i.test(raw) ||
    /timeout/i.test(raw) ||
    /timed out/i.test(raw) ||
    /etimedout/i.test(raw)
  ) {
    return true;
  }
  return false;
}
