/**
 * Offline write queue — persistence, draining and the public API.
 *
 * Three pieces meet here:
 *   `@bookflow/shared/offline-queue`  decides (coalesce, order, backoff)
 *   `./executor`                      performs (Supabase)
 *   this file                         stores, schedules and exposes
 *
 * Storage is **AsyncStorage, not MMKV**, deliberately. The brief names
 * MMKV, and it is the right call for the persisted *query cache* —
 * that is a hot path read on every launch, where synchronous access
 * earns its keep. This queue is written once per user action and read
 * once per drain. AsyncStorage is already a dependency and MMKV is not,
 * so adopting a new native module here would be paying a migration for
 * nothing. MMKV arrives with the query cache.
 *
 * Writes are serialised through `saving` so two rapid actions cannot
 * interleave a read-modify-write and lose one of them.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type OpBody,
  type Queue,
  type QueuedOp,
  dead,
  deserialize,
  due,
  emptyQueue,
  enqueue as enqueueOp,
  failed,
  serialize,
  succeeded,
} from '@bookflow/shared/src';
import { execute } from './executor';

const STORAGE_KEY = 'bookflow.offline-queue.v1';

let queue: Queue = emptyQueue();
let loaded = false;
let saving: Promise<void> = Promise.resolve();
let draining = false;

const listeners = new Set<(q: Queue) => void>();

function notify() {
  for (const l of listeners) l(queue);
}

/** Subscribe to queue changes — for a "3 changes not yet saved" chip. */
export function subscribe(fn: (q: Queue) => void): () => void {
  listeners.add(fn);
  fn(queue);
  return () => listeners.delete(fn);
}

async function load(): Promise<void> {
  if (loaded) return;
  try {
    queue = deserialize(await AsyncStorage.getItem(STORAGE_KEY));
  } catch (err) {
    // A storage read that throws must not stop the app starting; the
    // cost is pending writes, and `deserialize` already treats garbage
    // as an empty queue for the same reason.
    console.warn('[offline-queue] load failed:', err);
    queue = emptyQueue();
  }
  loaded = true;
  notify();
}

function persist(): Promise<void> {
  // Chained rather than fired: concurrent writes would otherwise race
  // and the loser's operation would vanish.
  saving = saving.then(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, serialize(queue));
    } catch (err) {
      console.warn('[offline-queue] persist failed:', err);
    }
  });
  return saving;
}

/**
 * Queue a write.
 *
 * Returns once the op is durable, so a caller that optimistically
 * updated the UI knows the intent survives a crash.
 */
export async function enqueue(body: OpBody, clientId: string): Promise<void> {
  await load();
  queue = enqueueOp(queue, body, clientId);
  notify();
  await persist();
  void drain();
}

/**
 * Attempt every due operation, in order.
 *
 * Stops at the first retryable failure. Continuing past one would
 * reorder the queue — a highlight delete must not overtake its create —
 * and the next failure is almost certainly the same outage anyway.
 */
export async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    await load();
    for (const op of due(queue, Date.now())) {
      const result = await execute(op);
      if (result.ok) {
        queue = succeeded(queue, op.clientId);
      } else if (result.retry) {
        queue = failed(queue, op.clientId, result.error, Date.now());
        break;
      } else {
        // Permanent. Exhaust its attempts in one go so it lands in
        // `dead()` and stops blocking the ops behind it.
        queue = failed(queue, op.clientId, result.error, Date.now());
        while (!dead(queue).some((o) => o.clientId === op.clientId)) {
          queue = failed(queue, op.clientId, result.error, Date.now());
        }
      }
      notify();
    }
    await persist();
  } finally {
    draining = false;
  }
}

/** Pending operations, for UI that wants to say so. */
export function pending(): QueuedOp[] {
  return queue.ops.filter((o) => !dead(queue).includes(o));
}

/** Operations that gave up. Surfaced rather than dropped. */
export function deadLetters(): QueuedOp[] {
  return dead(queue);
}

/** Forget a dead operation the user has acknowledged. */
export async function discard(clientId: string): Promise<void> {
  queue = succeeded(queue, clientId);
  notify();
  await persist();
}

/**
 * Clear everything. Called on sign-out.
 *
 * Pending writes belong to the outgoing user, and the executor refuses
 * to replay them without a session — but leaving them on disk means the
 * next person to sign in on this device carries a stranger's queue.
 */
export async function reset(): Promise<void> {
  queue = emptyQueue();
  loaded = true;
  notify();
  await persist();
}
