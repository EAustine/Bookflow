import { supabase } from '~/lib/supabase';

/**
 * Module-level signed-URL cache for book covers stored in the private
 * `books` bucket. Centralised here (instead of per-screen) so that any
 * surface showing a cover — Library, Listen history, Now Playing, etc.
 * — shares the cache and avoids re-signing the same path on every
 * render or screen transition.
 *
 * The 60-minute TTL matches what Supabase returns from `createSignedUrl`;
 * we refresh at 50 minutes so the UI never holds a URL that's about to
 * expire mid-render.
 */

const SIGNED_URL_TTL_MS = 60 * 60 * 1000;
const SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;
// Cap so the Map can't grow without bound on accounts with very
// large libraries. Insertion order is the LRU; the oldest entry is
// evicted when we cross the cap.
const SIGNED_URL_MAX_ENTRIES = 500;

const signedUrlCache = new Map<string, { url: string; signedAt: number }>();

function rememberSignedUrl(path: string, url: string): void {
  if (signedUrlCache.has(path)) signedUrlCache.delete(path);
  signedUrlCache.set(path, { url, signedAt: Date.now() });
  if (signedUrlCache.size > SIGNED_URL_MAX_ENTRIES) {
    const oldest = signedUrlCache.keys().next().value;
    if (oldest !== undefined) signedUrlCache.delete(oldest);
  }
}

/**
 * Drop every cached signed URL. Called from the app-level sign-out
 * flow to purge the previous user's URLs from memory before the
 * next user signs in — without this, the next user could (briefly)
 * see / fetch covers under the previous user's storage prefix on
 * any in-flight references.
 */
export function clearBookCoverCache(): void {
  signedUrlCache.clear();
}

/**
 * Resolve a storage path under the `books` bucket to a signed URL,
 * hitting the cache when possible. Returns null if the path can't
 * be signed (deleted file, permission error, transient API issue).
 */
export async function resolveCoverUrl(path: string): Promise<string | null> {
  const cached = signedUrlCache.get(path);
  if (cached && Date.now() - cached.signedAt < SIGNED_URL_REFRESH_MS) {
    // Touch — bump to the end of LRU order so recently-viewed
    // covers aren't evicted by a cold-cache cover refresh.
    signedUrlCache.delete(path);
    signedUrlCache.set(path, cached);
    return cached.url;
  }
  // Wrap the Supabase Storage call in try/catch so a network
  // failure (offline / DNS / TLS) returns `null` instead of
  // rejecting. The previous shape leaked `TypeError: Network
  // request failed` into React Native's LogBox toast every time a
  // cover-loading effect fired without a `.catch` upstream
  // (history rows, audio session, chapter images). Returning null
  // is already the documented "no cover" outcome — every call
  // site falls back to a colored placeholder — so making offline
  // an in-band null is the correct unification.
  try {
    const { data, error } = await supabase.storage
      .from('books')
      .createSignedUrl(path, SIGNED_URL_TTL_MS / 1000);
    if (error || !data?.signedUrl) {
      return null;
    }
    rememberSignedUrl(path, data.signedUrl);
    return data.signedUrl;
  } catch (err) {
    console.warn('[bookCovers] resolveCoverUrl threw:', err);
    return null;
  }
}

/** Synchronous cache peek — useful for `useState` lazy init so a
 *  cover that's already loaded paints on first render. */
export function peekCachedCoverUrl(path: string): string | null {
  return signedUrlCache.get(path)?.url ?? null;
}
