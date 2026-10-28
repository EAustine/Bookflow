/**
 * The one-line status under a book's title.
 *
 * Lifted out of `LibraryScreen` so the list row, the grid tile and the
 * book pane all say the same thing. They each rendered their own
 * version of this before, which is how the search result row and the
 * list row drifted apart.
 *
 * `formatRelativeTime` came with it, and turned out to be a byte-for-byte
 * duplicate of the one already in `@bookflow/shared` — which has tests.
 * This uses that one.
 */

import { formatRelativeTime } from '@bookflow/shared';
import type { Book } from '~/types/book';

export type BookState =
  | 'processing'
  | 'failed'
  | 'not-started'
  | 'in-progress'
  | 'finished';

/**
 * Which of the five states a book is in. The grid tile's variants
 * (§5, `Book grid tile` 324:975) are exactly these.
 */
export function bookState(book: Book): BookState {
  const status = book.processingStatus;
  if (status === 'pending' || status === 'processing') return 'processing';
  // Failure codes are a family — `failed`, `failed_scanned_pdf`, … — so
  // this is a prefix test, not an equality one.
  if (typeof status === 'string' && status.startsWith('failed')) return 'failed';
  if (book.progressPercent === 100) return 'finished';
  if (book.progressPercent === 0) return 'not-started';
  return 'in-progress';
}

export function bookStatusLine(book: Book, now: Date): string {
  if (book.progressPercent === 100) {
    return `Finished · 100% · ${formatRelativeTime(book.lastReadAt, now)}`;
  }
  if (book.progressPercent === 0) {
    return `Not started · added ${formatRelativeTime(book.addedAt, now)}`;
  }
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  const pagePart = pageNum ? `Page ${pageNum}` : null;
  return [pagePart, `read ${formatRelativeTime(book.lastReadAt, now)}`]
    .filter(Boolean)
    .join(' · ');
}
