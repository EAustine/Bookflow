import { supabase } from '~/lib/supabase';

/**
 * One `pages` row. Here rather than in the reader because both the
 * reader and the download orchestrator read these, and the type
 * travelling through a feature barrel is what the import cycle was
 * built from. See `offlineLibrary.ts`.
 */
export type PageRow = {
  id: string;
  book_id: string;
  page_index: number;
  pdf_page_number: number | null;
  /**
   * The printed page number as the publisher set it ("22", "xii"), when
   * the PDF declares one. Display only — front matter commonly restarts
   * numbering, so labels are neither unique nor ordered and must never
   * be used as a key. `pdf_page_number` stays canonical.
   */
  page_label: string | null;
  title: string | null;
  content: string | null;
  html_content: string | null;
  word_count: number | null;
};

/**
 * Reading every `pages` row for a book, past the server's row cap.
 *
 * `.range(0, 9999)` does NOT lift that cap, which is what every caller
 * of this table used to assume. `db-max-rows` is a server setting, and
 * PostgREST truncates the response to it whatever range the client asks
 * for. Measured on "Expositions of Holy Scripture" (1570 pages): the
 * response carried exactly 1000 rows, so 570 pages were missing from the
 * reader's list entirely, a jump to page 1151 found no row to scroll to
 * and silently did nothing, and an offline download saved two thirds of
 * the book.
 *
 * So page through instead. The step is the number of rows the server
 * actually returned, never the number we asked for, because the cap may
 * be lower than `PAGE_CHUNK` and nothing in the response tells us what
 * it is. A batch shorter than the longest one seen is the end of the
 * book: the server would have filled it to the cap if more rows existed.
 */
const PAGE_CHUNK = 1000;

/** Hard stop, so a server that keeps returning rows cannot spin forever. */
const PAGE_ROW_LIMIT = 20_000;

export async function fetchAllPageRows<T>(
  bookId: string,
  columns: string,
  abortSignal?: AbortSignal,
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const rows: T[] = [];
  let serverPage = 0;

  for (let from = 0; rows.length < PAGE_ROW_LIMIT; ) {
    let query = supabase
      .from('pages')
      .select(columns)
      .eq('book_id', bookId)
      .order('page_index', { ascending: true })
      .range(from, from + PAGE_CHUNK - 1);
    if (abortSignal) query = query.abortSignal(abortSignal);

    const { data, error } = await query;
    if (error) return { data: null, error };

    const batch = (data ?? []) as unknown as T[];
    for (const row of batch) rows.push(row);

    if (batch.length === 0) break;
    if (serverPage > 0 && batch.length < serverPage) break;
    serverPage = Math.max(serverPage, batch.length);
    from += batch.length;
  }

  return { data: rows, error: null };
}
