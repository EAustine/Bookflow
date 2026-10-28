import { describe, expect, it } from 'vitest';
import {
  pageIndexToScrollFraction,
  scrollFractionToPageIndex,
  windowStartFor,
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

describe('windowStartFor', () => {
  const WINDOW = 300;
  const LEAD = 12;

  it('keeps a book that fits in one window unwindowed', () => {
    // The common case: nothing about the list changes for a normal book,
    // so none of the windowing can regress it.
    expect(windowStartFor(0, 60, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(59, 60, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(299, 300, WINDOW, LEAD)).toBe(0);
  });

  it('puts the target `lead` rows from the top', () => {
    expect(windowStartFor(1511, 1570, WINDOW, LEAD)).toBe(1499);
    expect(windowStartFor(500, 1570, WINDOW, LEAD)).toBe(488);
  });

  it('does not scroll off the front of the book', () => {
    // A target inside the first `lead` pages has nowhere to put the
    // backward context, and must not produce a negative start.
    expect(windowStartFor(0, 1570, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(5, 1570, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(12, 1570, WINDOW, LEAD)).toBe(0);
  });

  it('lets the window run short at the end rather than move the target', () => {
    // Keeping the last page "filling" the list is what put a jump to
    // page 1507 two hundred rows down its own window, and it landed on
    // page 1323. A short window at the end of the book is the correct
    // trade.
    expect(windowStartFor(1569, 1570, WINDOW, LEAD)).toBe(1557);
  });

  it('always puts the target within `lead` rows of the window start', () => {
    // The property the whole jump depends on: the list can only scroll
    // to a row it has measured, and it measures about four rows per
    // attempt. Checked across a whole long book because the failure is a
    // single target drifting out of reach, not a wholesale break.
    const total = 1570;
    for (let i = 0; i < total; i++) {
      const local = i - windowStartFor(i, total, WINDOW, LEAD);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThanOrEqual(LEAD);
    }
  });

  it('degrades to the start on nonsense input', () => {
    expect(windowStartFor(5, 0, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(5, Number.NaN, WINDOW, LEAD)).toBe(0);
    expect(windowStartFor(5, 1570, 0, LEAD)).toBe(0);
  });
});
