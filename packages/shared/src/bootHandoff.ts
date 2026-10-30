/**
 * The boot hand-off decision — "restore decides where, the splash
 * decides when" (§5 of docs/ARCHITECTURE.md), plus the one case that
 * breaks it: a magic link.
 *
 * This lives here, pure and tested, because the four lines it replaces
 * have now shipped two sign-in bugs with the same root cause. Session
 * restore picks a destination at boot, *before* the magic-link callback
 * has exchanged anything — so on a link cold start it finds no session
 * and parks Welcome. That parked value is wrong by construction, and it
 * must be discarded rather than merely deferred:
 *
 *   1. Deferring it with no guard at all (M2) replaced the callback
 *      route with Welcome mid-exchange. The link's error screen existed
 *      and was never allowed to render.
 *   2. Deferring it *while the callback route is on screen* (e5bf8f9)
 *      fixed that and introduced the mirror image: leaving the route is
 *      itself a change of input, so the moment the callback succeeded
 *      and navigated to Library, the hand-off re-ran and replaced a
 *      freshly signed-in user with Welcome. It also overrode the error
 *      screen's own "Back to sign in".
 *
 * Hence a three-phase latch rather than a boolean test:
 *
 *   idle   — no link involved; hand off as soon as both inputs are in.
 *   armed  — the callback route has been seen, so the parked
 *            destination is void. The callback owns navigation.
 *   done   — the void destination has been discarded. The boot hand-off
 *            is finished, exactly as it is finished after a normal
 *            `navigate`; nothing later depends on it (sign-out does its
 *            own `router.replace`).
 *
 * `armed` is re-entered on every visit to the callback route, so a
 * second link after a failed first one is protected too. Every
 * transition is idempotent for a repeated input, so a double-invoked
 * effect cannot turn a `discard` into a `navigate`.
 */

export type BootHandoffPhase = 'idle' | 'armed' | 'done';

export const initialBootHandoffPhase: BootHandoffPhase = 'idle';

export type BootHandoffInput<T extends string> = {
  /** The splash has finished saying what it had to say. */
  splashDone: boolean;
  /** Where session restore decided to go. `null` until it answers. */
  destination: T | null;
  /** The magic-link callback route is currently on screen. */
  onAuthCallback: boolean;
};

export type BootHandoffAction<T extends string> =
  /** Not yet, or never — nothing to do. */
  | { kind: 'wait' }
  /** The parked destination was decided pre-exchange; drop it. */
  | { kind: 'discard' }
  | { kind: 'navigate'; to: T };

export function nextBootHandoff<T extends string>(
  phase: BootHandoffPhase,
  input: BootHandoffInput<T>,
): { phase: BootHandoffPhase; action: BootHandoffAction<T> } {
  // Arm while the route is up, whatever phase we were in. Checked first
  // so arming never depends on the order two effects happen to run in.
  if (input.onAuthCallback) return { phase: 'armed', action: { kind: 'wait' } };

  // Both inputs are required before any decision; the phase survives.
  if (!input.splashDone || input.destination === null) {
    return { phase, action: { kind: 'wait' } };
  }

  if (phase === 'armed') return { phase: 'done', action: { kind: 'discard' } };
  if (phase === 'done') return { phase: 'done', action: { kind: 'wait' } };

  return { phase: 'done', action: { kind: 'navigate', to: input.destination } };
}
