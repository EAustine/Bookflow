/**
 * Global unhandled-promise-rejection silencer for network errors.
 *
 * React Native's dev-mode LogBox surfaces a red toast (and a full-
 * screen modal on second tap) any time a promise rejects without a
 * handler. The default tracker calls `console.error` on the second
 * pass, which is what triggers the toast. That's the right
 * behaviour for genuine bugs but creates UI noise on every offline
 * fetch — even when the calling code already has graceful in-band
 * recovery (cached data still painted, friendly error displayed).
 *
 * We audited the codebase and wrapped every supabase / fetch call
 * we found in try/catch. This module is the backstop for anything
 * we missed (or new code that lands later) — it intercepts the
 * global rejection event, classifies the error, and routes network-
 * shaped rejections to `console.warn` (which doesn't trigger
 * LogBox) instead of letting them escalate to `console.error`.
 *
 * Non-network rejections (auth bugs, JSON parse failures,
 * undefined-is-not-an-object, etc) still log via `console.error`
 * the same way they always did — those represent real bugs we
 * want to see in dev.
 *
 * Implementation detail: we use the `promise/setimmediate/
 * rejection-tracking` shim that RN's built-in Promise polyfill
 * ships with. Hermes uses the same tracking entry-point via
 * `HermesInternal.enablePromiseRejectionTracker`. We try the
 * Hermes path first (more reliable) and fall back to the
 * polyfill path.
 */

// Pattern set mirrors `formatNetworkError` — keep these in sync.
// Anything matching here gets demoted from console.error → warn
// so LogBox stays quiet for transient network blips.
const NETWORK_PATTERNS: RegExp[] = [
  /network request failed/i,
  /network error/i,
  /failed to fetch/i,
  /\bnetwork unreachable\b/i,
  /\boffline\b/i,
  /abort/i,
  /timeout/i,
  /timed out/i,
  /etimedout/i,
  /econnrefused/i,
  /econnreset/i,
  /enotfound/i,
  // Supabase storage / functions sometimes wrap a network error in
  // its own envelope ("Failed to send the request" / "Failed to
  // create signed url"). Match the common wrappers conservatively.
  /failed to send a request/i,
  /failed to create signed url/i,
];

function looksLikeNetworkError(err: unknown): boolean {
  let raw = '';
  if (typeof err === 'string') raw = err;
  else if (err instanceof Error) raw = err.message || err.name || '';
  else if (err && typeof err === 'object') {
    const maybe = (err as { message?: unknown; name?: unknown }).message;
    raw = typeof maybe === 'string' ? maybe : '';
  }
  if (!raw) return false;
  return NETWORK_PATTERNS.some((re) => re.test(raw));
}

let installed = false;

/**
 * Patch `console.error` so the very first thing a network error
 * does isn't trigger React Native's LogBox red toast.
 *
 * The Supabase `@supabase/auth-js` client (and a few other libs)
 * call `console.error(...)` directly with the raw Error object
 * when an auth fetch fails on the wire. That bypasses every
 * rejection-handler scheme — LogBox catches console.error at the
 * source, before user-land can do anything about it. The only
 * place we can intercept is in `console.error` itself.
 *
 * We replace `console.error` with a thin wrapper that classifies
 * the first argument and demotes network-shaped errors to
 * `console.warn` (which LogBox ignores). Real errors still go to
 * `console.error` and still surface the LogBox so genuine bugs
 * remain visible.
 *
 * Match logic mirrors `looksLikeNetworkError` above so the two
 * filters stay aligned: if a rejection passes the tracker's
 * network-pattern check, the same string would pass here too.
 */
function patchConsoleError(): void {
  const original = console.error.bind(console);
  // eslint-disable-next-line no-console
  console.error = (...args: unknown[]) => {
    // Cheap path: check each arg's message/string form against
    // the network pattern set. If any arg matches, route to warn.
    // If nothing matches, defer to the original console.error so
    // LogBox sees real bugs as usual.
    for (const arg of args) {
      if (looksLikeNetworkError(arg)) {
        console.warn('[silenced-network-error]', ...args);
        return;
      }
      // Defensive: some libraries log a string-formatted message
      // as the FIRST arg and the Error as the SECOND. The loop
      // catches both shapes (Error in any position, or string
      // containing the network pattern in any position).
    }
    original(...args);
  };
}

/**
 * Install the global rejection tracker. Idempotent — safe to call
 * multiple times (subsequent calls no-op). Call once at app boot
 * before any other code that might trigger network fetches.
 */
export function installRejectionTracker(): void {
  if (installed) return;
  installed = true;

  // Patch console.error FIRST — supabase-auth-js's auto-refresh
  // ticker can fire on the very first effect tick, before our
  // rejection-tracker setup below has a chance to register.
  patchConsoleError();

  // Hermes path — most reliable. `HermesInternal` is present at
  // runtime on Hermes builds (which is the default for RN 0.70+
  // and Expo SDK 49+, including SDK 55 used here).
  const hermes = (globalThis as { HermesInternal?: unknown }).HermesInternal as
    | {
        enablePromiseRejectionTracker?: (opts: {
          allRejections?: boolean;
          onUnhandled?: (id: number, error: unknown) => void;
          onHandled?: (id: number) => void;
        }) => void;
      }
    | undefined;

  if (hermes?.enablePromiseRejectionTracker) {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (id, error) => {
        if (looksLikeNetworkError(error)) {
          // Demoted from error → warn so LogBox stays quiet on
          // offline. Tagged with id so dev can correlate to the
          // original code path via Metro logs.
          console.warn(
            `[unhandled-rejection #${id}] silenced network error:`,
            error instanceof Error ? error.message : String(error),
          );
          return;
        }
        // Real bug — keep the original LogBox behaviour. Match the
        // Hermes default by routing to console.error.
        console.error(`[unhandled-rejection #${id}]`, error);
      },
    });
    return;
  }

  // Non-Hermes fallback. RN ships with a polyfilled Promise that
  // exposes a rejection-tracking enable() helper. The require path
  // matches what RN uses internally so the same handler hook
  // applies.
  try {
    // Lazy-require so the import doesn't trip on web builds where
    // the module shape is different. The path string is stable
    // across RN versions 0.60+.
    const tracking = require('promise/setimmediate/rejection-tracking');
    if (tracking && typeof tracking.enable === 'function') {
      tracking.enable({
        allRejections: true,
        onUnhandled: (id: number, error: unknown) => {
          if (looksLikeNetworkError(error)) {
            console.warn(
              `[unhandled-rejection #${id}] silenced network error:`,
              error instanceof Error ? error.message : String(error),
            );
            return;
          }
          console.error(`[unhandled-rejection #${id}]`, error);
        },
        onHandled: () => {
          // No-op: we don't need to log late-handled rejections.
        },
      });
    }
  } catch {
    // Fallback wiring failed — log once and let the default
    // behaviour stand. This shouldn't fire on any RN target we
    // support; logging is just for forensic visibility.
    console.warn(
      '[installRejectionTracker] neither Hermes nor polyfill path available',
    );
  }
}
