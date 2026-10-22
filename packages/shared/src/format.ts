/**
 * Pure formatting helpers shared by app, web and edge functions.
 *
 * Moved here in M1 from the screens that defined them, unchanged. They
 * were private functions inside `LibraryScreen` and `TopupBalanceBlock`,
 * which meant they could not be tested and could not be reused by the
 * web shell or an edge function.
 */

/**
 * Compact credit count: "450K", "1.2M", "8,000".
 *
 * From `TopupBalanceBlock`. `toLocaleString()` below 1,000 is deliberate
 * — it keeps the thousands separator for the 1,000–9,999 band the
 * rounding above does not cover.
 */
export function formatCredits(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString();
}

/** "1,234 min" */
export function formatMinutes(n: number): string {
  return `${n.toLocaleString()} min`;
}

/**
 * "just now" / "5m ago" / "yesterday" / "3 weeks ago" / a date.
 *
 * From `LibraryScreen`. `now` is a parameter rather than `Date.now()`
 * so the function stays pure and testable — that was already true
 * before the move and is why it tests cleanly.
 */
export function formatRelativeTime(date: Date | null, now: Date): string {
  if (!date) return 'never';
  // Clamp to >= 0 so any clock skew (device behind server, or a stale `now`
  // from a long-stationary screen) reads as "just now" instead of negative.
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week ago';
  if (weeks < 4) return `${weeks} weeks ago`;
  return date.toLocaleDateString();
}
