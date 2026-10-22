/**
 * Layout breakpoints — §3 of docs/ARCHITECTURE.md.
 *
 * New in M1. Nothing consumes these yet: `useLayoutClass()` and the
 * shells arrive in M7, which is blocked on tablet and desktop frames
 * existing in Figma. They live here now because §11 says breakpoints
 * are tokens, and because `tokens.css` needs them to emit media
 * queries the web shell and the reader engine can share.
 *
 * Width decides the class, not the device: an iPad in split view is
 * Compact, a narrow desktop window is Medium.
 */
export const breakpoints = {
  /** Phone. Bottom tab bar, bottom sheets. */
  compact: 0,
  /** Tablet portrait. Side rail, popovers and side panels. */
  medium: 600,
  /** Desktop and large tablet. Side rail with labels, multi-column. */
  expanded: 1024,
} as const;

export type LayoutClass = keyof typeof breakpoints;

/** The reading measure cap from §3. Not a breakpoint — a content width. */
export const readingMeasure = 680;

export function layoutClassFor(width: number): LayoutClass {
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.medium) return 'medium';
  return 'compact';
}
