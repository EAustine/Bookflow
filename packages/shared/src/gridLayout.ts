/**
 * Column arithmetic for the Library's cover grid — §4 of
 * docs/specs/responsive-handoff.md.
 *
 * Pure, and here rather than in the component, because it encodes a
 * number the brief and the build log both state: at 820 the grid is
 * four columns of 153. That falls out of
 * `820 − 72 rail − 2×32 gutter = 684`, less `3×24` of gaps, over four.
 * If the rail or the gutter ever changes, this is where it shows up as
 * a failing test rather than as a layout that quietly looks wrong.
 */

export type GridOptions = {
  /** Never more columns than this. §4 asks for four. */
  maxColumns: number;
  /** Drop a column rather than let a tile get narrower than this. */
  minTile: number;
};

/**
 * Width of one tile, given a column count. Gaps sit between tiles only,
 * so there are `columns - 1` of them.
 */
export function tileWidth(
  availableWidth: number,
  gap: number,
  columns: number,
): number {
  if (columns < 1) return availableWidth;
  return (availableWidth - gap * (columns - 1)) / columns;
}

/**
 * How many columns fit.
 *
 * Medium starts at 600, where four columns would be 98px wide. So four
 * is a ceiling, not a constant: the grid gives up a column rather than
 * render a cover too small to recognise.
 */
export function gridColumns(
  availableWidth: number,
  gap: number,
  { maxColumns, minTile }: GridOptions,
): number {
  for (let n = maxColumns; n > 1; n--) {
    if (tileWidth(availableWidth, gap, n) >= minTile) return n;
  }
  return 1;
}
