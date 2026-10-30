/**
 * The app's own on-disk store — the §8 `fileCache` adapter over
 * `expo-file-system`. Downloaded narration, alignment sidecars, cached
 * page text and per-book manifests all live here.
 *
 * Distinct from `files`, which is about documents the *user* chose and
 * hands back a uri to read once. This is storage the app owns, writes,
 * measures and deletes, and which has to survive a relaunch.
 *
 * ## Paths are segments, not strings
 *
 * A `CachePath` is `['bookflow-offline', bookId, 'a_3_rachel.mp3']`,
 * resolved against the platform's private document location. No caller
 * builds a path by concatenation, so no caller can accidentally escape
 * the root or depend on a separator — which matters because the web
 * implementation has no separator at all, only keys.
 *
 * ## Everything is async, including what native could do synchronously
 *
 * `expo-file-system`'s class API answers `exists`, `size`, `uri`,
 * `write` and `delete` synchronously, and this adapter wraps all five
 * in promises anyway. That is deliberate. §8's web implementation is
 * the Cache API or IndexedDB, both asynchronous to the core, so a
 * synchronous signature here would be a contract only native can
 * satisfy — an adapter that cannot be implemented is not an adapter.
 *
 * It costs four call sites an `await` today. It is the difference
 * between web offline support being a later milestone's work and being
 * a later milestone's rewrite of everything that touches storage.
 */

import { Directory, File, Paths } from 'expo-file-system';

/** Path segments under the app's private document directory. */
export type CachePath = readonly string[];

function fileAt(path: CachePath): File {
  return new File(Paths.document, ...path);
}

function dirAt(path: CachePath): Directory {
  return new Directory(Paths.document, ...path);
}

/** Create a directory and any missing parents. Silent if it exists. */
export async function ensureDir(path: CachePath): Promise<void> {
  dirAt(path).create({ intermediates: true, idempotent: true });
}

export async function exists(path: CachePath): Promise<boolean> {
  try {
    return fileAt(path).exists;
  } catch {
    return false;
  }
}

/**
 * A uri a media player can open, or null when nothing is stored there.
 * Null rather than a uri-that-404s, because the one caller is choosing
 * between local playback and a signed streaming URL and needs a
 * straight answer.
 */
export async function uriFor(path: CachePath): Promise<string | null> {
  try {
    const file = fileAt(path);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Bytes stored at `path`, recursively for a directory. Zero when
 * absent or unreadable: every caller is rendering a storage figure,
 * and "0 B" is the right thing to show for a thing that is not there.
 */
export async function sizeOf(path: CachePath): Promise<number> {
  try {
    const dir = dirAt(path);
    if (dir.exists) return dir.size ?? 0;
    const file = fileAt(path);
    return file.exists ? (file.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** Contents at `path`, or null if absent or unreadable. */
export async function readText(path: CachePath): Promise<string | null> {
  try {
    const file = fileAt(path);
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

/**
 * Contents at a uri this adapter previously handed out — the alignment
 * sidecar, which travels as a uri rather than a path because it is
 * discovered alongside the audio.
 *
 * Exists because `fetch('file://…')` is unreliable across platforms,
 * which is the whole reason offline alignment reads go through the
 * file system rather than the network stack.
 */
export async function readTextAt(uri: string): Promise<string | null> {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return await file.text();
  } catch {
    return null;
  }
}

export async function writeText(
  path: CachePath,
  contents: string,
): Promise<void> {
  fileAt(path).write(contents);
}

/** Delete a file or directory tree. Silent when already gone. */
export async function remove(path: CachePath): Promise<void> {
  try {
    const dir = dirAt(path);
    if (dir.exists) {
      dir.delete();
      return;
    }
    const file = fileAt(path);
    if (file.exists) file.delete();
  } catch {
    // Already gone, or no access. Callers clear their own records
    // regardless, so a failure here must not stop them.
  }
}

/**
 * Fetch `url` straight to `path`, returning the bytes stored (0 if the
 * download produced nothing).
 *
 * Streams to disk rather than through memory, which is the point: a
 * chapter of narration is tens of megabytes and Ama's phone should
 * never hold one as a Blob.
 */
export async function download(
  url: string,
  path: CachePath,
): Promise<number> {
  await File.downloadFileAsync(url, fileAt(path), { idempotent: true });
  const file = fileAt(path);
  return file.exists ? (file.size ?? 0) : 0;
}
