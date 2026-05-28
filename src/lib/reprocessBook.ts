import { supabase } from '~/lib/supabase';

/**
 * Re-runs the `process-book` Edge Function against an already-uploaded book.
 *
 * Used by the library long-press menu and by the reader's "No text
 * available" state when a user wants to retry processing — typically
 * after we've improved the splitting heuristics, deployed OCR
 * fallback for scanned PDFs, or when an upload finished but produced
 * poorly segmented pages.
 *
 * Steps:
 *   1. Look up the book to read its `file_storage_path` (we used to
 *      reconstruct the path from `{user_id}/{book_id}/original.{ext}`,
 *      but Gutenberg imports write to `{user_id}/{book_id}/source.epub`
 *      — different convention. Read the path the row actually carries).
 *   2. Delete existing pages so the re-run starts clean.
 *   3. Reset processing_status to 'processing'.
 *   4. Invoke the Edge Function with the path.
 *
 * Returns void on success; throws on hard failures so the caller can
 * surface a user-visible error.
 */
export async function reprocessBook(bookId: string): Promise<void> {
  const { data: book, error: fetchErr } = await supabase
    .from('books')
    .select('id, user_id, file_type, file_storage_path')
    .eq('id', bookId)
    .single();

  if (fetchErr || !book) {
    throw new Error(`Could not load book: ${fetchErr?.message ?? 'not found'}`);
  }

  // Prefer the path the row recorded at upload time — the upload-from-
  // device flow writes `original.{ext}` and the import-from-url flow
  // writes `source.epub`, so we can't safely guess. Fall back to the
  // upload convention only if the column is null (legacy rows pre-
  // dating the column).
  const filePath =
    (book.file_storage_path ?? null) ||
    (book.user_id && book.file_type
      ? `${book.user_id}/${book.id}/original.${book.file_type}`
      : null);
  if (!filePath) {
    throw new Error('Book has no source file on record — re-upload is required.');
  }

  // Wipe existing pages so we don't get unique-index collisions on
  // (book_id, page_index). Cascade isn't enabled for this side, so we
  // do it explicitly. (Edge function also deletes before inserting,
  // so this is belt-and-braces — but cheaper to clear here than risk
  // a half-state if the edge function dies between delete + insert.)
  const { error: delErr } = await supabase
    .from('pages')
    .delete()
    .eq('book_id', bookId);
  if (delErr) {
    throw new Error(`Could not clear old pages: ${delErr.message}`);
  }

  // Reset status. The realtime subscription in useBooks will pick this up
  // and the row will show a "Processing…" sublabel until the function
  // finishes.
  const { error: updErr } = await supabase
    .from('books')
    .update({
      processing_status: 'processing',
      total_chapters: null,
    })
    .eq('id', bookId);
  if (updErr) {
    throw new Error(`Could not reset book status: ${updErr.message}`);
  }

  const { error: invokeErr } = await supabase.functions.invoke('process-book', {
    body: { book_id: book.id, file_storage_path: filePath },
  });
  if (invokeErr) {
    throw new Error(`Edge function failed: ${invokeErr.message}`);
  }
}
