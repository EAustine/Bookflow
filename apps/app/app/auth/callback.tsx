/**
 * Magic-link callback — the deep-link target.
 *
 * Reached three ways, all of which land here:
 *   bookflow://auth/callback?...        custom scheme
 *   https://getbookflow.co/auth/...     iOS Universal Link
 *   https://getbookflow.co/auth/...     Android App Link
 *
 * The `/auth` path prefix in `app.json`'s `intentFilters` is what makes
 * the last two work, and it is why the route lives at `/auth/callback`
 * rather than somewhere tidier — the native manifests claim that prefix,
 * so the route has to be under it.
 *
 * It did not, until 2026-10-28. M2 put this file in the `(auth)` GROUP,
 * and Expo Router strips parenthesised segments from the URL, so it
 * actually served `/callback`. Every magic link hit "Unmatched Route".
 * The directory is now `auth/`, unparenthesised, so the path is real.
 *
 * Moved out of `App.tsx` in M2. The logic is unchanged; what changed is
 * that the URL now *is* the navigation rather than something that pokes
 * a state machine from the outside.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import {
  AuthCallbackScreen,
  type AuthCallbackError,
} from '~/features/auth';
import { completeAuthCallback, parseAuthCallback, describeAuthCallback } from '~/features/auth';
import { supabase } from '~/lib/supabase';

export default function Callback() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [state, setState] = useState<'verifying' | 'error'>('verifying');
  const [error, setError] = useState<AuthCallbackError>('expired');

  // Module-level in App.tsx, a ref here. Same job: a cold start can
  // deliver the same URL through getInitialURL *and* the listener, and
  // exchanging one code twice fails the second time — which used to
  // surface as "link expired" on a link the user had just tapped.
  const inFlight = useRef(false);

  const handleUrl = useCallback(
    async (url: string | null | undefined, source: string) => {
      if (!url) {
        console.log('[auth] callback: no URL from', source);
        return;
      }
      console.log('[auth] callback via', source, '::', describeAuthCallback(url));
      const payload = parseAuthCallback(url);
      if (!payload) {
        // Not a silent return. A callback URL that parses to nothing is
        // the shape of bug that leaves the user staring at "Verifying
        // your sign-in link…" with no way to tell why.
        console.warn('[auth] callback URL carried no auth material:', describeAuthCallback(url));
        return;
      }
      console.log('[auth] callback payload kind:', payload.kind);

      // An error callback carries nothing to exchange, so it skips the
      // in-flight guard entirely — there is no request to duplicate.
      // Without this branch the handler fell through, no error state was
      // set, and the root layout's session restore quietly replaced the
      // route with Welcome: the user tapped a link and was returned to
      // the start with no explanation.
      if (payload.kind === 'error') {
        setError(payload.error);
        setState('error');
        return;
      }

      if (inFlight.current) return;
      inFlight.current = true;

      const result = await completeAuthCallback(payload);
      inFlight.current = false;

      if (!result.ok) {
        setError(result.error);
        setState('error');
        return;
      }

      // Route on the profile flag, not a created_at heuristic. New users
      // land on onboarding (the trigger seeds the row with
      // onboarding_complete=false); returning users go to Library. A
      // failed lookup defaults to Library — RLS catches any real auth
      // problem downstream, and stranding the user is worse.
      let onboardingComplete = false;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', result.userId)
          .single();
        onboardingComplete = !!profile?.onboarding_complete;
      } catch (err) {
        console.warn('[auth] profile lookup after callback failed:', err);
        onboardingComplete = true;
      }

      router.replace(onboardingComplete ? '/(tabs)/library' : '/(onboarding)/intent');
    },
    [router],
  );

  useEffect(() => {
    // Expo Router has already parsed the URL that opened this route, but
    // the exchange needs the raw one — the token can arrive in the
    // fragment, which the router does not surface as a param.
    void Linking.getInitialURL()
      .then((u) => handleUrl(u, 'getInitialURL'))
      .catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url, 'urlEvent'));
    return () => sub.remove();
  }, [handleUrl]);

  // Warm start: the app was already running, so the link arrives AS the
  // navigation. `getInitialURL()` still returns the URL that originally
  // launched the process, and the `url` listener above is registered on
  // mount — which happens after the event that caused this navigation.
  // Neither sees it. The router's parsed params are the only copy.
  //
  // This used to read `params.code` alone, so an error callback (which
  // carries `error`/`error_code` and no code) matched nothing and the
  // screen span on "Verifying your sign-in link…" forever.
  const { code, error: errParam, error_code: errCode } = params;
  useEffect(() => {
    const qp: Record<string, string> = {};
    if (typeof code === 'string' && code) qp.code = code;
    if (typeof errParam === 'string' && errParam) qp.error = errParam;
    if (typeof errCode === 'string' && errCode) qp.error_code = errCode;
    if (Object.keys(qp).length === 0) return;
    void handleUrl(Linking.createURL('/auth/callback', { queryParams: qp }), 'routerParams');
  }, [code, errParam, errCode, handleUrl]);

  return (
    <AuthCallbackScreen
      state={state}
      error={error}
      onRetry={() => router.replace('/(auth)/sign-in')}
      onBackToSignIn={() => router.replace('/(auth)/sign-in')}
    />
  );
}
