/**
 * Library server state, through TanStack Query (§6).
 *
 * Runs alongside `useBooks` rather than replacing it. The existing
 * provider owns realtime, the AsyncStorage cache and the optimistic
 * updates that three screens depend on; swapping it out wholesale,
 * untestable, would be the riskiest change in this milestone.
 *
 * What this adds is what the provider cannot do: **fetch by id**.
 * `/read/[bookId]` and `/book/[id]` — two of the routes deferred from
 * M2 — need a book resolved from a URL parameter, with no guarantee
 * the list has loaded or that the book is even in it.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '~/lib/supabase';
import { rowToBook, type BookRow } from '~/hooks/useBooksImpl';
import type { Book } from '~/types/book';
import { libraryKeys } from './keys';

/**
 * Kept identical to `useBooksImpl`'s select, including `source_url`,
 * whose absence silently breaks Discover's "In library" pill.
 */
// One literal, not a concatenation: supabase-js parses this string at
// compile time to type the result, and a built-up string collapses to
// `GenericStringError`.
const BOOK_COLUMNS =
  'id, title, author, cover_storage_path, processing_status, total_pages, file_type, last_read_page, last_read_position, last_read_at, created_at, source_url';

export async function fetchBook(bookId: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select(BOOK_COLUMNS)
    .eq('id', bookId)
    .maybeSingle();

  // `maybeSingle`, not `single`: a book the user no longer owns is a
  // legitimate outcome of an old deep link, and `single` would turn
  // that into a thrown error rather than an empty state the UI can
  // explain. RLS already scopes the row to this user.
  if (error) throw error;
  return data ? rowToBook(data as BookRow) : null;
}

/**
 * One book by id.
 *
 * `enabled` guards the empty-string case that a route param can be
 * mid-navigation; without it the query fires with no id and fails.
 */
export function useBook(bookId: string | undefined) {
  return useQuery({
    queryKey: libraryKeys.detail(bookId ?? ''),
    queryFn: () => fetchBook(bookId!),
    enabled: Boolean(bookId),
  });
}
