import { useEffect, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Practice questions client. Calls the `generate-practice` edge
 * function and returns a typed array of multiple-choice questions.
 *
 * Same caching shape as Summary: server-side cache on (page_id, count)
 * for the single-page case; multi-page bypasses the cache.
 */

export type PracticeQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

export type GeneratePracticeArgs = {
  bookId: string;
  count?: 3 | 5 | 10;
} & (
  | { pageIndex: number; pageIndices?: undefined }
  | { pageIndex?: undefined; pageIndices: number[] }
);

export type GeneratePracticeResult =
  | {
      ok: true;
      data: {
        questions: PracticeQuestion[];
        count: number;
        cached: boolean;
        pageIndex: number;
      };
    }
  | { ok: false; error: string; message?: string };

export async function generatePractice(
  args: GeneratePracticeArgs,
): Promise<GeneratePracticeResult> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-practice', {
      body: {
        book_id: args.bookId,
        ...(args.pageIndices
          ? { page_indices: args.pageIndices }
          : { page_index: args.pageIndex }),
        ...(args.count ? { count: args.count } : {}),
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

    if (!Array.isArray(data?.questions)) {
      return { ok: false, error: data?.error ?? 'invalid_response', message: data?.message };
    }

    return {
      ok: true,
      data: {
        questions: data.questions as PracticeQuestion[],
        count: data.count as number,
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

export type UsePracticeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; questions: PracticeQuestion[]; cached: boolean }
  | { status: 'error'; errorCode: string; errorMessage: string | null };

export function usePractice(args: {
  bookId: string;
  pageIndex: number;
  count?: 3 | 5 | 10;
  enabled?: boolean;
}): UsePracticeState {
  const { bookId, pageIndex, count = 5, enabled = true } = args;
  const [state, setState] = useState<UsePracticeState>({ status: 'idle' });

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      const result = await generatePractice({ bookId, pageIndex, count });
      if (cancelled) return;
      if (result.ok) {
        setState({
          status: 'success',
          questions: result.data.questions,
          cached: result.data.cached,
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
  }, [bookId, pageIndex, count, enabled]);

  return state;
}
