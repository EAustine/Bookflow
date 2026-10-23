/**
 * Offline write queue — the pure half.
 *
 * Reading, highlighting and progress must work on a plane, in a lecture
 * hall with no signal, or on a Ghanaian data plan that ran out
 * yesterday. Today they do not: `highlights.ts` and `readingSessions.ts`
 * write straight to Supabase, with no offline branch and no client
 * ids, so an offline highlight is simply lost.
 *
 * This module is the queue's decision-making, with no storage, no
 * network and no clock of its own — so it can be tested exhaustively.
 * `apps/app/src/core/offline-queue` supplies persistence, the Supabase
 * executor and the connectivity listener.
 *
 * Three properties the brief asks for, and how each is met:
 *
 *   **Idempotent client ids.** Every operation carries a `clientId`
 *   generated at enqueue. Replaying an operation the server already
 *   applied is a no-op, which matters because "did that request land?"
 *   is unanswerable after a timeout.
 *
 *   **Ordered replay.** Operations drain in enqueue order. Highlights
 *   must not arrive before the page they belong to is known, and a
 *   delete must not precede its create.
 *
 *   **Survives restart.** The queue serialises to plain JSON.
 *
 * The interesting behaviour is what the queue does *not* replay:
 * see `coalesce` below.
 */

/** A page-progress write. Only the newest per book is worth sending. */
export type ProgressOp = {
  kind: 'progress.set';
  bookId: string;
  pageIndex: number;
  /** Epoch ms at enqueue. Used to resolve coalescing, not to order. */
  at: number;
};

/** Mirrors the `kind` check constraint on the highlights table. */
export type HighlightKind = 'word' | 'sentence';

export type HighlightCreateOp = {
  kind: 'highlight.create';
  /** The row's own kind — distinct from the op's `kind` discriminator.
   *  `not null` with a check constraint, so the queue has to carry it. */
  highlightKind: HighlightKind;
  pageIndex: number;
  /** Client-generated. Becomes the row's primary key, which is what
   *  makes a retry idempotent rather than a duplicate highlight. */
  highlightId: string;
  bookId: string;
  pageId: string;
  text: string;
  at: number;
};

export type HighlightDeleteOp = {
  kind: 'highlight.delete';
  highlightId: string;
  at: number;
};

export type BookmarkToggleOp = {
  kind: 'bookmark.toggle';
  bookId: string;
  pageId: string;
  /** The value being set, not a flip — a flip replayed twice is a bug. */
  bookmarked: boolean;
  at: number;
};

export type OpBody =
  | ProgressOp
  | HighlightCreateOp
  | HighlightDeleteOp
  | BookmarkToggleOp;

export type QueuedOp = OpBody & {
  /** Unique per enqueue. The server's idempotency key. */
  clientId: string;
  /** Failed attempts so far. */
  attempts: number;
  /** Epoch ms before which this op should not be retried. */
  nextAttemptAt: number;
  /** Last failure, kept for diagnosis rather than logic. */
  lastError?: string;
};

export type Queue = {
  version: 1;
  ops: QueuedOp[];
};

export const emptyQueue = (): Queue => ({ version: 1, ops: [] });

/** Give up after this many failures and surface the op as dead. */
export const MAX_ATTEMPTS = 8;

/**
 * Exponential backoff with a ceiling, in ms: 1s, 2s, 4s … capped at 5m.
 *
 * Capped because an app that has been offline for a day should retry
 * promptly when signal returns, not wait out a backoff computed from
 * failures that were all the same failure.
 */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** Math.max(0, attempts), 5 * 60_000);
}

/**
 * Collapse operations that supersede or cancel each other.
 *
 * This is the part worth getting right. A reader who turns 300 pages on
 * a plane enqueues 300 progress writes; replaying all of them on
 * reconnect is 300 requests to reach a state the last one alone
 * describes. Worse, a highlight created and then deleted offline would
 * replay as a create followed by a delete — two requests to achieve
 * nothing, and the delete fails if the create does.
 *
 * Rules, applied in enqueue order so the result stays ordered:
 *
 *   - `progress.set` keeps only the **last** op per book.
 *   - `highlight.delete` of a highlight whose `create` is still queued
 *     removes **both**. The server never hears about either, which is
 *     correct: it never knew.
 *   - `bookmark.toggle` keeps only the last per (book, page), because
 *     it carries an absolute value rather than a flip.
 *
 * Everything else is preserved exactly, including order.
 */
export function coalesce(ops: QueuedOp[]): QueuedOp[] {
  // Highlights created and then deleted while offline: drop the pair.
  const deletedLocally = new Set<string>();
  const createdLocally = new Set<string>();
  for (const op of ops) {
    if (op.kind === 'highlight.create') createdLocally.add(op.highlightId);
    if (op.kind === 'highlight.delete' && createdLocally.has(op.highlightId)) {
      deletedLocally.add(op.highlightId);
    }
  }

  // Index of the last op for each coalescing key, so earlier ones drop.
  const lastIndex = new Map<string, number>();
  ops.forEach((op, i) => {
    const key = coalesceKey(op);
    if (key) lastIndex.set(key, i);
  });

  return ops.filter((op, i) => {
    if (
      (op.kind === 'highlight.create' || op.kind === 'highlight.delete') &&
      deletedLocally.has(op.highlightId)
    ) {
      return false;
    }
    const key = coalesceKey(op);
    return key ? lastIndex.get(key) === i : true;
  });
}

/** Ops sharing a key supersede one another; `null` means keep every one. */
function coalesceKey(op: QueuedOp): string | null {
  switch (op.kind) {
    case 'progress.set':
      return `progress:${op.bookId}`;
    case 'bookmark.toggle':
      return `bookmark:${op.bookId}:${op.pageId}`;
    default:
      return null;
  }
}

/** Append an operation. `clientId` comes from the caller so the id can
 *  be reused as a row primary key before the write ever leaves. */
export function enqueue(
  queue: Queue,
  body: OpBody,
  clientId: string,
): Queue {
  const op: QueuedOp = { ...body, clientId, attempts: 0, nextAttemptAt: 0 };
  return { ...queue, ops: coalesce([...queue.ops, op]) };
}

/**
 * The ops to attempt now, in order.
 *
 * Stops at the first op that is not yet due rather than skipping past
 * it. Order is a correctness property here — draining out of order
 * could send a highlight delete before its create.
 */
export function due(queue: Queue, now: number): QueuedOp[] {
  const out: QueuedOp[] = [];
  for (const op of queue.ops) {
    if (op.attempts >= MAX_ATTEMPTS) continue;
    if (op.nextAttemptAt > now) break;
    out.push(op);
  }
  return out;
}

/** Remove an op that the server accepted. */
export function succeeded(queue: Queue, clientId: string): Queue {
  return { ...queue, ops: queue.ops.filter((o) => o.clientId !== clientId) };
}

/** Record a failure and schedule the retry. */
export function failed(
  queue: Queue,
  clientId: string,
  error: string,
  now: number,
): Queue {
  return {
    ...queue,
    ops: queue.ops.map((o) =>
      o.clientId === clientId
        ? {
            ...o,
            attempts: o.attempts + 1,
            nextAttemptAt: now + backoffMs(o.attempts),
            lastError: error,
          }
        : o,
    ),
  };
}

/**
 * Ops that have exhausted their retries.
 *
 * Kept in the queue rather than dropped: losing a user's highlight
 * silently is worse than carrying a row that needs attention, and the
 * UI can surface them. `due()` already skips them.
 */
export function dead(queue: Queue): QueuedOp[] {
  return queue.ops.filter((o) => o.attempts >= MAX_ATTEMPTS);
}

/** Parse a persisted queue, tolerating anything unexpected. */
export function deserialize(raw: string | null | undefined): Queue {
  if (!raw) return emptyQueue();
  try {
    const parsed = JSON.parse(raw) as Queue;
    if (parsed?.version !== 1 || !Array.isArray(parsed.ops)) return emptyQueue();
    // A corrupt queue must not take reading offline with it. Starting
    // empty loses pending writes; refusing to start loses the app.
    return { version: 1, ops: parsed.ops.filter(isOp) };
  } catch {
    return emptyQueue();
  }
}

function isOp(o: unknown): o is QueuedOp {
  if (!o || typeof o !== 'object') return false;
  const op = o as Partial<QueuedOp>;
  return typeof op.clientId === 'string' && typeof op.kind === 'string';
}

export function serialize(queue: Queue): string {
  return JSON.stringify(queue);
}
