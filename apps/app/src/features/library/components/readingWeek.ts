/**
 * The reading-week strip and its duration format, shared by the phone's
 * stats card and the tablet hero so the two cannot drift.
 *
 * `formatDuration` is deliberately NOT `formatMinutes` from
 * `@bookflow/shared`. They take the same argument and mean different
 * things: the shared one renders "381 min" for a credit or quota
 * figure, this one renders "6h 21m" for time spent reading. Importing
 * the wrong one turns the Library's headline from "6h 21m today" into
 * "381 min today", which is why this carries a different name.
 */

/**
 * Monday → Sunday, with stable ids so React keys do not collide on the
 * repeated single-letter labels (T/T, S/S).
 */
export const WEEKDAYS = [
  { id: 'mon', label: 'M' },
  { id: 'tue', label: 'T' },
  { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' },
  { id: 'fri', label: 'F' },
  { id: 'sat', label: 'S' },
  { id: 'sun', label: 'S' },
] as const;

/**
 * Today's index in `WEEKDAYS`, so the highlighted dot tracks the device
 * clock rather than a hardcoded position. `getDay()` is Sunday-first;
 * the strip is Monday-first.
 */
export function weekdayTodayIndex(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}

/** "45m", "2h", "6h 21m" — time spent reading. */
export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const remaining = min % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}
