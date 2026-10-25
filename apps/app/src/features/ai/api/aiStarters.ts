import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '~/lib/supabase';

/**
 * Starter questions client. Calls the `generate-starters` edge function
 * and returns 3 book-specific suggested questions to seed the chat
 * screen. The server caches the result on `books.suggested_questions`
 * so subsequent opens are instant.
 *
 * Mock books (non-uuid ids) skip the round-trip and return an empty
 * list — the UI then hides the "Suggested questions" section, which
 * is the right behaviour for fixtures.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StarterQuestionsState =
  | { status: 'loading' }
  | { status: 'success'; questions: string[]; cached: boolean }
  | { status: 'error'; errorCode: string; errorMessage?: string };

/**
 * Generic fallback shown when the LLM-generated starters aren't available
 * (server unreachable, function not yet deployed, book still processing).
 * Intentionally book-agnostic so they make sense everywhere; the real
 * book-specific questions take over the moment the function succeeds.
 */
export const FALLBACK_STARTERS: string[] = [
  'What are the central themes of this book?',
  'Who are the most important characters and what drives them?',
  'What stood out as significant about the opening pages?',
];

/**
 * Hook that resolves to 3 starter questions for the given book.
 * Stays in `loading` until the first response (cache hit OR generated)
 * lands; after that swaps to `success`. Errors are exposed but the
 * caller usually just hides the section instead of surfacing the error
 * — starter questions are an enhancement, not a requirement.
 */
export function useStarterQuestions(bookId: string): StarterQuestionsState {
  const [state, setState] = useState<StarterQuestionsState>({ status: 'loading' });

  // Track the last bookId we kicked off so a fast book swap doesn't
  // race a stale response onto a different book's chat screen.
  const inFlightFor = useRef<string | null>(null);

  const fetchStarters = useCallback(async (id: string) => {
    inFlightFor.current = id;

    if (!UUID_RE.test(id)) {
      // Mock / fixture book — nothing to query.
      if (inFlightFor.current === id) {
        setState({ status: 'success', questions: [], cached: true });
      }
      return;
    }

    try {
      // Read-through cache: if the books row already has the list,
      // skip the edge function call entirely (saves a round-trip).
      // Cast to bypass the generated Database type — the
      // `suggested_questions` column is added by migration 0014 and the
      // generated types lag the migration; cast unblocks until the
      // types are regenerated.
      const { data: row } = (await supabase
        .from('books')
        .select('suggested_questions')
        .eq('id', id)
        .maybeSingle()) as unknown as {
        data: { suggested_questions: string[] | null } | null;
      };
      const cached = row?.suggested_questions ?? null;
      if (cached && cached.length >= 3 && inFlightFor.current === id) {
        setState({
          status: 'success',
          questions: cached.slice(0, 3),
          cached: true,
        });
        return;
      }

      const { data, error } = await supabase.functions.invoke('generate-starters', {
        body: { book_id: id },
      });
      if (inFlightFor.current !== id) return; // stale

      if (error) {
        const ctx = (error as { context?: unknown }).context;
        let errorCode = 'function_failed';
        let errorMessage: string | undefined = error.message;
        if (ctx && typeof (ctx as Response).text === 'function') {
          try {
            const bodyText = await (ctx as Response).text();
            try {
              const parsed = JSON.parse(bodyText) as { error?: string; message?: string };
              if (parsed.error) errorCode = parsed.error;
              if (parsed.message) errorMessage = parsed.message;
            } catch {
              if (bodyText) errorMessage = bodyText.slice(0, 280);
            }
          } catch {
            // ignore
          }
        }
        if (inFlightFor.current === id) {
          setState({ status: 'error', errorCode, errorMessage });
        }
        return;
      }

      const questions = Array.isArray(data?.questions)
        ? (data.questions as unknown[]).filter(
            (q): q is string => typeof q === 'string' && q.trim().length > 0,
          )
        : [];
      if (questions.length === 0) {
        if (inFlightFor.current === id) {
          setState({ status: 'error', errorCode: 'invalid_response' });
        }
        return;
      }
      if (inFlightFor.current === id) {
        setState({
          status: 'success',
          questions: questions.slice(0, 3),
          cached: !!data?.cached,
        });
      }
    } catch (err) {
      if (inFlightFor.current === id) {
        setState({
          status: 'error',
          errorCode: 'request_failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, []);

  useEffect(() => {
    setState({ status: 'loading' });
    void fetchStarters(bookId);
    return () => {
      // Mark current request stale on unmount / book change.
      inFlightFor.current = null;
    };
  }, [bookId, fetchStarters]);

  return state;
}
