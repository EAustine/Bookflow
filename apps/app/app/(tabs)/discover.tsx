/**
 * The discover tab — a route stub, not a screen.
 *
 * `DiscoverTab` exists so Expo Router registers `/discover` as a real URL. The
 * screen itself is drawn by `SignedInShell`, which the `(tabs)` layout
 * renders as a SIBLING of this route's `<Slot />`.
 *
 * It must render `null`, not a view. Until 2026-10-28 this returned
 * `<View style={{ flex: 1 }} />` with a comment calling it "nothing" —
 * but `flex: 1` is a claim on the layout, and two flex-1 siblings in a
 * column each take half. The entire signed-in app rendered in the top
 * half of the screen, tab bar and all, with the bottom half empty. A
 * stub that occupies no space is what the layout above assumes.
 */
export default function DiscoverTab() {
  return null;
}
