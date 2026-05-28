import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage-backed TTL cache for Discover shelves, with a synchronous
 * in-memory mirror.
 *
 * Why two layers:
 *   - **AsyncStorage** persists across app launches. Stale-while-revalidate
 *     means a returning user sees instant content while we refetch.
 *   - **Memory mirror** eliminates the 5–50 ms AsyncStorage round-trip on
 *     intra-session navigation. Tapping a category chip can render its
 *     shelf synchronously (no loading flash) when the prewarm already
 *     populated the mirror.
 *
 * Gutendex shelves change on the order of weeks, so a 30-minute TTL is
 * comfortably aggressive. JSON-serialised payloads — trade tiny
 * serialise/parse cost for the simplicity of using AsyncStorage directly
 * without a binary format.
 *
 * Generic in T so callers can store whatever shape suits them — the
 * Discover screen stores its own (screen-shape) `DiscoverBook` type
 * which has render-friendly fields (coverColor, etc.) baked in.
 */

const KEY_PREFIX = 'bookflow:discover:';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

type CachePayload<T> = {
  ts: number;
  books: T[];
};

// In-memory mirror keyed by the same cache key as AsyncStorage. We
// keep the raw payload (with `ts`) so the TTL check is consistent
// across both layers and we can drop the entry from memory when it
// expires without re-reading disk.
const memoryMirror = new Map<string, CachePayload<unknown>>();

// One-shot hydration latch. Set on the first successful hydrate so
// repeat calls are no-ops. The "started" promise is shared between
// concurrent callers so we don't race AsyncStorage.getAllKeys.
let hydratePromise: Promise<void> | null = null;

/**
 * Read a cached shelf. Returns null on cache miss, expired entries, or
 * any read error (corrupt JSON, AsyncStorage failure). Callers should
 * treat null as "fetch fresh". Also populates the memory mirror so
 * later `peekCachedShelf` calls land synchronously.
 */
export async function getCachedShelf<T>(
  key: string,
  maxAgeMs: number = DEFAULT_TTL_MS,
): Promise<T[] | null> {
  // Memory hit short-circuits the AsyncStorage read entirely.
  const mem = memoryMirror.get(key) as CachePayload<T> | undefined;
  if (mem && Date.now() - mem.ts <= maxAgeMs) {
    return mem.books;
  }
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload<T>;
    if (
      typeof parsed?.ts !== 'number' ||
      !Array.isArray(parsed.books) ||
      Date.now() - parsed.ts > maxAgeMs
    ) {
      // Stale on disk too — drop the memory mirror if it had this
      // key so the next sync peek doesn't return stale data either.
      memoryMirror.delete(key);
      return null;
    }
    memoryMirror.set(key, parsed);
    return parsed.books;
  } catch {
    return null;
  }
}

/**
 * Synchronous cache peek. Returns the cached books if a fresh entry
 * exists in the memory mirror; null otherwise. Used in `useState`
 * lazy initialisers so a warm shelf renders on the very first paint
 * without a `categoryLoading` flash.
 *
 * Note: only checks memory. To prime memory from disk, call
 * `hydrateShelfCache()` once on screen mount or use `getCachedShelf`
 * (async) which populates memory as a side effect.
 */
export function peekCachedShelf<T>(
  key: string,
  maxAgeMs: number = DEFAULT_TTL_MS,
): T[] | null {
  const mem = memoryMirror.get(key) as CachePayload<T> | undefined;
  if (!mem) return null;
  if (Date.now() - mem.ts > maxAgeMs) {
    memoryMirror.delete(key);
    return null;
  }
  return mem.books;
}

/**
 * Write a shelf to cache. Best-effort to disk; the memory mirror is
 * updated synchronously so subsequent `peekCachedShelf` calls in the
 * same session see the new data immediately.
 */
export async function setCachedShelf<T>(
  key: string,
  books: T[],
): Promise<void> {
  const payload: CachePayload<T> = { ts: Date.now(), books };
  memoryMirror.set(key, payload);
  try {
    await AsyncStorage.setItem(KEY_PREFIX + key, JSON.stringify(payload));
  } catch {
    // ignore — memory mirror still serves the current session.
  }
}

/**
 * Read every `bookflow:discover:*` key from AsyncStorage into the
 * memory mirror in one shot. Designed to be called once on Discover
 * screen mount so the first category tap has a synchronous cache to
 * peek at. Idempotent — concurrent callers share the same in-flight
 * promise.
 */
export async function hydrateShelfCache(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const discoverKeys = allKeys.filter((k) => k.startsWith(KEY_PREFIX));
      if (discoverKeys.length === 0) return;
      const pairs = await AsyncStorage.multiGet(discoverKeys);
      for (const [fullKey, raw] of pairs) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as CachePayload<unknown>;
          if (
            typeof parsed?.ts !== 'number' ||
            !Array.isArray(parsed.books)
          ) {
            continue;
          }
          // TTL filtering happens at read time (peek / get) — store
          // even slightly-old entries so a same-session SWR refresh
          // can still render them as the "render cache first" step.
          const shortKey = fullKey.slice(KEY_PREFIX.length);
          memoryMirror.set(shortKey, parsed);
        } catch {
          // Skip corrupt entries — they'll be overwritten on next write.
        }
      }
    } catch {
      // Failure here just means the in-memory cache stays empty;
      // categories will still load from network as before.
    }
  })();
  return hydratePromise;
}

/**
 * Drop everything in the memory mirror. Called by the app-level
 * sign-out flow so the next user's Discover screen doesn't peek at
 * the previous user's cached shelves. AsyncStorage is left alone
 * (the keys don't carry user-specific data; they're public catalog).
 */
export function clearShelfMemoryCache(): void {
  memoryMirror.clear();
  hydratePromise = null;
}
