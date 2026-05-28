import { supabase } from '~/lib/supabase';

/**
 * Narrow shape of what the import flow actually needs from a Discover
 * book — title, author, source URL, source name. Keeps the function
 * decoupled from the wider `DiscoverBook` types floating around in
 * `discoverApi.ts` (lib-shape) and the Discover screen (UI-shape).
 */
export type ImportableBook = {
  title: string;
  author?: string;
  epubUrl: string | null;
  source: 'gutenberg' | 'standardebooks' | 'openlibrary' | 'wikisource';
};

/**
 * Client wrapper around the `import-from-url` edge function. Submits a
 * Discover book to the user's library and returns the resulting
 * book_id (or an error envelope mirroring the other AI hooks).
 *
 * The edge function:
 *   - inserts a books row (status='processing')
 *   - downloads the EPUB
 *   - uploads to user storage
 *   - kicks off process-book in the background
 *
 * Subsequent state changes (status flipping to 'ready' / 'failed') are
 * delivered to the client via the existing `useBooks` realtime channel
 * — no polling required.
 */
export type ImportBookResult =
  | {
      ok: true;
      bookId: string;
      alreadyImported: boolean;
    }
  | {
      ok: false;
      error: string;
      message?: string;
    };

export async function importDiscoverBook(
  book: ImportableBook,
): Promise<ImportBookResult> {
  if (!book.epubUrl) {
    return {
      ok: false,
      error: 'no_epub',
      message: 'This book has no EPUB available for import.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('import-from-url', {
      body: {
        source_url: book.epubUrl,
        title: book.title,
        author: book.author,
        source: book.source,
      },
    });

    if (error) {
      // supabase-js v2 stuffs the response body inside `error.context`
      // as a Response. We pull it out so the user sees the function's
      // own error code rather than the generic "non-2xx" wrapper.
      const ctx = (error as { context?: unknown }).context;
      let errorCode = 'function_failed';
      let errorMessage: string | undefined = error.message;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          const bodyText = await (ctx as Response).text();
          if (bodyText) {
            try {
              const parsed = JSON.parse(bodyText) as {
                error?: string;
                message?: string;
              };
              if (parsed.error) errorCode = parsed.error;
              if (parsed.message) errorMessage = parsed.message;
            } catch {
              errorMessage = bodyText.slice(0, 240);
            }
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, error: errorCode, message: errorMessage };
    }

    if (!data?.book_id) {
      return { ok: false, error: 'invalid_response' };
    }
    return {
      ok: true,
      bookId: data.book_id as string,
      alreadyImported: !!data.already_imported,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'request_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Translate an error code from `import-from-url` into a UI-friendly
 * message. Mirrors the patterns used by the AI hooks.
 */
export function importErrorMessage(code: string): string {
  switch (code) {
    case 'no_epub':
      return "This book doesn't have an EPUB to import.";
    case 'host_not_allowed':
      return 'That source isn\'t supported yet.';
    case 'invalid_url':
      return 'The book\'s download link looks invalid.';
    case 'unauthorized':
      return 'Please sign back in and try again.';
    case 'download_failed':
    case 'empty_response':
      return "Couldn't fetch the book. Try again in a moment.";
    case 'file_too_large':
      return 'This book is too large to import (50 MB limit).';
    case 'storage_upload_failed':
      return "Couldn't save the book to your library. Try again.";
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the import service.';
    default:
      return 'Something went wrong adding this book.';
  }
}
