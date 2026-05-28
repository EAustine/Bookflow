import { useCallback, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '~/lib/supabase';

/**
 * End-to-end book upload orchestrator.
 *
 *   pick → validate → insert row → upload to Storage (with progress) →
 *   invoke `process-book` Edge Function → poll books.processing_status until
 *   it reaches a terminal state ('ready' | 'partial' | 'failed[:reason]').
 *
 * The book row is created up-front in `processing` state so the file appears
 * in the user's library immediately and any downstream UI can subscribe to
 * it. Failures after the row is created leave it in a `failed:*` state — the
 * library can render a retry/remove affordance off that.
 *
 * Real upload progress is wired via XMLHttpRequest's upload.onprogress (the
 * supabase-js .upload() helper goes through fetch, which doesn't surface
 * progress events in React Native). We POST directly to the Storage REST
 * endpoint with the user's access token so RLS still applies.
 */

const STORAGE_BUCKET = 'books';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
// Adaptive polling: most books finish in 5-30s, so we start aggressive
// (1s) and back off as the wait grows. Cuts perceived import time
// roughly in half compared to the previous fixed 3s cadence — the user
// sees "Ready" within a second of the Edge Function actually finishing
// for a typical small EPUB.
const POLL_INTERVAL_FAST_MS = 1000;
const POLL_INTERVAL_SLOW_MS = 3000;
const POLL_FAST_WINDOW_MS = 30 * 1000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min hard cap

const ACCEPTED_MIME = ['application/pdf', 'application/epub+zip'];

export type UploadPhase =
  | 'idle'
  | 'picking'
  | 'creating'
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'partial'
  | 'failed';

export type TerminalStatus = 'ready' | 'partial' | 'failed';

export type UploadState = {
  phase: UploadPhase;
  /** 0..1 — only meaningful while phase === 'uploading'. */
  progress: number;
  bookId: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileType: 'pdf' | 'epub' | null;
  /** User-facing error message, set when phase === 'failed' (or validation failed before phase advanced). */
  errorMessage: string | null;
  /** Structured failure reason from the backend (e.g. 'scanned_pdf'). */
  failureReason: string | null;
  /**
   * Live status hint written by the process-book edge function during
   * the `processing` phase ("OCR'ing pages 1–100 of 250…",
   * "Saving chapters…", etc). NULL when there's no server-side
   * message to show — the UI falls back to a phase-derived default.
   */
  processingMessage: string | null;
};

const INITIAL_STATE: UploadState = {
  phase: 'idle',
  progress: 0,
  bookId: null,
  fileName: null,
  fileSize: null,
  fileType: null,
  errorMessage: null,
  failureReason: null,
  processingMessage: null,
};

function detectFileType(name: string, mimeType?: string | null): 'pdf' | 'epub' | null {
  const lowered = name.toLowerCase();
  if (lowered.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (lowered.endsWith('.epub') || mimeType === 'application/epub+zip') return 'epub';
  return null;
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Upload a Blob to Supabase Storage via raw XHR so we get upload-progress
 * events. Resolves when the server returns 200; rejects on non-2xx or any
 * transport error. The signal lets the caller cancel mid-upload.
 */
function uploadBlobWithProgress(args: {
  url: string;
  accessToken: string;
  blob: Blob;
  contentType: string;
  onProgress: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { url, accessToken, blob, contentType, onProgress, signal } = args;
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('Content-Type', contentType);
    // Don't overwrite an existing file at this path — book ids are uuids so
    // a collision means a real bug (or a duplicate retry); fail loudly.
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) {
        // Clamp — some servers report total < loaded by a few bytes near
        // the end, which would push the ring past 100%.
        onProgress(Math.max(0, Math.min(1, e.loaded / e.total)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Storage upload failed (${xhr.status}): ${xhr.responseText}`));
      }
    };
    xhr.onerror = () => reject(new Error('Storage upload failed: network error'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }

    xhr.send(blob);
  });
}

/**
 * Poll books.processing_status (1s for first 30s, then 3s) until it hits a
 * terminal state. Status convention from the Edge Function:
 *   - 'ready'              → success, full text + chapters
 *   - 'partial'            → ingest succeeded but some optional step failed
 *   - 'failed'             → unknown failure
 *   - 'failed:<reason>'    → structured failure (e.g. 'failed:scanned_pdf')
 *
 * `onMessage` is called every poll with the current value of
 * books.processing_message — a human-readable status hint written by
 * the edge function mid-flight. The caller surfaces this in the UI.
 */
async function pollUntilTerminal(
  bookId: string,
  signal?: AbortSignal,
  onMessage?: (message: string | null) => void,
): Promise<{ status: TerminalStatus; reason: string | null }> {
  const startedAt = Date.now();
  while (true) {
    if (signal?.aborted) throw new Error('Polling cancelled');
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      throw new Error('Processing timed out');
    }

    const { data, error } = await supabase
      .from('books')
      .select('processing_status, processing_message')
      .eq('id', bookId)
      .single();

    if (error) {
      // Transient errors — keep polling rather than bailing on a flake.
      console.warn('[upload] poll error:', error.message);
    } else if (data?.processing_status) {
      const raw = data.processing_status;
      // Surface the live status hint even on the same poll that returns
      // a terminal status — the caller can clear it on terminal phase.
      onMessage?.(data.processing_message ?? null);
      if (raw === 'ready' || raw === 'partial') {
        return { status: raw, reason: null };
      }
      if (raw === 'failed' || raw.startsWith('failed:')) {
        const reason = raw.includes(':') ? raw.split(':')[1] || null : null;
        return { status: 'failed', reason };
      }
      // Otherwise still 'processing' / 'pending' — keep waiting.
    }

    const elapsed = Date.now() - startedAt;
    const interval =
      elapsed < POLL_FAST_WINDOW_MS
        ? POLL_INTERVAL_FAST_MS
        : POLL_INTERVAL_SLOW_MS;
    await new Promise((res) => setTimeout(res, interval));
  }
}

export type UseBookUploadResult = {
  state: UploadState;
  /** Open the picker and run the full pipeline. Resolves when the flow ends. */
  startUpload: () => Promise<void>;
  /** Abort any in-flight upload or poll. The book row is left in place (status reflects last write). */
  cancel: () => void;
  /** Reset to idle (call after the user dismisses the processing/error UI). */
  reset: () => void;
};

export function useBookUpload(): UseBookUploadResult {
  const [state, setState] = useState<UploadState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const startUpload = useCallback(async () => {
    // Tear down any previous run.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setState({ ...INITIAL_STATE, phase: 'picking' });

    // ── 1. Pick file ────────────────────────────────────────────────────────
    let picked: DocumentPicker.DocumentPickerAsset;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_MIME,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        setState(INITIAL_STATE);
        return;
      }
      picked = result.assets[0];
    } catch (err) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        errorMessage:
          err instanceof Error ? err.message : 'Could not open the file picker.',
      });
      return;
    }

    const fileName = picked.name ?? 'Untitled';
    const fileSize = picked.size ?? 0;
    const fileType = detectFileType(fileName, picked.mimeType);

    // ── 2. Validate ────────────────────────────────────────────────────────
    if (!fileType) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        fileName,
        fileSize,
        errorMessage: "That file isn't supported. Choose a PDF or EPUB.",
      });
      return;
    }
    if (fileSize > MAX_FILE_BYTES) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        fileName,
        fileSize,
        fileType,
        errorMessage: `That file is ${formatBytes(fileSize)}. The limit is 50 MB.`,
      });
      return;
    }

    // ── 3. Auth + insert book row ──────────────────────────────────────────
    setState((s) => ({ ...s, phase: 'creating', fileName, fileSize, fileType }));

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user || !session.access_token) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        fileName,
        fileSize,
        fileType,
        errorMessage: 'You need to be signed in to upload a book.',
      });
      return;
    }
    const userId = session.user.id;
    const accessToken = session.access_token;

    const tempTitle = stripExtension(fileName);
    const { data: bookRow, error: insertError } = await supabase
      .from('books')
      .insert({
        user_id: userId,
        title: tempTitle,
        source: 'upload',
        file_type: fileType,
        processing_status: 'processing',
      })
      .select('id')
      .single();

    if (insertError || !bookRow?.id) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        fileName,
        fileSize,
        fileType,
        errorMessage: insertError?.message ?? 'Could not create the book record.',
      });
      return;
    }
    const bookId = bookRow.id;
    const storagePath = `${userId}/${bookId}/original.${fileType}`;

    setState((s) => ({ ...s, bookId, phase: 'uploading', progress: 0 }));

    // ── 4. Upload to Storage with progress ─────────────────────────────────
    let blob: Blob;
    try {
      const res = await fetch(picked.uri);
      blob = await res.blob();
    } catch (err) {
      await markBookFailed(bookId, 'read_file');
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        bookId,
        fileName,
        fileSize,
        fileType,
        errorMessage:
          err instanceof Error ? err.message : 'Could not read the picked file.',
      });
      return;
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        errorMessage: 'Missing EXPO_PUBLIC_SUPABASE_URL.',
      });
      return;
    }
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${storagePath}`;
    const contentType =
      fileType === 'pdf' ? 'application/pdf' : 'application/epub+zip';

    try {
      await uploadBlobWithProgress({
        url: uploadUrl,
        accessToken,
        blob,
        contentType,
        signal,
        onProgress: (fraction) => {
          setState((s) => (s.phase === 'uploading' ? { ...s, progress: fraction } : s));
        },
      });
    } catch (err) {
      await markBookFailed(bookId, 'upload');
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        bookId,
        fileName,
        fileSize,
        fileType,
        errorMessage: err instanceof Error ? err.message : 'Upload failed.',
      });
      return;
    }

    if (signal.aborted) return;

    // ── 5. Invoke process-book Edge Function ───────────────────────────────
    setState((s) => ({ ...s, phase: 'processing', progress: 1 }));

    const { error: invokeError } = await supabase.functions.invoke('process-book', {
      body: { book_id: bookId, file_storage_path: storagePath },
    });
    // The function invokes returns a non-2xx as an `invokeError`. When it
    // does, the function itself has *already* written `failed:<reason>`
    // to the books row (see process-book/index.ts catch block). We poll
    // briefly to surface that structured reason to the user instead of
    // overwriting the row with an opaque "invoke failed". A short timeout
    // is enough — the row is written before the 5xx response is sent.
    if (invokeError) {
      const reason = await readFailureReasonWithRetry(bookId);
      setState({
        ...INITIAL_STATE,
        phase: 'failed',
        bookId,
        fileName,
        fileSize,
        fileType,
        failureReason: reason,
        errorMessage:
          reason === 'scanned_pdf'
            ? "This PDF looks like scanned images — Bookflow can't extract text from it."
            : reason
            ? `Processing failed: ${reason}`
            : invokeError.message ?? 'Could not start processing.',
      });
      return;
    }

    // ── 6. Poll until terminal ─────────────────────────────────────────────
    try {
      const { status, reason } = await pollUntilTerminal(
        bookId,
        signal,
        // Stream the edge function's live status hint into state so
        // the UI can show e.g. "OCR'ing pages 1–100 of 250…" while
        // processing is still in flight.
        (message) => {
          setState((s) =>
            s.phase === 'processing'
              ? { ...s, processingMessage: message }
              : s,
          );
        },
      );
      setState((s) => ({
        ...s,
        phase: status,
        failureReason: reason,
        // Terminal — clear the in-flight hint so the UI doesn't keep
        // showing a stale "OCR'ing…" message under a completed state.
        processingMessage: null,
        errorMessage:
          status === 'failed'
            ? reason === 'scanned_pdf'
              ? "This PDF looks like scanned images — Bookflow can't extract text from it."
              : 'Processing failed.'
            : null,
      }));
    } catch (err) {
      if (signal.aborted) return;
      setState((s) => ({
        ...s,
        phase: 'failed',
        processingMessage: null,
        errorMessage:
          err instanceof Error ? err.message : 'Processing timed out.',
      }));
    }
  }, []);

  return { state, startUpload, cancel, reset };
}

/**
 * Best-effort flip of the book row to a failed status when the client-side
 * pipeline aborts before the Edge Function ever runs. Swallows errors —
 * worst case the row is left in 'processing', which the user can clean up
 * from the library.
 */
async function markBookFailed(bookId: string, reason: string) {
  try {
    await supabase
      .from('books')
      .update({ processing_status: `failed:${reason}` })
      .eq('id', bookId);
  } catch (err) {
    console.warn('[upload] markBookFailed swallowed:', err);
  }
}

/**
 * After a function invoke error, read the books row a few times to pick up
 * the structured `failed:<reason>` the Edge Function wrote before returning
 * its 5xx. Returns the bare reason ('scanned_pdf', 'no_chapters_extracted',
 * etc) or null if the row still says 'processing' / can't be read.
 */
async function readFailureReasonWithRetry(bookId: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const { data } = await supabase
        .from('books')
        .select('processing_status')
        .eq('id', bookId)
        .single();
      const status = data?.processing_status;
      if (typeof status === 'string' && status.startsWith('failed:')) {
        return status.split(':').slice(1).join(':') || null;
      }
      if (status === 'failed') return null;
    } catch {
      // ignore — retry
    }
    await new Promise((res) => setTimeout(res, 500));
  }
  return null;
}
