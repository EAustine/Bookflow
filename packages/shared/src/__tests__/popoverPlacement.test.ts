import { describe, expect, it } from 'vitest';
import { placePopover, type AnchorRect } from '../popoverPlacement';

const OPTS = { width: 340, gutter: 32 };
/** Tablet landscape, the size most of the designs were drawn at. */
const W = 1180;
const H = 820;

/** A header icon button, `n` px from the right edge of the window. */
function buttonFromRight(n: number, winW = W): AnchorRect {
  return { x: winW - n - 40, y: 40, width: 40, height: 40 };
}

describe('placePopover', () => {
  it('centres the card on its trigger when there is room', () => {
    const anchor: AnchorRect = { x: 500, y: 40, width: 40, height: 40 };
    const p = placePopover(anchor, W, H, OPTS);
    // Trigger centre 520, card 340 wide -> 520 - 170.
    expect(p.left).toBe(350);
    expect(p.from).toBe('top');
    expect(p.offset).toBe(88); // 40 + 40 + 8
    // Arrow sits under the trigger centre, in card-local coordinates.
    expect(p.arrowLeft).toBe(520 - 350 - 5);
  });

  it('drops the arrow and right-aligns to the gutter near the edge', () => {
    // The §3 rule, and §10's done-when. The Figma frame for it is
    // `Library / Sort & filter / Popover / Medium`.
    const p = placePopover(buttonFromRight(10), W, H, OPTS);
    expect(p.arrowLeft).toBeNull();
    expect(p.left).toBe(W - 32 - 340);
    // Right edge lands exactly on the gutter.
    expect(p.left + 340).toBe(W - 32);
  });

  it('turns on whether the CARD crosses the gutter, not where the anchor is', () => {
    // The rule asks about the card, so the threshold is a function of
    // the card's width, not a fixed distance. Here: the card crosses
    // the right gutter once the trigger's centre passes
    // `1180 - 32 - 170 = 978`, which `buttonFromRight(n)` reaches at
    // n = 182. One pixel either side, where an off-by-one would hide.
    expect(placePopover(buttonFromRight(181), W, H, OPTS).arrowLeft).toBeNull();
    expect(
      placePopover(buttonFromRight(182), W, H, OPTS).arrowLeft,
    ).not.toBeNull();
  });

  it('right-aligns the Library + button on a Medium tablet', () => {
    // The case the rule was changed for. At 820 the header `+` sits 32
    // from the window edge — outside the old 24-from-the-anchor rule,
    // so that version kept the arrow and then clamped the card anyway.
    // Figma draws it Arrow=None, right-aligned (build log: "Add book |
    // new popover (Arrow None, right aligned)").
    const medium = { width: 340, gutter: 32 };
    const plus: AnchorRect = { x: 820 - 32 - 36, y: 40, width: 36, height: 36 };
    const p = placePopover(plus, 820, 1180, medium);
    expect(p.arrowLeft).toBeNull();
    expect(p.left + 340).toBe(820 - 32);
  });

  it('answers differently for a 340 popover and a 280 menu on one trigger', () => {
    // The point of asking about the card: the same trigger gets an
    // arrow or not depending on how wide the card is. At 820 a centre
    // of 630 puts a 340 card over the right gutter (630 + 170 = 800 >
    // 788) while `layout/menu/width` still fits (630 + 140 = 770). A
    // fixed anchor threshold cannot tell these apart.
    const trigger: AnchorRect = { x: 612, y: 40, width: 36, height: 36 };
    expect(
      placePopover(trigger, 820, 1180, { width: 340, gutter: 32 }).arrowLeft,
    ).toBeNull();
    expect(
      placePopover(trigger, 820, 1180, { width: 280, gutter: 32 }).arrowLeft,
    ).not.toBeNull();
  });

  it('handles a trigger near the left edge the same way', () => {
    const anchor: AnchorRect = { x: 10, y: 40, width: 40, height: 40 };
    const p = placePopover(anchor, W, H, OPTS);
    expect(p.arrowLeft).toBeNull();
    expect(p.left).toBe(32);
  });

  it('never lets the card run off either side', () => {
    // Sweep a trigger across the whole window; the card has to stay
    // within the gutters at every position.
    for (let x = 0; x <= W - 40; x += 10) {
      const p = placePopover({ x, y: 40, width: 40, height: 40 }, W, H, OPTS);
      expect(p.left).toBeGreaterThanOrEqual(32);
      expect(p.left + 340).toBeLessThanOrEqual(W - 32);
    }
  });

  it('keeps the arrow inside the card it belongs to', () => {
    for (let x = 0; x <= W - 40; x += 10) {
      const p = placePopover({ x, y: 40, width: 40, height: 40 }, W, H, OPTS);
      if (p.arrowLeft === null) continue;
      expect(p.arrowLeft).toBeGreaterThanOrEqual(12);
      expect(p.arrowLeft + 10).toBeLessThanOrEqual(340 - 12);
    }
  });

  it('opens upward when the trigger is near the bottom', () => {
    // A trigger in an action bar has no room below it.
    const anchor: AnchorRect = { x: 500, y: H - 80, width: 40, height: 40 };
    const p = placePopover(anchor, W, H, OPTS);
    expect(p.from).toBe('bottom');
    expect(p.offset).toBe(H - (H - 80) + 8);
  });

  it('centres with no arrow when there is no anchor', () => {
    const p = placePopover(null, W, H, OPTS);
    expect(p.arrowLeft).toBeNull();
    expect(p.left).toBe((W - 340) / 2);
  });

  it('stays on screen in a window narrower than the card', () => {
    // 340 + two 32 gutters needs 404. At 360 the card cannot fit, and
    // the clamp must not invert and push it off the left edge.
    const p = placePopover({ x: 300, y: 40, width: 40, height: 40 }, 360, H, OPTS);
    expect(p.left).toBe(32);
  });

  it('always leaves a usable height, however cramped', () => {
    for (const y of [0, 100, 400, 700, 800]) {
      const p = placePopover({ x: 500, y, width: 40, height: 40 }, W, H, OPTS);
      expect(p.maxHeight).toBeGreaterThanOrEqual(160);
    }
  });
});

/**
 * The `side` axis, added for the Listen tab's voice pill. Every other
 * popover in the app drops below its trigger; this one sits beside it,
 * because the pill is small enough to point an arrow at and the picker
 * is taller than the room underneath.
 */
describe('placePopover, side axis', () => {
  const SIDE = { ...OPTS, axis: 'side' as const };
  /** The voice pill on the Listen tab's player card. */
  const pill: AnchorRect = { x: 120, y: 293, width: 150, height: 36 };

  it('puts the card to the trigger\'s right, arrow on its own left', () => {
    const p = placePopover(pill, W, H, SIDE);
    // 120 + 150 + the 8 default gap.
    expect(p.left).toBe(278);
    expect(p.arrowSide).toBe('left');
    expect(p.arrowLeft).toBeNull();
  });

  it('aligns the card top with the trigger top, as the frame draws it', () => {
    // `Listen / Voice / Popover / Expanded` puts the card at y 293,
    // which is the pill's own y.
    const p = placePopover(pill, W, H, SIDE);
    expect(p.from).toBe('top');
    expect(p.offset).toBe(293);
  });

  it('points the arrow at the trigger centre, not at the card top', () => {
    const p = placePopover(pill, W, H, SIDE);
    // Pill centre is 293 + 18 = 311, card top is 293, arrow is 10 tall.
    expect(p.arrowTop).toBe(311 - 293 - 5);
  });

  it('prefers the right even when both sides fit', () => {
    // The pill above sits too far left for the left side to be an
    // option, so it cannot tell a preference from a fallback. This one
    // fits either way: right is what the frame draws.
    const middle: AnchorRect = { x: 500, y: 300, width: 150, height: 36 };
    const p = placePopover(middle, W, H, SIDE);
    expect(p.left).toBe(500 + 150 + 8);
    expect(p.arrowSide).toBe('left');
  });

  it('flips to the left when the right would cross the gutter', () => {
    // A pill hard against the right edge: 340 + 8 will not fit after it.
    const nearRight: AnchorRect = { x: W - 200, y: 300, width: 150, height: 36 };
    const p = placePopover(nearRight, W, H, SIDE);
    expect(p.left).toBe(W - 200 - 8 - 340);
    expect(p.arrowSide).toBe('right');
  });

  it('gives up the arrow when neither side fits', () => {
    // A 600 window cannot hold a 340 card beside a centred 150 trigger
    // on either side, so the card is clamped and the arrow goes, which
    // is the same concession the vertical axis makes at an edge.
    const p = placePopover({ x: 225, y: 300, width: 150, height: 36 }, 600, H, SIDE);
    expect(p.arrowSide).toBeNull();
    expect(p.arrowTop).toBeNull();
    expect(p.left).toBeGreaterThanOrEqual(32);
    expect(p.left + 340).toBeLessThanOrEqual(600 - 32);
  });

  it('pulls the card up rather than squeezing it at the bottom edge', () => {
    const low: AnchorRect = { x: 120, y: H - 60, width: 150, height: 36 };
    const p = placePopover(low, W, H, SIDE);
    expect(p.offset).toBeLessThan(low.y);
    expect(p.maxHeight).toBeGreaterThanOrEqual(160);
    // Still on screen.
    expect(p.offset).toBeGreaterThanOrEqual(32);
  });

  it('keeps the arrow inside the card at every trigger height', () => {
    for (const y of [0, 40, 300, 700, 819]) {
      const p = placePopover({ x: 120, y, width: 150, height: 36 }, W, H, SIDE);
      if (p.arrowTop === null) continue;
      expect(p.arrowTop).toBeGreaterThanOrEqual(12);
      expect(p.arrowTop).toBeLessThanOrEqual(p.maxHeight - 12 - 10);
    }
  });
});
