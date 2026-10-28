/**
 * Bridging an EPUB's scroll position and the text reader's page index.
 *
 * A PDF has real pages, so Full and Text map 1:1 and need no arithmetic
 * (see `pdfIndexOf` in pageDisplay.ts). An EPUB does not: Full mode is
 * one continuous scroll of the publisher's HTML and the text reader's
 * pages are ~200-word slices, so the only shared coordinate is "how far
 * through the book am I". These two functions are that bridge, and they
 * are here together because the only property that matters is that they
 * are each other's inverse — a toggle to Full and back must land where
 * it started.
 *
 * Approximate by nature: it assumes roughly uniform text density, so a
 * book with large images or very uneven chapters can be a page or two
 * out. That is accepted — the alternative is per-page DOM markers in the
 * WebView, which Full mode does not have today.
 */

/**
 * Where to scroll Full mode to, for a text-reader page.
 *
 * Aims at the MIDDLE of the page's band rather than its leading edge.
 * At the edge, floating-point error in `fraction * totalPages` can land
 * a hair below the integer and floor back to the previous page, so the
 * user toggles out and returns one page earlier than they left.
 */
export function pageIndexToScrollFraction(
  pageIndex: number,
  totalPages: number,
): number {
  if (!Number.isFinite(pageIndex) || pageIndex < 0) return 0;
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  return clamp01((pageIndex + 0.5) / totalPages);
}

/** The text-reader page a scroll fraction falls in. Inverse of the above. */
export function scrollFractionToPageIndex(
  fraction: number,
  totalPages: number,
): number {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  if (!Number.isFinite(fraction)) return 0;
  const idx = Math.floor(clamp01(fraction) * totalPages);
  return Math.min(totalPages - 1, Math.max(0, idx));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Where the reader's rendered window should start so that `targetIndex`
 * lands `lead` rows from its top.
 *
 * The text reader renders a slice of a book's pages, not all of them.
 * That is not a memory optimisation — it is the only way a long jump can
 * land. A vertical list of variable-height rows cannot scroll to a row it
 * has not measured, and measurement only advances a few rows per frame:
 * measured on a 1,570-page book, a jump to page 1512 moved the list four
 * rows per attempt and stopped, clamped, at page 50. Slicing the data so
 * the destination is a dozen rows from the top turns every jump into a
 * short one.
 *
 * `lead` is the backward context kept behind the landing page, so a
 * search result is not pinned to the very top of the book with nothing
 * above it.
 *
 * The one invariant that matters: the target always ends up within
 * `lead` rows of the window start. Nothing else about the window is
 * load-bearing, and an earlier version that also pulled the window back
 * from the end of the book — so the last pages would "fill" the list —
 * broke exactly that. A jump to page 1507 of 1570 produced a window
 * starting at 1270 and a target 236 rows down, which is just as
 * unreachable as 1511 was, and it landed on page 1323. A short window at
 * the end of a book costs nothing; a distant target costs everything.
 */
export function windowStartFor(
  targetIndex: number,
  totalPages: number,
  windowPages: number,
  lead: number,
): number {
  if (!Number.isFinite(totalPages) || totalPages <= 0) return 0;
  if (!Number.isFinite(windowPages) || windowPages <= 0) return 0;
  // A book that fits in one window never slides: every page is present,
  // and moving the start would only hide pages for no gain.
  if (totalPages <= windowPages) return 0;
  const target = Number.isFinite(targetIndex) ? targetIndex : 0;
  const wanted = target - (Number.isFinite(lead) ? lead : 0);
  return Math.max(0, wanted);
}
