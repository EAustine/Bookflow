import {
  download as downloadToCache,
  ensureDir,
  exists,
  readText,
  readTextAt,
  remove,
  sizeOf,
  uriFor,
  writeText,
  type CachePath,
} from '~/platform/fileCache';
// Deliberate and safe: see the cycle note in audioDownloads.ts. Both sides
// are hoisted function declarations called only at runtime, so neither is
// read at module-eval time. Contrast the feature-barrel cycle, where
// `export *` IS evaluated on load and resolved to undefined.
// eslint-disable-next-line import/no-cycle
import { fetchPageAudio, type AudioVoice } from './aiAudio';
import { useDownloadsStore } from '~/stores/downloadsStore';
import { fireDownloadCompleteNotification } from '~/lib/notifications';
import type { Book } from '~/types/book';
import type { PageRow } from '~/features/reader';
import { fetchAllPageRows } from '~/core/pageRows';

/**
 * Offline audio + text downloads.
 *
 * The server already persists every narrated page's MP3 + alignment JSON
 * durably in Supabase Storage; "downloading" a book just pulls those same
 * files (plus the page text) to the device's document directory so the
 * Listen + Reader surfaces can run fully offline.
 *
 * On-disk layout (under `Paths.document`):
 *
 *   bookflow-offline/{bookId}/
 *     a_{pageIndex}_{voiceId}.mp3      ← narration audio
 *     a_{pageIndex}_{voiceId}.json     ← ElevenLabs alignment sidecar (optional)
 *     pages.json                       ← full page text (for offline reading + read-along)
 *     manifest.json                    ← per-book summary (voice, counts, timestamp)
 *
 * Module responsibilities:
 *   - Path helpers + synchronous local-file lookups (used by the audio
 *     playback hot-path and the reader's offline text fallback).
 *   - A cancelable per-book download orchestrator that reports progress
 *     into `downloadsStore`.
 *
 * Cycle note: this module imports `fetchPageAudio` from `aiAudio`, and
 * `aiAudio` imports `getLocalAudio` from here. Both are hoisted function
 * declarations only ever called at runtime (never at module-eval time),
 * so the ES-module cycle resolves cleanly. The `PageRow`/`Book` imports
 * are type-only (erased at compile), so they add no runtime edge.
 */

const ROOT = 'bookflow-offline';

// ── Path helpers ──────────────────────────────────────────────────────────

const rootDir: CachePath = [ROOT];

const bookDir = (bookId: string): CachePath => [ROOT, bookId];

const audioFileFor = (
  bookId: string,
  pageIndex: number,
  voiceId: string,
): CachePath => [ROOT, bookId, `a_${pageIndex}_${voiceId}.mp3`];

const alignFileFor = (
  bookId: string,
  pageIndex: number,
  voiceId: string,
): CachePath => [ROOT, bookId, `a_${pageIndex}_${voiceId}.json`];

const textFileFor = (bookId: string): CachePath => [ROOT, bookId, 'pages.json'];

const manifestFileFor = (bookId: string): CachePath => [
  ROOT,
  bookId,
  'manifest.json',
];

// ── Local lookups (playback + reader hot-paths) ─────────────────────────────

export type LocalAudio = {
  /** `file://…` URI of the downloaded MP3. */
  audioUri: string;
  /** `file://…` URI of the alignment JSON, or null if not downloaded. */
  alignmentUri: string | null;
};

/**
 * Return the local audio for a page if it's been downloaded with this
 * voice, else null. Synchronous (uses the File API's `exists`/`uri`
 * getters) so the audio load effect can branch local-vs-stream without
 * an extra await on the hot path.
 */
export async function getLocalAudio(
  bookId: string,
  pageIndex: number,
  voiceId: string,
): Promise<LocalAudio | null> {
  const audioUri = await uriFor(audioFileFor(bookId, pageIndex, voiceId));
  if (!audioUri) return null;
  return {
    audioUri,
    alignmentUri: await uriFor(alignFileFor(bookId, pageIndex, voiceId)),
  };
}

/**
 * Read + parse a local JSON file (e.g. an alignment sidecar referenced by
 * a `file://` URI). Returns null on any failure. Used by the audio
 * session to load alignment data offline, where `fetch('file://…')` is
 * unreliable across platforms.
 */
export async function readJsonFile<T = unknown>(fileUri: string): Promise<T | null> {
  try {
    const text = await readTextAt(fileUri);
    return text === null ? null : (JSON.parse(text) as T);
  } catch {
    return null;
  }
}

/**
 * Return the cached page rows for a book if its text was downloaded, else
 * null. Powers the reader's offline fallback in `useBookChapters`.
 */
export async function getCachedPages(bookId: string): Promise<PageRow[] | null> {
  try {
    const text = await readText(textFileFor(bookId));
    if (text === null) return null;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as PageRow[]) : null;
  } catch {
    return null;
  }
}

// ── Sizes ───────────────────────────────────────────────────────────────────

/** Bytes on disk for a single book's downloads (0 if none). */
export async function bookDownloadBytes(bookId: string): Promise<number> {
  return sizeOf(bookDir(bookId));
}

/** Total bytes across all offline downloads (0 if none). */
export async function totalDownloadBytes(): Promise<number> {
  return sizeOf(rootDir);
}

/** Human-readable byte size, e.g. "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

// ── Deletion ─────────────────────────────────────────────────────────────────

/** Delete one book's downloads (audio + text) and drop its store record. */
export async function deleteBookDownload(bookId: string): Promise<void> {
  cancelDownload(bookId);
  // `remove` is already silent on a missing path or no access, and the
  // record is cleared either way.
  await remove(bookDir(bookId));
  useDownloadsStore.getState().remove(bookId);
}

/** Delete every offline download and clear the registry. */
export async function deleteAllDownloads(): Promise<void> {
  // Abort anything in flight first.
  for (const id of Array.from(inFlight.keys())) cancelDownload(id);
  await remove(rootDir);
  useDownloadsStore.getState().clearAll();
}

// ── Download orchestrator ────────────────────────────────────────────────────

/** Books with an active download, keyed by id → its abort controller. */
const inFlight = new Map<string, AbortController>();

/** Concurrent page downloads. Low, to avoid hammering the TTS backend
 * (each uncached page triggers an ElevenLabs generation server-side). */
const CONCURRENCY = 5;

export function isDownloading(bookId: string): boolean {
  return inFlight.has(bookId);
}

/** Abort an in-flight download. Partial files remain on disk so a later
 * re-download resumes (already-present pages are skipped). */
export function cancelDownload(bookId: string): void {
  const ctrl = inFlight.get(bookId);
  if (ctrl) {
    ctrl.abort();
    inFlight.delete(bookId);
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetch every page row (with text) for offline caching. Mirrors the
 * reader's `useAllPagesContent` query but as a plain async call. */
async function fetchAllPages(bookId: string): Promise<PageRow[]> {
  if (!UUID_RE.test(bookId)) return [];
  const { data, error } = await fetchAllPageRows<PageRow>(
    bookId,
    'id, book_id, page_index, pdf_page_number, title, content, html_content, word_count',
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as PageRow[];
}

/**
 * Download one page's audio (+ alignment) to disk. Returns the bytes
 * written. Short/empty pages that legitimately have no audio resolve to
 * 0 bytes rather than failing the whole book.
 */
async function downloadOnePage(
  bookId: string,
  pageIndex: number,
  voiceId: AudioVoice,
  signal: AbortSignal,
): Promise<number> {
  // Resume: skip pages already on disk.
  const audioPath = audioFileFor(bookId, pageIndex, voiceId);
  if (await exists(audioPath)) return sizeOf(audioPath);

  const res = await fetchPageAudio({ bookId, pageIndex, voiceId });
  if (signal.aborted) return 0;
  if (!res.ok) {
    // Pages with too little text (front matter, blank spine entries) have
    // no narration — that's expected, not a failure. Skip them.
    if (res.error === 'page_too_short' || res.error === 'page_not_found') {
      return 0;
    }
    throw new Error(res.message || res.error || 'download_failed');
  }

  const bytes = await downloadToCache(res.data.url, audioPath);
  if (res.data.alignmentUrl) {
    try {
      await downloadToCache(
        res.data.alignmentUrl,
        alignFileFor(bookId, pageIndex, voiceId),
      );
    } catch {
      // Alignment is optional (read-along highlight only); audio still works.
    }
  }
  return bytes;
}

/**
 * Download a whole book for offline use: page text first (so reading works
 * offline immediately), then every page's audio with bounded concurrency.
 * Reports progress into `downloadsStore`. Safe to call fire-and-forget;
 * cancelable via `cancelDownload(bookId)`. Resumable — re-calling after an
 * error or cancel skips pages already on disk.
 */
export async function downloadBook(book: Book, voiceId: AudioVoice): Promise<void> {
  const bookId = book.id;
  if (inFlight.has(bookId)) return; // already downloading

  const total = Math.max(0, book.totalPages || 0);
  const store = useDownloadsStore.getState();

  if (!UUID_RE.test(bookId) || total === 0) {
    store.upsert(bookId, {
      title: book.title,
      author: book.author ?? '',
      voiceId,
      totalPages: total,
      status: 'error',
      error: "This book isn't ready to download yet.",
      updatedAt: Date.now(),
    });
    return;
  }

  const ctrl = new AbortController();
  inFlight.set(bookId, ctrl);
  store.upsert(bookId, {
    title: book.title,
    author: book.author ?? '',
    voiceId,
    totalPages: total,
    completedPages: 0,
    bytes: await bookDownloadBytes(bookId),
    textCached: false,
    status: 'downloading',
    error: undefined,
    updatedAt: Date.now(),
  });

  try {
    await ensureDir(bookDir(bookId));

    // 1. Cache page text so reading + read-along work offline.
    let textCached = false;
    try {
      const pages = await fetchAllPages(bookId);
      if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (pages.length) {
        await writeText(textFileFor(bookId), JSON.stringify(pages));
        textCached = true;
        useDownloadsStore.getState().upsert(bookId, { textCached: true });
      }
    } catch (err) {
      if (ctrl.signal.aborted) throw err;
      // Non-fatal: audio can still download; reading offline just won't
      // have text. Continue.
      console.warn('[audioDownloads] text cache failed:', err);
    }

    // 2. Download audio per page with bounded concurrency.
    let completed = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < total) {
        if (ctrl.signal.aborted) return;
        const i = cursor++;
        await downloadOnePage(bookId, i, voiceId, ctrl.signal);
        completed++;
        // Throttle store writes: every page is cheap enough (one shallow
        // object merge) and the UI wants live progress.
        useDownloadsStore.getState().upsert(bookId, {
          completedPages: completed,
          updatedAt: Date.now(),
        });
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
    );
    if (ctrl.signal.aborted) throw new DOMException('aborted', 'AbortError');

    // 3. Manifest + mark complete.
    const bytes = await bookDownloadBytes(bookId);
    try {
      await writeText(
        manifestFileFor(bookId),
        JSON.stringify({
          bookId,
          voiceId,
          totalPages: total,
          completedPages: completed,
          textCached,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // Manifest is advisory; the store record is the real summary.
    }
    useDownloadsStore.getState().upsert(bookId, {
      status: 'complete',
      completedPages: completed,
      bytes,
      updatedAt: Date.now(),
    });
    // Let the user know it's ready to listen offline (best-effort).
    void fireDownloadCompleteNotification({ bookId, title: book.title });
  } catch (err) {
    const aborted =
      ctrl.signal.aborted ||
      (err instanceof Error && /abort/i.test(err.name + err.message));
    if (aborted) {
      // User cancelled — clean up partial files + record entirely.
      deleteBookDownload(bookId);
      return;
    }
    const message =
      err instanceof Error ? err.message : 'Download failed. Try again.';
    let friendly: string;
    if (
      /quota|credit|insufficient|tts_failed|tts_empty|narration|429|server_misconfigured/i.test(
        message,
      )
    ) {
      // ElevenLabs / TTS capacity limit — surface a clean message rather
      // than the raw provider JSON.
      friendly =
        'Audio is temporarily unavailable (voice service limit). Try again later.';
    } else if (/network|fetch|timeout|abort|connection/i.test(message)) {
      friendly = 'Download failed. Check your connection and try again.';
    } else {
      friendly = 'Download failed. Try again.';
    }
    useDownloadsStore.getState().upsert(bookId, {
      status: 'error',
      error: friendly,
      bytes: await bookDownloadBytes(bookId),
      updatedAt: Date.now(),
    });
  } finally {
    inFlight.delete(bookId);
  }
}
