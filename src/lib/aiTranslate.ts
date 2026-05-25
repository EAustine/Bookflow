import { useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Page translation client. Same caching shape as Summary / Practice:
 * server-side cache keyed by (page_id, target_language).
 *
 * Common language list — the edge function actually accepts any
 * string (Claude does the language identification), this set is just
 * what we surface in the language picker.
 */

export type TranslationLanguage = {
  code: string;
  label: string;
};

export const COMMON_LANGUAGES: TranslationLanguage[] = [
  { code: 'twi', label: 'Twi' },
  { code: 'spanish', label: 'Spanish' },
  { code: 'french', label: 'French' },
  { code: 'german', label: 'German' },
  { code: 'italian', label: 'Italian' },
  { code: 'portuguese', label: 'Portuguese' },
  { code: 'japanese', label: 'Japanese' },
  { code: 'mandarin', label: 'Mandarin Chinese' },
  { code: 'korean', label: 'Korean' },
  { code: 'arabic', label: 'Arabic' },
  { code: 'swahili', label: 'Swahili' },
  { code: 'yoruba', label: 'Yoruba' },
];

export type GenerateTranslationResult =
  | {
      ok: true;
      data: {
        translation: string;
        targetLanguage: string;
        cached: boolean;
        pageIndex: number;
      };
    }
  | { ok: false; error: string; message?: string };

export async function generateTranslation(args: {
  bookId: string;
  pageIndex: number;
  targetLanguage: string;
}): Promise<GenerateTranslationResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-translation', {
      body: {
        book_id: args.bookId,
        page_index: args.pageIndex,
        target_language: args.targetLanguage,
      },
    });

    if (error) {
      const ctx = (error as { context?: unknown }).context;
      if (ctx && typeof (ctx as Response).text === 'function') {
        try {
          const body = await (ctx as Response).text();
          if (body) {
            try {
              const parsed = JSON.parse(body) as { error: string; message?: string };
              return { ok: false, error: parsed.error, message: parsed.message };
            } catch {
              return { ok: false, error: 'function_failed', message: body.slice(0, 280) };
            }
          }
        } catch {
          // ignore
        }
      }
      return { ok: false, error: 'function_failed', message: error.message };
    }

    if (!data?.translation) {
      return {
        ok: false,
        error: data?.error ?? 'invalid_response',
        message: data?.message,
      };
    }

    return {
      ok: true,
      data: {
        translation: data.translation as string,
        targetLanguage: data.target_language as string,
        cached: !!data.cached,
        pageIndex: data.page_index as number,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: 'request_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export type UseTranslationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; translation: string; cached: boolean; targetLanguage: string }
  | { status: 'error'; errorCode: string; errorMessage: string | null };

/**
 * In-memory translation cache, keyed by (book, page, language).
 *
 * The server already de-duplicates LLM calls via its own
 * `(page_id, target_language)` row cache — but the client still pays
 * a Supabase function round-trip (~200-500 ms) on every page or
 * language flip, and the UI flashes "Translating…" in the meantime.
 * That broke the user's flow: pick German, glance at it, switch back
 * to French, and watch the spinner re-appear for content we already
 * fetched.
 *
 * Caching at the client closes the loop — re-selecting a language
 * we've translated this session is instant, no spinner, no network.
 * The map is module-level so it survives screen unmount + remount
 * as the user navigates back to the reader and re-opens Translate.
 *
 * Capped to ~50 entries with LRU insertion order to bound memory
 * for users translating across many pages.
 */
type CachedTranslation = { translation: string; targetLanguage: string };
const translationCache: Map<string, CachedTranslation> = new Map();
const TRANSLATION_CACHE_MAX = 50;

function translationCacheKey(
  bookId: string,
  pageIndex: number,
  targetLanguage: string,
): string {
  return `${bookId}|${pageIndex}|${targetLanguage.toLowerCase()}`;
}

function rememberTranslation(key: string, value: CachedTranslation): void {
  if (translationCache.has(key)) translationCache.delete(key);
  translationCache.set(key, value);
  if (translationCache.size > TRANSLATION_CACHE_MAX) {
    const oldest = translationCache.keys().next().value;
    if (oldest !== undefined) translationCache.delete(oldest);
  }
}

export function useTranslation(args: {
  bookId: string;
  pageIndex: number;
  targetLanguage: string;
  enabled?: boolean;
}): UseTranslationState {
  const { bookId, pageIndex, targetLanguage, enabled = true } = args;
  // Synchronous cache peek at mount + when deps change, so a cache
  // hit skips the loading flash entirely instead of rendering
  // "Translating…" for one frame before swapping in the cached text.
  const seedFromCache = (): UseTranslationState => {
    const cached = translationCache.get(
      translationCacheKey(bookId, pageIndex, targetLanguage),
    );
    if (cached) {
      return {
        status: 'success',
        translation: cached.translation,
        cached: true,
        targetLanguage: cached.targetLanguage,
      };
    }
    return { status: 'idle' };
  };
  const [state, setState] = useState<UseTranslationState>(seedFromCache);

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    const key = translationCacheKey(bookId, pageIndex, targetLanguage);
    const cached = translationCache.get(key);
    if (cached) {
      // Cache hit — skip the network entirely. No spinner.
      setState({
        status: 'success',
        translation: cached.translation,
        cached: true,
        targetLanguage: cached.targetLanguage,
      });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      const result = await generateTranslation({ bookId, pageIndex, targetLanguage });
      if (cancelled) return;
      if (result.ok) {
        rememberTranslation(key, {
          translation: result.data.translation,
          targetLanguage: result.data.targetLanguage,
        });
        setState({
          status: 'success',
          translation: result.data.translation,
          cached: result.data.cached,
          targetLanguage: result.data.targetLanguage,
        });
      } else {
        setState({
          status: 'error',
          errorCode: result.error,
          errorMessage: result.message ?? null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId, pageIndex, targetLanguage, enabled]);

  return state;
}
