/**
 * Where a downloaded book lives on disk, and the one part of it both
 * features read.
 *
 * ## Why this is in `core/` and not in `listen/`
 *
 * Downloading belongs to Listen: it fetches narration, alignment
 * sidecars and a manifest, and `audioDownloads.ts` owns that layout.
 * But it also caches the book's **page text**, and the *reader* reads
 * that back for its offline fallback — so the one file both features
 * touch sat inside one of them.
 *
 * That made a cycle, and a dangerous kind. `useBookChapters` imported
 * `getCachedPages` from `~/features/listen`, whose barrel `export *`s
 * `ListenScreen`, which imports `~/features/reader`, whose barrel
 * `export *`s `useBookChapters`. Every edge runs through a barrel, and
 * a barrel is evaluated at module load — the exact shape that crashed
 * the app during M3 with "Cannot read property 'map' of undefined"
 * inside `metroRequire`.
 *
 * It was invisible to the gate. `import/no-cycle` is scoped to
 * relative specifiers, because the resolver cannot follow `~/*`, so a
 * cycle built entirely from aliases is one the rule cannot see in
 * either a single-file or a whole-tree run. Open question 16 in
 * `ARCHITECTURE_LOG.md` recorded it; this is the fix it proposed, and
 * the same one `bookCovers` got: the shared thing moves to `core/`,
 * owned by neither feature.
 *
 * The root and per-book directory live here too rather than staying
 * behind in `audioDownloads`. Splitting a directory layout across two
 * modules is how the two halves drift apart.
 */

import { readText, writeText, type CachePath } from '~/platform/fileCache';
import type { PageRow } from './pageRows';

/**
 * On-disk layout, under the platform's private document directory:
 *
 *   bookflow-offline/<bookId>/pages.json            cached page text
 *   bookflow-offline/<bookId>/manifest.json         download manifest
 *   bookflow-offline/<bookId>/a_<page>_<voice>.mp3  narration
 *   bookflow-offline/<bookId>/a_<page>_<voice>.json alignment
 */
const ROOT = 'bookflow-offline';

/** Everything Bookflow has downloaded. Deleting this clears all of it. */
export const offlineRootPath: CachePath = [ROOT];

/** One book's downloads. Deleting this clears that book. */
export const offlineBookPath = (bookId: string): CachePath => [ROOT, bookId];

/** The book's page text, written at download, read by the reader. */
export const cachedPagesPath = (bookId: string): CachePath => [
  ROOT,
  bookId,
  'pages.json',
];

/**
 * The cached page rows for a book, or null when its text was never
 * downloaded or cannot be read.
 *
 * Null rather than an empty array, and never a throw: the caller is
 * deciding whether to fall back to the network, and "no cache" and "an
 * empty book" must not look alike.
 */
export async function readCachedPages(
  bookId: string,
): Promise<PageRow[] | null> {
  try {
    const text = await readText(cachedPagesPath(bookId));
    if (text === null) return null;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as PageRow[]) : null;
  } catch {
    return null;
  }
}

export async function writeCachedPages(
  bookId: string,
  pages: PageRow[],
): Promise<void> {
  await writeText(cachedPagesPath(bookId), JSON.stringify(pages));
}
