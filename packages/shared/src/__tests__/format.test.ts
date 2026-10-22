import { describe, expect, it } from 'vitest';
import { formatCredits, formatMinutes, formatRelativeTime } from '../format.js';

describe('formatCredits', () => {
  it('leaves small numbers alone, with separators', () => {
    expect(formatCredits(0)).toBe('0');
    expect(formatCredits(999)).toBe('999');
  });

  it('rounds thousands to K', () => {
    expect(formatCredits(1_000)).toBe('1K');
    expect(formatCredits(8_000)).toBe('8K');
    expect(formatCredits(450_000)).toBe('450K');
  });

  it('gives millions one decimal, but only when needed', () => {
    expect(formatCredits(1_000_000)).toBe('1M');
    expect(formatCredits(1_200_000)).toBe('1.2M');
  });

  // Worth pinning: 1,500 -> "2K" overstates the balance by 500 credits.
  // That is the existing behaviour, not a bug introduced by the move, so
  // the test records it rather than changing it.
  it('rounds half-up at the K boundary, which can overstate', () => {
    expect(formatCredits(1_500)).toBe('2K');
    expect(formatCredits(1_499)).toBe('1K');
  });
});

describe('formatMinutes', () => {
  it('separates thousands', () => {
    expect(formatMinutes(1_234)).toBe('1,234 min');
    expect(formatMinutes(0)).toBe('0 min');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  it('handles a missing date', () => {
    expect(formatRelativeTime(null, now)).toBe('never');
  });

  it('walks the bands', () => {
    expect(formatRelativeTime(ago(30_000), now)).toBe('just now');
    expect(formatRelativeTime(ago(5 * MIN), now)).toBe('5m ago');
    expect(formatRelativeTime(ago(3 * HOUR), now)).toBe('3h ago');
    expect(formatRelativeTime(ago(DAY), now)).toBe('yesterday');
    expect(formatRelativeTime(ago(3 * DAY), now)).toBe('3 days ago');
    expect(formatRelativeTime(ago(8 * DAY), now)).toBe('1 week ago');
    expect(formatRelativeTime(ago(20 * DAY), now)).toBe('2 weeks ago');
  });

  // The clamp exists because a device clock behind the server produced
  // negative durations like "-3m ago".
  it('clamps future dates to "just now" rather than going negative', () => {
    expect(formatRelativeTime(new Date(now.getTime() + 60 * MIN), now)).toBe('just now');
  });

  it('falls back to a date past four weeks', () => {
    const old = ago(40 * DAY);
    expect(formatRelativeTime(old, now)).toBe(old.toLocaleDateString());
  });
});
