import { describe, expect, it } from 'vitest';
import { breakpoints, layoutClassFor, readingMeasure } from './breakpoints';

/**
 * The boundaries, checked one pixel either side.
 *
 * This is the one piece of the responsive layer where an off-by-one is
 * invisible: a tablet one pixel below its breakpoint renders the phone
 * layout perfectly happily, and nothing throws. Everything downstream —
 * the rail, the presenter's container choice, the gutters — reads this
 * function, so a wrong edge here is wrong everywhere at once.
 */
describe('layoutClassFor', () => {
  it('puts each class on the right side of its floor', () => {
    expect(layoutClassFor(599)).toBe('compact');
    expect(layoutClassFor(600)).toBe('medium');
    expect(layoutClassFor(1023)).toBe('medium');
    expect(layoutClassFor(1024)).toBe('expanded');
    expect(layoutClassFor(1279)).toBe('expanded');
    expect(layoutClassFor(1280)).toBe('desktop');
  });

  it('matches the frame widths the designs were drawn at', () => {
    // §1 of the brief: 393 phone, 820 tablet portrait, 1180 tablet
    // landscape, 1440 desktop. If one of these ever lands in the wrong
    // class, the screenshots stop matching Figma.
    expect(layoutClassFor(393)).toBe('compact');
    expect(layoutClassFor(820)).toBe('medium');
    expect(layoutClassFor(1180)).toBe('expanded');
    expect(layoutClassFor(1440)).toBe('desktop');
  });

  it('falls back to compact on a width that is not a width', () => {
    // A zero or NaN arrives for one frame on some mounts, before the
    // window has been measured. Compact is the safe answer: the phone
    // layout fits on every screen, a desktop layout does not.
    expect(layoutClassFor(0)).toBe('compact');
    expect(layoutClassFor(-1)).toBe('compact');
    expect(layoutClassFor(Number.NaN)).toBe('compact');
  });

  it('keeps going at absurd widths rather than falling off the end', () => {
    expect(layoutClassFor(5000)).toBe('desktop');
    expect(layoutClassFor(Number.POSITIVE_INFINITY)).toBe('desktop');
  });

  it('agrees with the breakpoint values it is derived from', () => {
    // Guards against the floors and the function drifting apart.
    for (const [name, floor] of Object.entries(breakpoints)) {
      expect(layoutClassFor(floor)).toBe(name);
    }
  });
});

describe('readingMeasure', () => {
  it('is the 680 cap from the brief', () => {
    // §1 `layout/reading/measure`, and §10: reader text, the PDF and the
    // player columns never exceed it.
    expect(readingMeasure).toBe(680);
  });
});
