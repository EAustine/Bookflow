/**
 * Layout breakpoints — §3 of docs/ARCHITECTURE.md, §1 of
 * docs/specs/responsive-handoff.md.
 *
 * Width decides the class, not the device: an iPad in split view is
 * Compact, a narrow desktop window is Medium.
 *
 * Desktop is a width, not a platform. The brief's §1 size table lists
 * Expanded and Desktop as overlapping ("1024 and up" for both), which
 * width alone cannot resolve; the rule that does is "the rail expands
 * from 1280", so that is where Desktop starts. The traits that really
 * are about being on the web — no status bar, no splash, no pull to
 * refresh, hover and focus — key off `Platform.OS` instead, in
 * `useSizeClass()`. An iPad Pro at 1366 therefore gets the Desktop
 * layout and keeps its status bar.
 */
export const breakpoints = {
  /** Phone. Bottom tab bar, bottom sheets. */
  compact: 0,
  /** Tablet portrait. Side rail collapsed, popovers and side panels. */
  medium: 600,
  /** Tablet landscape. Side rail collapsed, master and detail. */
  expanded: 1024,
  /** Side rail expands to 240 with the lockup. */
  desktop: 1280,
} as const;

export type LayoutClass = keyof typeof breakpoints;

/** The reading measure cap from §3. Not a breakpoint — a content width. */
export const readingMeasure = 680;

export function layoutClassFor(width: number): LayoutClass {
  // Descending, so each test only has to clear its own floor. A NaN or
  // negative width fails every comparison and falls through to compact,
  // which is the safe default: the phone layout fits everywhere.
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.expanded) return 'expanded';
  if (width >= breakpoints.medium) return 'medium';
  return 'compact';
}
