/**
 * FocusRing — §6's focus-visible ring, as an overlay.
 *
 * ## Why an overlay and not a border
 *
 * A border changes the box. Turning one on when a row gains focus
 * reflows the row and everything under it, which is visible as a jump
 * while tabbing down a list — the exact moment the ring exists to help.
 * `Input` solves the same problem by reserving the ring's width in
 * padding at all times; that works for a field, but a list row and a
 * grid tile already have their geometry set by the layout around them,
 * and reserving space inside each one would mean touching every
 * surface's measurements.
 *
 * An absolutely positioned sibling costs nothing when hidden and
 * cannot move anything when shown.
 *
 * ## Why it never takes a press
 *
 * `pointerEvents: 'none'`. The ring sits above the row's content by
 * paint order, so without that it would swallow the press it is drawn
 * in response to, on exactly the element the user is trying to
 * activate.
 *
 * ## Shapes
 *
 * `row` insets, `card` outsets. The reasoning for the two is on
 * `tokens.focusRing`; the short version is that a row has neighbours
 * flush against it and a card has gutter.
 */

import { StyleSheet, View } from 'react-native';
import { tokens } from '~/design/tokens';

export type FocusRingShape = 'row' | 'card';

export type FocusRingProps = {
  /**
   * Paint it. Callers pass `focused && isKeyboardModality()`, never
   * `focused` alone — see `platform/focusVisible`.
   */
  visible: boolean;
  shape: FocusRingShape;
  /**
   * Override the shape's radius, for an element whose own corners are
   * not the 8 or 12 the brief assumes.
   *
   * A ring has to follow the curve it sits inside or the mismatch reads
   * as a rendering bug: a 10pt button with an 8pt ring inset 2 looks
   * right, the same button with a flat-cornered ring does not. For an
   * inset ring the matching value is the element's radius minus the
   * inset, which is the inverse of what `Input` does for its outset
   * halo (`input.radius + ringWidth`).
   */
  radius?: number;
};

export function FocusRing({ visible, shape, radius }: FocusRingProps) {
  // Unmounted rather than transparent: there is nothing to animate, and
  // a list of 200 rows should not carry 200 invisible overlays.
  if (!visible) return null;

  return (
    <View
      pointerEvents="none"
      style={[
        shape === 'row' ? styles.row : styles.card,
        radius !== undefined && { borderRadius: radius },
      ]}
    />
  );
}

const ring = {
  position: 'absolute',
  borderWidth: tokens.focusRing.width,
  borderColor: tokens.borderColors.accent,
} as const;

const styles = StyleSheet.create({
  row: {
    ...ring,
    top: tokens.focusRing.row.inset,
    right: tokens.focusRing.row.inset,
    bottom: tokens.focusRing.row.inset,
    left: tokens.focusRing.row.inset,
    borderRadius: tokens.focusRing.row.radius,
  },
  card: {
    ...ring,
    top: -tokens.focusRing.card.outset,
    right: -tokens.focusRing.card.outset,
    bottom: -tokens.focusRing.card.outset,
    left: -tokens.focusRing.card.outset,
    borderRadius: tokens.focusRing.card.radius,
  },
});
