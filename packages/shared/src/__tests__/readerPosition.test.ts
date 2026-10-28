import { describe, expect, it } from 'vitest';
import {
  pageIndexToScrollFraction,
  scrollFractionToPageIndex,
} from '../readerPosition';

describe('EPUB position round-trip', () => {
  it('returns to the page it started on, for every page of a book', () => {
    // The property the whole pair exists for: toggle to Full and back
    // and you are where you were. Checked exhaustively rather than on a
    // sample, because the failure mode is a single off-by-one at one
    // end of the range.
    for (const total of [1, 2, 7, 120, 1570]) {
      for (let page = 0; page < total; page++) {
        const fraction = pageIndexToScrollFraction(page, total);
        expect(scrollFractionToPageIndex(fraction, total)).toBe(page);
      }
    }
  });

  it('aims at the middle of a page band, not its leading edge', () => {
    // Edge-aiming is what lets float error floor back a page.
    expect(pageIndexToScrollFraction(0, 10)).toBeCloseTo(0.05);
    expect(pageIndexToScrollFraction(9, 10)).toBeCloseTo(0.95);
  });

  it('keeps the first and last pages inside the book', () => {
    expect(pageIndexToScrollFraction(0, 100)).toBeGreaterThan(0);
    expect(pageIndexToScrollFraction(99, 100)).toBeLessThan(1);
  });

  it('never returns a page past the end', () => {
    // A fraction of exactly 1 would floor to `totalPages`, one past the
    // last index.
    expect(scrollFractionToPageIndex(1, 20)).toBe(19);
    expect(scrollFractionToPageIndex(1.5, 20)).toBe(19);
  });

  it('clamps negative and out-of-range input instead of propagating it', () => {
    expect(scrollFractionToPageIndex(-0.5, 20)).toBe(0);
    expect(pageIndexToScrollFraction(-3, 20)).toBe(0);
  });

  it('degrades to the start when the page count is unknown', () => {
    // A book whose totalPages has not been computed yet must not divide
    // by zero or produce NaN — it opens at the beginning.
    expect(pageIndexToScrollFraction(5, 0)).toBe(0);
    expect(scrollFractionToPageIndex(0.5, 0)).toBe(0);
    expect(pageIndexToScrollFraction(5, Number.NaN)).toBe(0);
    expect(scrollFractionToPageIndex(Number.NaN, 20)).toBe(0);
  });
});
