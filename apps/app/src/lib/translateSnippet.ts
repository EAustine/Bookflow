import { supabase } from '~/lib/supabase';

/**
 * Client wrapper around the `translate-snippet` edge function. Used
 * by the reader's sentence-translate sheet — translates a short user-
 * highlighted passage into their preferred target language.
 *
 * No caching at this layer: snippets are unique per highlight and
 * the user expects a fresh response per tap. If the same sentence
 * is re-highlighted within a session we'll hit the API again, which
 * is fine — the cost per Haiku call is fractions of a cent and the
 * latency is short enough.
 *
 * The result envelope mirrors the AI hooks (summary / starters /
 * chat) so call sites can handle the `ok: false` branch with the
 * same `errorCode → message` mapping pattern.
 */
export type TranslateSnippetResult =
  | { ok: true; translation: string; targetLanguage: string }
  | { ok: false; error: string; message?: string };

export async function translateSnippet(args: {
  text: string;
  /** Free-form tag — see translate-snippet/index.ts header for the
   * accepted vocabulary. */
  targetLanguage: string;
}): Promise<TranslateSnippetResult> {
  const trimmed = args.text.trim();
  if (!trimmed) {
    return { ok: false, error: 'empty_text' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('translate-snippet', {
      body: {
        text: trimmed,
        target_language: args.targetLanguage,
      },
    });
    if (error) {
      // supabase-js v2 stashes the response body in `error.context`
      // as a Response. We pull it so callers see the function's
      // structured error code instead of the generic non-2xx wrapper.
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
          // ignore — fall through with the function_failed default
        }
      }
      return { ok: false, error: errorCode, message: errorMessage };
    }
    if (typeof data?.translation !== 'string' || !data.translation) {
      return { ok: false, error: 'invalid_response' };
    }
    return {
      ok: true,
      translation: data.translation as string,
      targetLanguage: (data.target_language as string) ?? args.targetLanguage,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'request_failed',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Map an error code from translate-snippet into a UI-friendly message. */
export function translateSnippetErrorMessage(code: string): string {
  switch (code) {
    case 'empty_text':
      return 'Nothing to translate.';
    case 'missing_fields':
      return 'Translation request was missing required fields.';
    case 'invalid_language':
      return 'Target language not recognised.';
    case 'text_too_long':
      return 'Selection is too long to translate in one go.';
    case 'unauthorized':
      return 'Please sign back in and try again.';
    case 'llm_empty':
    case 'llm_failed':
      return "Translator didn't return anything. Try again.";
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the translator.';
    case 'server_misconfigured':
      return 'Translator is offline. Try again later.';
    default:
      return "Couldn't translate that.";
  }
}
