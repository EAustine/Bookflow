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
