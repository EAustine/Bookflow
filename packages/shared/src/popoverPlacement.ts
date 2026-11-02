/**
 * Where an anchored popover goes — §3 of
 * docs/specs/responsive-handoff.md.
 *
 * Pure arithmetic, deliberately separated from the component that draws
 * it. The rules it encodes are the ones §10 of the brief tests for, and
 * the fallback is easier to assert here than to reach by tapping.
 *
 * **The edge rule is about the card, not the anchor.** If the popover
 * placed with its arrow on the trigger would cross the window gutter,
 * it drops the arrow and aligns to the gutter instead. An earlier
 * version asked whether the *anchor* sat within 24 of the window edge,
 * which is a different question and gives a different answer in the
 * case that actually matters: the Library's `+` button on a Medium
 * tablet sits 32 from the edge, so the old rule kept the arrow and then
 * clamped the card anyway — an arrow pointing at nothing in particular.
 * Asking about the card catches that, and it is also the rule Figma
 * draws (`Arrow=None`, right-aligned).
 */

/** A trigger's position in window coordinates. */
export type AnchorRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PlacementOptions = {
  /** The popover's width. `layout.popover.width`, 340. */
  width: number;
  /** The page gutter for this size class. */
  gutter: number;
  /** Gap between the trigger and the card. */
  offset?: number;
  /** The arrow's width, and how far it stays from the card's corners. */
  arrow?: number;
  arrowInset?: number;
  /** Below this much room, open upward instead of downward. */
  minDrop?: number;
  /**
   * Which axis the card is placed on.
   *
   * `vertical` is the default and what every popover in the app used
   * until now: the card drops below its trigger, or flips above when
   * below is cramped.
   *
   * `side` puts the card beside the trigger instead, which the Listen
   * tab's voice pill asks for (`Listen / Voice / Popover / *`): the
   * card sits to the pill's right with the arrow on its own left edge,
   * pointing back at it. A pill is small enough to point an arrow at,
   * and the picker is taller than the room under it.
   */
  axis?: 'vertical' | 'side';
};

export type Placement = {
  left: number;
  /** Which window edge `offset` is measured from. */
  from: 'top' | 'bottom';
  offset: number;
  maxHeight: number;
  /**
   * The arrow's left, in card-local coordinates — or null when the card
   * is edge-aligned and shows no arrow at all (§3), and on every `side`
   * placement, where `arrowTop` carries it instead.
   */
  arrowLeft: number | null;
  /**
   * `side` only: the arrow's top in card-local coordinates, and which
   * of the card's own edges it sits on. `null` on a vertical placement,
   * and on a side placement that had to give up its arrow.
   *
   * `arrowSide: 'left'` means the arrow is on the card's left edge
   * pointing left, so the trigger is to the left of the card.
   */
  arrowTop: number | null;
  arrowSide: 'left' | 'right' | null;
};

export function placePopover(
  anchor: AnchorRect | null,
  windowWidth: number,
  windowHeight: number,
  options: PlacementOptions,
): Placement {
  const {
    width,
    gutter,
    offset: gap = 8,
    arrow = 10,
    arrowInset = 12,
    minDrop = 160,
    axis = 'vertical',
  } = options;

  // No anchor: centre it. A menu with nothing to point at is rare — a
  // call site that has not passed its trigger ref yet — and a centred
  // card is the one answer that is never wrong.
  if (!anchor) {
    return {
      left: Math.max(gutter, (windowWidth - width) / 2),
      from: 'top',
      offset: Math.max(gutter, windowHeight * 0.2),
      maxHeight: windowHeight * 0.6,
      arrowLeft: null,
      arrowTop: null,
      arrowSide: null,
    };
  }

  if (axis === 'side') return placeBeside(anchor, windowWidth, windowHeight, {
    width,
    gutter,
    gap,
    arrow,
    arrowInset,
    minDrop,
  });

  // Where the card would sit if the arrow pointed at the trigger: the
  // card centred on the anchor's centre.
  const arrowed = anchor.x + anchor.width / 2 - width / 2;

  // Does that cross a gutter? If so the arrow cannot be honoured, so
  // drop it and align to the gutter it crossed. Both sides are checked
  // because a trigger on the left of a narrow window overflows left.
  const crossesRight = arrowed + width > windowWidth - gutter;
  const crossesLeft = arrowed < gutter;
  const edgeAligned = crossesRight || crossesLeft;

  // Edge-aligned or arrowed, the result goes through the same clamp.
  // Right-aligning without it produced a negative left in a window
  // narrower than the card plus its gutters — the card ran off the
  // left edge while trying to respect the right one.
  const preferred = edgeAligned
    ? crossesRight
      ? windowWidth - gutter - width
      : gutter
    : arrowed;
  const left = clamp(preferred, gutter, windowWidth - gutter - width);

  // Prefer dropping below the trigger. Flip above only when below has
  // less room than a popover can usefully use.
  const below = windowHeight - (anchor.y + anchor.height) - gap - gutter;
  const from: 'top' | 'bottom' = below >= minDrop ? 'top' : 'bottom';
  const offset =
    from === 'top'
      ? anchor.y + anchor.height + gap
      : windowHeight - anchor.y + gap;
  const room = from === 'top' ? below : anchor.y - gap - gutter;

  return {
    left,
    from,
    offset,
    maxHeight: Math.max(minDrop, room),
    arrowLeft: edgeAligned
      ? null
      : clamp(
          anchor.x + anchor.width / 2 - left - arrow / 2,
          arrowInset,
          width - arrowInset - arrow,
        ),
    arrowTop: null,
    arrowSide: null,
  };
}

/**
 * The `side` axis: the card beside its trigger rather than under it.
 *
 * Prefers the trigger's right, which is where
 * `Listen / Voice / Popover / *` draws it. Flips to the left when the
 * right would cross the gutter, and gives up the arrow entirely when
 * neither side fits, falling back to the gutter the card is nearest.
 * That is the same concession the vertical axis makes: an arrow aimed
 * at a card the clamp has already moved points at nothing.
 *
 * Vertically the card's **top aligns with the trigger's**, which is
 * what `Listen / Voice / Popover / Expanded` draws: the card's 293 is
 * the pill's. It is then clamped into the gutters so a pill near the
 * bottom of the window still gets a whole card, and the arrow follows
 * the trigger's centre through that clamp, which is what keeps it
 * pointing at the pill rather than at where the pill would have been.
 *
 * Top-aligned rather than centred because the card's height is not
 * known here. Centring it would mean guessing, and a guess that is
 * wrong moves the card away from the thing it belongs to.
 */
function placeBeside(
  anchor: AnchorRect,
  windowWidth: number,
  windowHeight: number,
  o: {
    width: number;
    gutter: number;
    gap: number;
    arrow: number;
    arrowInset: number;
    minDrop: number;
  },
): Placement {
  const { width, gutter, gap, arrow, arrowInset, minDrop } = o;

  const rightLeft = anchor.x + anchor.width + gap;
  const leftLeft = anchor.x - gap - width;
  const fitsRight = rightLeft + width <= windowWidth - gutter;
  const fitsLeft = leftLeft >= gutter;

  const side: 'left' | 'right' | null = fitsRight
    ? 'left'
    : fitsLeft
      ? 'right'
      : null;

  // `side` names the card's own edge, which is the opposite of the
  // direction the card moved: a card to the trigger's RIGHT carries its
  // arrow on its LEFT.
  const left =
    side === 'left'
      ? rightLeft
      : side === 'right'
        ? leftLeft
        : clamp(rightLeft, gutter, windowWidth - gutter - width);

  const top = clamp(
    anchor.y,
    gutter,
    // Leave at least a usable card's worth of room below the top, so a
    // trigger near the bottom edge pulls the card up rather than
    // squeezing it into nothing.
    Math.max(gutter, windowHeight - gutter - minDrop),
  );
  const maxHeight = Math.max(minDrop, windowHeight - gutter - top);

  return {
    left,
    from: 'top',
    offset: top,
    maxHeight,
    arrowLeft: null,
    arrowTop:
      side === null
        ? null
        : clamp(
            anchor.y + anchor.height / 2 - top - arrow / 2,
            arrowInset,
            maxHeight - arrowInset - arrow,
          ),
    arrowSide: side,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  // `hi` can fall below `lo` on a window narrower than the card plus its
  // gutters. `lo` wins there, so the card stays on screen at the leading
  // edge rather than inverting and sliding off the other side.
  return Math.max(lo, Math.min(Math.max(lo, hi), n));
}
