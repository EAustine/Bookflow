/**
 * Keyboard-modality tracking on web. See `focusVisible.ts` for why the
 * `focused` state is not enough on its own.
 *
 * Two listeners, registered once at module load, which is safe because
 * this module is only evaluated in a browser. `keydown` sets keyboard
 * modality and `pointerdown` clears it, both in the capture phase so
 * they run before any focus handler that will read the result.
 *
 * Tab, the arrow keys and Enter/Space are not distinguished from any
 * other key: holding a modifier or typing into a field also sets
 * keyboard modality, and that is correct. Someone typing is someone
 * navigating by keyboard, and the ring only paints on an element that
 * also has focus.
 */

let keyboardModality = false;

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => {
    keyboardModality = true;
  }, true);
  window.addEventListener('pointerdown', () => {
    keyboardModality = false;
  }, true);
}

export const isKeyboardModality: typeof import('./focusVisible').isKeyboardModality =
  () => keyboardModality;
