import { describe, expect, it } from 'vitest';
import { gridColumns, tileWidth } from '../gridLayout';

const GAP = 24; // tokens.layout.columnGap
const OPTS = { maxColumns: 4, minTile: 132 };

/** Content width at a given window width, once the rail and gutters go. */
function content(windowWidth: number, rail = 72, gutter = 32): number {
  return windowWidth - rail - gutter * 2;
}

describe('Library grid columns', () => {
  it('is four columns of 153 at 820, the width the frame was drawn at', () => {
    // The one number both the brief and the build log state outright.
    const available = content(820);
    expect(available).toBe(684);
    expect(gridColumns(available, GAP, OPTS)).toBe(4);
    expect(tileWidth(available, GAP, 4)).toBe(153);
  });

  it('never exceeds four columns, however wide the window', () => {
    // §4 asks for four. A 1023px window has room for five, and five
    // would stop matching the design.
    for (const w of [900, 1000, 1023]) {
      expect(gridColumns(content(w), GAP, OPTS)).toBeLessThanOrEqual(4);
    }
  });

  it('drops a column rather than render a tile below the floor', () => {
    // Medium starts at 600, where four columns would be 98 wide.
    const available = content(600);
    const n = gridColumns(available, GAP, OPTS);
    expect(n).toBeLessThan(4);
    expect(tileWidth(available, GAP, n)).toBeGreaterThanOrEqual(OPTS.minTile);
  });

  it('keeps every tile at or above the floor across the whole Medium range', () => {
    // The property that matters: whatever the window, no tile is ever
    // narrower than minTile unless even one column cannot manage it.
    for (let w = 600; w <= 1023; w += 1) {
      const available = content(w);
      const n = gridColumns(available, GAP, OPTS);
      if (n > 1) {
        expect(tileWidth(available, GAP, n)).toBeGreaterThanOrEqual(OPTS.minTile);
      }
    }
  });

  it('fills the width exactly, leaving no stray pixels', () => {
    for (let w = 600; w <= 1023; w += 7) {
      const available = content(w);
      const n = gridColumns(available, GAP, OPTS);
      const used = tileWidth(available, GAP, n) * n + GAP * (n - 1);
      expect(used).toBeCloseTo(available, 6);
    }
  });

  it('falls back to a single column when nothing else fits', () => {
    expect(gridColumns(100, GAP, OPTS)).toBe(1);
    expect(tileWidth(100, GAP, 1)).toBe(100);
  });
});
