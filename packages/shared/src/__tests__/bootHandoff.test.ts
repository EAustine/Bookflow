import { describe, expect, it } from 'vitest';
import {
  initialBootHandoffPhase,
  nextBootHandoff,
  type BootHandoffAction,
  type BootHandoffInput,
  type BootHandoffPhase,
} from '../bootHandoff';

type Route = '/(auth)/welcome' | '/(onboarding)/intent' | '/(tabs)/library';

const WELCOME: Route = '/(auth)/welcome';
const LIBRARY: Route = '/(tabs)/library';

/**
 * Replays a sequence of inputs the way the effect does — threading the
 * phase through — and returns the action each one produced. The bugs
 * this guards against are all sequence bugs: every individual decision
 * looked right, and the damage was done by a later re-run acting on a
 * value decided earlier.
 */
function replay(
  steps: BootHandoffInput<Route>[],
  from: BootHandoffPhase = initialBootHandoffPhase,
): BootHandoffAction<Route>[] {
  let phase = from;
  return steps.map((step) => {
    const next = nextBootHandoff(phase, step);
    phase = next.phase;
    return next.action;
  });
}

const booting = (over: Partial<BootHandoffInput<Route>> = {}) => ({
  splashDone: false,
  destination: null,
  onAuthCallback: false,
  ...over,
});

describe('nextBootHandoff — ordinary launch, no link', () => {
  it('waits for both inputs, then hands off once', () => {
    expect(
      replay([
        booting(),
        booting({ destination: LIBRARY }), // restore answered, splash still running
        booting({ splashDone: true }), // splash done, destination not yet in
        booting({ splashDone: true, destination: LIBRARY }),
      ]),
    ).toEqual([
      { kind: 'wait' },
      { kind: 'wait' },
      { kind: 'wait' },
      { kind: 'navigate', to: LIBRARY },
    ]);
  });

  it('does not hand off twice if the effect re-runs', () => {
    const ready = booting({ splashDone: true, destination: LIBRARY });
    expect(replay([ready, ready, ready])).toEqual([
      { kind: 'navigate', to: LIBRARY },
      { kind: 'wait' },
      { kind: 'wait' },
    ]);
  });
});

describe('nextBootHandoff — magic-link cold start', () => {
  /**
   * The regression. Restore runs before the exchange, finds no session
   * and parks Welcome; the callback then succeeds and navigates to
   * Library, which takes the route off screen. That last step used to
   * fire the parked Welcome and throw the sign-in away.
   */
  it('discards the pre-exchange destination instead of navigating to it', () => {
    const actions = replay([
      // Cold start lands on the callback route.
      booting({ onAuthCallback: true }),
      // Restore finds no session yet and parks Welcome. Splash finishes.
      booting({ onAuthCallback: true, destination: WELCOME }),
      booting({ onAuthCallback: true, destination: WELCOME, splashDone: true }),
      // The exchange succeeds and the callback navigates to Library, so
      // the route is no longer on screen — but `destination` is stale.
      booting({ destination: WELCOME, splashDone: true }),
      // Any further re-run must stay quiet too.
      booting({ destination: WELCOME, splashDone: true }),
    ]);

    expect(actions).toEqual([
      { kind: 'wait' },
      { kind: 'wait' },
      { kind: 'wait' },
      { kind: 'discard' },
      { kind: 'wait' },
    ]);
    expect(actions.some((a) => a.kind === 'navigate')).toBe(false);
  });

  it('leaves the error screen’s own way out alone', () => {
    // The exchange failed, so the callback stays up and paints its error
    // screen; the user taps "Back to sign in", which takes the route off
    // screen. The parked Welcome must not override that either.
    const actions = replay([
      booting({ onAuthCallback: true, destination: WELCOME, splashDone: true }),
      booting({ destination: WELCOME, splashDone: true }),
    ]);
    expect(actions[1]).toEqual({ kind: 'discard' });
  });

  it('re-arms for a second link after a failed first one', () => {
    const actions = replay([
      // First link: armed, then discarded on the way to Sign in.
      booting({ onAuthCallback: true, destination: WELCOME, splashDone: true }),
      booting({ destination: WELCOME, splashDone: true }),
      // Second link arrives warm and mounts the callback route again.
      booting({ onAuthCallback: true, destination: WELCOME, splashDone: true }),
      // It succeeds and navigates away. Still no stale Welcome.
      booting({ destination: WELCOME, splashDone: true }),
    ]);
    expect(actions).toEqual([
      { kind: 'wait' },
      { kind: 'discard' },
      { kind: 'wait' },
      { kind: 'discard' },
    ]);
  });

  /**
   * The latch must not outlive the visit it was armed for, but it also
   * must not be cleared so eagerly that the next re-run acts on the
   * stale destination. A repeated input is the cheap proxy for a
   * double-invoked effect.
   */
  it('is idempotent for a repeated input, so a discard never becomes a navigate', () => {
    const left = booting({ destination: WELCOME, splashDone: true });
    expect(replay([booting({ onAuthCallback: true }), left, left, left])).toEqual([
      { kind: 'wait' },
      { kind: 'discard' },
      { kind: 'wait' },
      { kind: 'wait' },
    ]);
  });

  /**
   * Signing in through a link, then signing out without restarting.
   *
   * The shell performs that last navigation itself
   * (`router.replace('/(auth)/welcome')` in `useShellSession`), so what
   * this has to prove is that the boot hand-off stays out of the way
   * for the rest of the process.
   *
   * It must not fire again *at all*, not even towards Welcome. The
   * destination parked at boot happens to be Welcome here, because a
   * link cold start runs restore before the exchange — so a hand-off
   * that fired would look correct in this one scenario while being
   * wrong in general, and would have taken a user who was reading in
   * Library back to the start screen.
   */
  it('stays out of the way when a link sign-in is followed by signing out', () => {
    const actions = replay([
      // Cold start on the callback route. Restore finds no session yet
      // and parks Welcome; the splash finishes.
      booting({ onAuthCallback: true }),
      booting({ onAuthCallback: true, destination: WELCOME, splashDone: true }),
      // The exchange succeeds and the callback navigates into the app.
      booting({ destination: WELCOME, splashDone: true }),
      // Sign out, same process, no restart. The shell replaces to
      // Welcome; the hand-off's own inputs are unchanged.
      booting({ destination: WELCOME, splashDone: true }),
      booting({ destination: WELCOME, splashDone: true }),
    ]);

    expect(actions).toEqual([
      { kind: 'wait' },
      { kind: 'wait' },
      { kind: 'discard' },
      { kind: 'wait' },
      { kind: 'wait' },
    ]);
    expect(actions.some((a) => a.kind === 'navigate')).toBe(false);
  });

  /** The same guarantee entered directly at the finished phase. */
  it('never navigates again once finished', () => {
    expect(
      replay(
        [
          booting({ destination: LIBRARY, splashDone: true }),
          booting({ destination: LIBRARY, splashDone: true }),
        ],
        'done',
      ),
    ).toEqual([{ kind: 'wait' }, { kind: 'wait' }]);
  });
});
