/**
 * Offline queue — the Supabase half.
 *
 * Maps each queued operation onto the write it stands for. The queue's
 * decisions (coalescing, ordering, backoff) live in
 * `@bookflow/shared/offline-queue`, which has no network and is tested
 * exhaustively; this file has the network and is therefore kept as
 * small and as dumb as possible.
 *
 * Writes mirror the existing call sites rather than inventing new ones:
 *   - progress  → `useBookChapters.ts` persistPosition
 *   - highlight → `highlights.ts` create/delete
 *
 * Idempotency rests on `highlights.id` being a client-settable
 * `uuid primary key`. Supplying it means a retry after a timeout hits
 * the primary key rather than creating a second highlight — and
 * `highlights.ts` already treats 23505 (unique_violation) as a soft
 * success, which is the same reasoning arrived at independently.
 */
import type { QueuedOp } from '@bookflow/shared/src';
import { supabase } from '~/lib/supabase';

export type ExecResult =
  | { ok: true }
  /** Retry later — the network failed, or the server had a bad day. */
  | { ok: false; retry: true; error: string }
  /**
   * Do not retry. The operation can never succeed: the row is gone, the
   * user lost access, the payload is malformed. Retrying forever would
   * block every op behind it, because draining is ordered.
   */
  | { ok: false; retry: false; error: string };

/** Postgres error codes we must not retry. */
const PERMANENT = new Set([
  '23503', // foreign_key_violation — the book or page is gone
  '22P02', // invalid_text_representation — malformed id
  '42501', // insufficient_privilege — RLS says no
]);

function classify(error: { code?: string; message: string }): ExecResult {
  // A duplicate is the retry we were hoping for: the row is already
  // there, which is exactly the state this op wanted.
  if (error.code === '23505') return { ok: true };
  if (error.code && PERMANENT.has(error.code)) {
    return { ok: false, retry: false, error: `${error.code}: ${error.message}` };
  }
  return { ok: false, retry: true, error: error.message };
}

export async function execute(op: QueuedOp): Promise<ExecResult> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) {
    // Signed out with writes still pending. Not retryable as this user —
    // and replaying them under the next account would write one user's
    // highlights into another's library.
    return { ok: false, retry: false, error: 'no session' };
  }

  try {
    switch (op.kind) {
      case 'progress.set': {
        const { error } = await supabase
          .from('books')
          .update({
            last_read_page: op.pageIndex,
            last_read_at: new Date(op.at).toISOString(),
          })
          .eq('id', op.bookId)
          .eq('user_id', userId);
        return error ? classify(error) : { ok: true };
      }

      case 'highlight.create': {
        const { error } = await supabase.from('highlights').insert({
          // Client-supplied, which is what makes the retry idempotent.
          id: op.highlightId,
          user_id: userId,
          book_id: op.bookId,
          page_id: op.pageId,
          page_index: op.pageIndex,
          // `kind` is `not null` with a check constraint on ('word',
          // 'sentence'). The generated types caught it missing — worth
          // noting, because an insert without it fails at runtime only.
          kind: op.highlightKind,
          text: op.text,
        });
        return error ? classify(error) : { ok: true };
      }

      case 'highlight.delete': {
        const { error } = await supabase
          .from('highlights')
          .delete()
          .eq('id', op.highlightId)
          .eq('user_id', userId);
        // A delete that matches nothing is a success: the row is gone,
        // which is the state asked for.
        return error ? classify(error) : { ok: true };
      }

      case 'bookmark.toggle': {
        // No bookmarks table yet. The op type exists because the brief
        // names bookmarks, and leaving it out would mean changing the
        // queue's shape later; failing permanently is honest, and the
        // dead-op surface makes it visible rather than silent.
        return { ok: false, retry: false, error: 'bookmarks not implemented' };
      }
    }
  } catch (err) {
    // Thrown rather than returned: almost always the fetch itself, so
    // retryable.
    return { ok: false, retry: true, error: String(err) };
  }
}
