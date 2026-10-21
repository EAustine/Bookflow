import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Registry of books downloaded for offline listening + reading.
 *
 * This store is a fast, persisted INDEX over what's on disk — it powers
 * the Library "downloaded" badge, the download progress row, and the
 * Settings storage screen without hitting the filesystem on every render.
 * The actual files (under documentDirectory, see `audioDownloads.ts`) are
 * the ultimate source of truth; playback always re-checks file existence
 * via `getLocalAudio` rather than trusting this index. If the two ever
 * drift (e.g. the user clears app storage from Android settings), the
 * worst case is a stale badge that self-corrects on the next download.
 *
 * Per-book detail (which exact pages, durations) lives in a per-book
 * `manifest.json` on disk, NOT here — keeping this store book-level keeps
 * AsyncStorage small even for 1500-page books.
 */

export type DownloadStatus =
  /** Actively pulling audio + text to disk. */
  | 'downloading'
  /** Every page processed; book is fully available offline. */
  | 'complete'
  /** A page failed (network drop, server error) — partial files remain,
   * re-tapping download resumes from where it stopped. */
  | 'error';

export type BookDownload = {
  bookId: string;
  title: string;
  author: string;
  /** Voice the audio was downloaded with. Offline playback is pinned to
   * this voice — a different voice would need its own download. */
  voiceId: string;
  totalPages: number;
  /** Pages processed so far (includes short pages that legitimately have
   * no audio, so this reaches `totalPages` on success). */
  completedPages: number;
  /** Bytes on disk for this book (audio + alignment + text). */
  bytes: number;
  /** Whether page text was cached for offline reading / read-along. */
  textCached: boolean;
  status: DownloadStatus;
  /** Friendly error message when `status === 'error'`. */
  error?: string;
  /** Epoch ms of the last update — for sorting the Settings list. */
  updatedAt: number;
};

function emptyEntry(bookId: string): BookDownload {
  return {
    bookId,
    title: '',
    author: '',
    voiceId: '',
    totalPages: 0,
    completedPages: 0,
    bytes: 0,
    textCached: false,
    status: 'downloading',
    updatedAt: 0,
  };
}

type DownloadsStore = {
  downloads: Record<string, BookDownload>;
  /** Create-or-merge a book's download record. */
  upsert: (bookId: string, partial: Partial<BookDownload>) => void;
  /** Drop a book's record (after the files are deleted). */
  remove: (bookId: string) => void;
  /** Drop every record (after wiping all files). */
  clearAll: () => void;
};

export const useDownloadsStore = create<DownloadsStore>()(
  persist(
    (set) => ({
      downloads: {},
      upsert: (bookId, partial) =>
        set((s) => {
          const prev = s.downloads[bookId] ?? emptyEntry(bookId);
          return {
            downloads: {
              ...s.downloads,
              [bookId]: { ...prev, ...partial, bookId },
            },
          };
        }),
      remove: (bookId) =>
        set((s) => {
          if (!s.downloads[bookId]) return s;
          const next = { ...s.downloads };
          delete next[bookId];
          return { downloads: next };
        }),
      clearAll: () => set({ downloads: {} }),
    }),
    {
      name: 'bookflow-downloads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ downloads: s.downloads }),
      // Reconcile interrupted downloads. If the app was killed mid-
      // download, the persisted status is stuck on 'downloading' but
      // nothing is in-flight — flip those to 'error' so the UI offers
      // a resume affordance instead of a forever-spinner. (Re-tapping
      // download skips already-present pages, so it resumes cleanly.)
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        let changed = false;
        const downloads = { ...state.downloads };
        for (const id of Object.keys(downloads)) {
          const entry = downloads[id];
          if (entry && entry.status === 'downloading') {
            downloads[id] = {
              ...entry,
              status: 'error',
              error: 'Download interrupted',
            };
            changed = true;
          }
        }
        if (changed) state.downloads = downloads;
      },
    },
  ),
);

/** Non-hook accessor for use outside React (e.g. the download orchestrator). */
export function getDownload(bookId: string): BookDownload | undefined {
  return useDownloadsStore.getState().downloads[bookId];
}
