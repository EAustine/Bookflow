/**
 * Orientation policy — §1 of docs/specs/responsive-handoff.md: phones
 * stay portrait-locked, tablets and web rotate freely.
 *
 * The global `orientation` in app.json is a single value for the whole
 * app, so it cannot express that. iOS can, declaratively:
 * `UISupportedInterfaceOrientations` applies to iPhone and
 * `UISupportedInterfaceOrientations~ipad` to iPad, and the OS enforces
 * both before JS starts, so there is no frame of wrong rotation. Android
 * has no per-idiom manifest equivalent — `android:screenOrientation` is
 * one value per activity — so the phone lock has to happen at runtime,
 * which is what this is.
 *
 * It runs on iOS too. The lock is redundant there against the plist, but
 * one code path is easier to reason about than two, and if the plist
 * ever drifts this still holds the line.
 *
 * First occupant of `src/platform/*`, the home for native-only modules
 * (architecture §8). `orientation.web.ts` is the no-op sibling Metro
 * picks up for the web build.
 */

import { Dimensions } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { breakpoints } from '~/design/tokens';

/**
 * Whether this device is a phone, for the purposes of the lock.
 *
 * Two deliberate choices. It reads `screen`, not `window`: an iPad in
 * split view has a window narrower than 600 but is not a phone, and
 * locking it to portrait would be wrong. And it compares the *shortest*
 * side, so the answer does not flip when the device rotates — a phone
 * held sideways is still a phone.
 */
function isPhone(): boolean {
  const { width, height } = Dimensions.get('screen');
  return Math.min(width, height) < breakpoints.medium;
}

/**
 * Called once at startup. Locks a phone to portrait and leaves anything
 * larger free to rotate.
 *
 * Never re-evaluated: the device does not change category mid-session,
 * and re-locking on a resize would fight an iPad entering split view.
 */
export async function applyOrientationPolicy(): Promise<void> {
  try {
    if (isPhone()) {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    } else {
      await ScreenOrientation.unlockAsync();
    }
  } catch (err) {
    // Non-fatal by design. A failed lock means the app rotates when it
    // should not, which is a cosmetic problem; throwing here would mean
    // it does not start at all.
    console.warn('[orientation] could not apply the policy:', err);
  }
}
