import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  backoffMs,
  coalesce,
  dead,
  deserialize,
  due,
  emptyQueue,
  enqueue,
  failed,
  serialize,
  succeeded,
  type OpBody,
  type Queue,
} from '../offline-queue';

const progress = (bookId: string, pageIndex: number, at = 0): OpBody => ({
  kind: 'progress.set', bookId, pageIndex, at,
});
const hlCreate = (highlightId: string, at = 0): OpBody => ({
  kind: 'highlight.create', highlightId, bookId: 'b1', pageId: 'p1', text: 'x', at,
});
const hlDelete = (highlightId: string, at = 0): OpBody => ({
  kind: 'highlight.delete', highlightId, at,
});
const bookmark = (bookId: string, pageId: string, bookmarked: boolean): OpBody => ({
  kind: 'bookmark.toggle', bookId, pageId, bookmarked, at: 0,
});

/** Enqueue a list, giving each a deterministic clientId. */
function build(...bodies: OpBody[]): Queue {
  return bodies.reduce((q, b, i) => enqueue(q, b, `c${i}`), emptyQueue());
}

describe('ordering', () => {
  it('drains in enqueue order', () => {
    const q = build(hlCreate('h1'), hlCreate('h2'), hlCreate('h3'));
    expect(due(q, 0).map((o) => o.clientId)).toEqual(['c0', 'c1', 'c2']);
  });

  // Order is correctness, not neatness: a highlight delete that
  // overtakes its create fails, and a highlight that overtakes the
  // page it belongs to has nothing to attach to.
  it('stops at the first op not yet due rather than skipping it', () => {
    let q = build(hlCreate('h1'), hlCreate('h2'), hlCreate('h3'));
    q = failed(q, 'c0', 'network', 1000);          // c0 retries at 2000
    expect(due(q, 1500)).toHaveLength(0);
    expect(due(q, 2000).map((o) => o.clientId)).toEqual(['c0', 'c1', 'c2']);
  });
});

describe('coalescing progress', () => {
  // The case this exists for: 300 pages turned on a plane should be one
  // request on reconnect, not 300.
  it('keeps only the newest progress per book', () => {
    const q = build(progress('b1', 1), progress('b1', 2), progress('b1', 3));
    expect(q.ops).toHaveLength(1);
    expect((q.ops[0] as { pageIndex: number }).pageIndex).toBe(3);
  });

  it('does not coalesce across different books', () => {
    const q = build(progress('b1', 5), progress('b2', 9));
    expect(q.ops).toHaveLength(2);
  });

  it('collapses a long offline session to one write per book', () => {
    let q = emptyQueue();
    for (let page = 1; page <= 300; page++) {
      q = enqueue(q, progress('b1', page), `c${page}`);
    }
    expect(q.ops).toHaveLength(1);
    expect((q.ops[0] as { pageIndex: number }).pageIndex).toBe(300);
  });
});

describe('coalescing highlights', () => {
  // Create then delete while offline: the server never knew about it,
  // so replaying both is two requests to achieve nothing — and the
  // delete fails if the create does.
  it('drops both halves when a queued highlight is deleted offline', () => {
    const q = build(hlCreate('h1'), hlDelete('h1'));
    expect(q.ops).toHaveLength(0);
  });

  it('keeps a delete whose create is NOT queued — the server has that row', () => {
    const q = build(hlDelete('h-from-last-week'));
    expect(q.ops).toHaveLength(1);
  });

  it('leaves unrelated highlights alone', () => {
    const q = build(hlCreate('h1'), hlCreate('h2'), hlDelete('h1'));
    expect(q.ops.map((o) => o.clientId)).toEqual(['c1']);
  });

  it('never coalesces two distinct creates — each is a real highlight', () => {
    const q = build(hlCreate('h1'), hlCreate('h2'));
    expect(q.ops).toHaveLength(2);
  });
});

describe('coalescing bookmarks', () => {
  // The op carries an absolute value, not a flip — a flip replayed
  // twice lands on the wrong state.
  it('keeps the last value per page', () => {
    const q = build(
      bookmark('b1', 'p1', true),
      bookmark('b1', 'p1', false),
      bookmark('b1', 'p1', true),
    );
    expect(q.ops).toHaveLength(1);
    expect((q.ops[0] as { bookmarked: boolean }).bookmarked).toBe(true);
  });

  it('separates pages', () => {
    const q = build(bookmark('b1', 'p1', true), bookmark('b1', 'p2', true));
    expect(q.ops).toHaveLength(2);
  });
});

describe('retry and backoff', () => {
  it('backs off exponentially and caps at five minutes', () => {
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(3)).toBe(8000);
    expect(backoffMs(50)).toBe(300_000);
  });

  it('records the failure and schedules the retry', () => {
    const q = failed(build(hlCreate('h1')), 'c0', 'timeout', 5000);
    expect(q.ops[0]!.attempts).toBe(1);
    expect(q.ops[0]!.nextAttemptAt).toBe(6000);
    expect(q.ops[0]!.lastError).toBe('timeout');
  });

  it('stops attempting after MAX_ATTEMPTS and reports the op as dead', () => {
    let q = build(hlCreate('h1'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = failed(q, 'c0', 'nope', 0);
    expect(due(q, Number.MAX_SAFE_INTEGER)).toHaveLength(0);
    expect(dead(q)).toHaveLength(1);
  });

  // Dropping a dead op loses a user's highlight with no trace. Keeping
  // it means the UI can say so.
  it('keeps dead ops in the queue rather than discarding them', () => {
    let q = build(hlCreate('h1'));
    for (let i = 0; i < MAX_ATTEMPTS; i++) q = failed(q, 'c0', 'nope', 0);
    expect(q.ops).toHaveLength(1);
  });

  it('removes an op the server accepted', () => {
    const q = succeeded(build(hlCreate('h1'), hlCreate('h2')), 'c0');
    expect(q.ops.map((o) => o.clientId)).toEqual(['c1']);
  });
});

describe('persistence', () => {
  it('round-trips', () => {
    const q = build(progress('b1', 7), hlCreate('h1'));
    expect(deserialize(serialize(q)).ops).toHaveLength(2);
  });

  // A corrupt queue must not take reading offline with it. Losing
  // pending writes is bad; refusing to start the app is worse.
  it('survives garbage without throwing', () => {
    expect(deserialize('not json').ops).toHaveLength(0);
    expect(deserialize('{"version":99}').ops).toHaveLength(0);
    expect(deserialize(null).ops).toHaveLength(0);
    expect(deserialize('{"version":1,"ops":[{"junk":true}]}').ops).toHaveLength(0);
  });

  it('keeps the valid ops out of a partly corrupt queue', () => {
    const mixed = '{"version":1,"ops":[{"junk":true},{"clientId":"c0","kind":"progress.set"}]}';
    expect(deserialize(mixed).ops).toHaveLength(1);
  });
});

describe('idempotency', () => {
  // The whole point of a client id: after a timeout, "did that land?"
  // has no answer, so the retry must be safe either way.
  it('gives every op a stable clientId that survives serialisation', () => {
    const q = build(hlCreate('h1'));
    const replayed = deserialize(serialize(q));
    expect(replayed.ops[0]!.clientId).toBe('c0');
  });

  it('reuses the highlight id as the row key so a retry cannot duplicate', () => {
    const q = build(hlCreate('h-abc'));
    expect((q.ops[0] as { highlightId: string }).highlightId).toBe('h-abc');
  });
});

describe('a realistic offline session', () => {
  it('collapses a flight to the writes that still matter', () => {
    let q = emptyQueue();
    let n = 0;
    const next = () => `c${n++}`;

    // Read 120 pages.
    for (let p = 1; p <= 120; p++) q = enqueue(q, progress('b1', p), next());
    // Highlight three passages, then think better of one.
    q = enqueue(q, hlCreate('h1'), next());
    q = enqueue(q, hlCreate('h2'), next());
    q = enqueue(q, hlCreate('h3'), next());
    q = enqueue(q, hlDelete('h2'), next());
    // Bookmark a page, then unbookmark it.
    q = enqueue(q, bookmark('b1', 'p40', true), next());
    q = enqueue(q, bookmark('b1', 'p40', false), next());

    // 126 operations become 4: one progress, two surviving highlights,
    // one bookmark carrying its final value.
    expect(q.ops).toHaveLength(4);
    expect(q.ops.map((o) => o.kind)).toEqual([
      'progress.set', 'highlight.create', 'highlight.create', 'bookmark.toggle',
    ]);
    expect((q.ops[0] as { pageIndex: number }).pageIndex).toBe(120);
    expect((q.ops[3] as { bookmarked: boolean }).bookmarked).toBe(false);
  });
});
