/**
 * Whether the current focus came from the keyboard — the §8 adapter
 * behind §6's focus-visible ring.
 *
 * ## Why this is not just `focused`
 *
 * `react-native-web`'s `Pressable` reports `focused` for *any* focus,
 * including a mouse click. §6 asks for **focus-visible**: "Map Hover to
 * `Pressable` hover state on web and Focus-visible to keyboard focus."
 * Painting a ring on `focused` alone would put an accent ring around
 * every row the user clicks, which is the thing `:focus-visible` exists
 * in CSS to avoid and is not what the Figma frames show.
 *
 * CSS `:focus-visible` is not reachable from here: the app styles with
 * `StyleSheet.create` and tokens, and there is no stylesheet to attach
 * a pseudo-class to. So the modality is tracked instead, which is what
 * browsers do internally.
 *
 * ## Why native is a constant
 *
 * §6's last line is "Touch builds show neither". There is no hover and
 * no keyboard on a phone, so this is `false` forever on native and the
 * ring never paints. That is the whole native implementation, which is
 * also why this is an adapter rather than a hook with a platform branch
 * inside it.
 */

/**
 * True when focus most likely arrived from the keyboard.
 *
 * Read during render, next to the `focused` state, rather than
 * subscribed to: for the case that matters the modality is already
 * correct when focus changes, because the `keydown` for Tab is
 * dispatched before the resulting `focus`. A pointer press after a
 * keyboard focus does not repaint the ring, which matches how browsers
 * keep `:focus-visible` on an element that was tabbed to.
 */
export function isKeyboardModality(): boolean {
  return false;
}
