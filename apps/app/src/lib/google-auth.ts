import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import type { AuthExchangeErrorKind } from './auth';

// Required for the OAuth browser redirect to close and hand control back to
// the app on Android.
WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export type GoogleSignInResult =
  | { ok: true; userId: string }
  | { ok: false; error: AuthExchangeErrorKind };

/**
 * Hook that wires up Google OAuth via expo-auth-session.
 *
 * Flow:
 *   1. `promptAsync()` opens the Google consent screen in a browser tab.
 *   2. On approval Google returns an id_token in the URL fragment.
 *   3. We pass it to `supabase.auth.signInWithIdToken` — Supabase creates or
 *      resumes a session (upserts the user on first sign-in).
 *   4. `onResult` fires — caller routes to onboarding or library.
 */
export function useGoogleSignIn(onResult: (result: GoogleSignInResult) => void) {
  const [loading, setLoading] = useState(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'cancel' || response.type === 'dismiss') {
      setLoading(false);
      return;
    }

    if (response.type !== 'success') {
      setLoading(false);
      onResult({ ok: false, error: 'unknown' });
      return;
    }

    const idToken = response.params.id_token;
    if (!idToken) {
      setLoading(false);
      onResult({ ok: false, error: 'unknown' });
      return;
    }

    setLoading(true);
    supabase.auth
      .signInWithIdToken({ provider: 'google', token: idToken })
      .then(({ data, error }) => {
        if (error || !data.session?.user) {
          console.warn('[google-auth] signInWithIdToken failed:', error?.message);
          onResult({ ok: false, error: 'unknown' });
        } else {
          onResult({ ok: true, userId: data.session.user.id });
        }
      })
      .finally(() => setLoading(false));
  // onResult is intentionally excluded — it's a callback prop that callers
  // should wrap in useCallback if they care about stability.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return {
    promptAsync: () => {
      setLoading(true);
      promptAsync();
    },
    loading,
    ready: !!request,
  };
}
