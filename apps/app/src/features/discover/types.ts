/**
 * Discover's screen-side types.
 *
 * Split out of `DiscoverScreen` in M5b so the extracted components can
 * name `DiscoverBook` without importing the screen that renders them —
 * which would be a cycle, and would pull three thousand lines into any
 * file that wanted one type.
 */

/**
 * Screen-side book shape. A superset of the API's DiscoverBook, with
 * UI-specific fields (`coverColor`, `coverLabel`) derived from the
 * source data + a deterministic palette.
 *
 * `source` is the literal source name (matching `ImportableBook`) so
 * the import flow's type-narrowing works without extra coercion.
 */
export type DiscoverBook = {
  id: string;
  title: string;
  coverLabel?: string;
  author: string;
  coverColor: string;
  /** Real cover image (Gutenberg jpeg). When set the cards render an
   * <Image>; the colored cover is the fallback. */
  coverUrl: string | null;
  /** Direct EPUB URL — used by the import flow. */
  epubUrl: string | null;
  tags: string[];
  about: string;
  /** Source identifier the edge function knows how to import from.
   * The OPDS sources (feedbooks, manybooks, doab, oapen) are served
   * by the generic `discover-opds` edge function — see `discoverApi.ts`. */
  source:
    | 'gutenberg'
    | 'standardebooks'
    | 'openlibrary'
    | 'wikisource'
    | 'feedbooks'
    | 'manybooks'
    | 'doab'
    | 'oapen';
  /** Display label for the detail view ("Project Gutenberg"). */
  sourceLabel?: string;
};
