export type BookType = 'pdf' | 'epub' | 'public';

/**
 * Backend-driven processing state. `null` / `undefined` means "no real
 * backing row" — used by curated/static data so the UI doesn't try to gate
 * them. Anything matching `failed:*` (e.g. `failed:scanned_pdf`) collapses
 * into the failed bucket at the call site.
 */
export type BookProcessingStatus =
  | 'pending'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'failed'
  | string
  | null;

export type Book = {
  id: string;
  title: string;
  author: string;
  type: BookType;
  totalPages: number;
  currentPage: number;
  progressPercent: number;
  currentChapter?: string;
  lastReadAt: Date | null;
  addedAt: Date;
  coverColor: string;
  /** true when the book's audio has been cached for offline playback. */
  downloaded?: boolean;
  /** Raw backend status. Library uses this to gate taps and pick row variants. */
  processingStatus?: BookProcessingStatus;
  /** Storage path under the private `books` bucket. Resolved to a signed URL by BookCover. */
  coverStoragePath?: string | null;
  /**
   * 0-based persisted reading position from Supabase. Used by the reader
   * to default to where the user left off. Maps to `books.last_read_page`
   * after the chapters→pages migration; the field is still consumed in
   * a few legacy spots as the chapter or PDF-page index, depending on
   * the format. Step 4 of the rename pass relabels the UI usage.
   */
  last_read_page?: number;
  /**
   * URL the book was imported from (Gutendex, Standard Ebooks, etc).
   * Null for device-uploaded books. The Discover screen reverse-maps
   * this to a Discover id so the AddPill on a previously-imported
   * book shows as "In library" instead of "Add".
   */
  source_url?: string | null;
};
