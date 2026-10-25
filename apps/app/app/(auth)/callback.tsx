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
import { completeAuthCallback, parseAuthCallback } from '~/features/auth';
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
    async (url: string | null | undefined) => {
      if (!url) return;
      const payload = parseAuthCallback(url);
      if (!payload) return;
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
    void Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => sub.remove();
  }, [handleUrl]);

  // Warm start: the app was already open on this route and the params
  // carry the code. Reconstruct a URL so one code path handles both.
  useEffect(() => {
    const code = typeof params.code === 'string' ? params.code : null;
    if (code) void handleUrl(Linking.createURL('/auth/callback', { queryParams: { code } }));
  }, [params.code, handleUrl]);

  return (
    <AuthCallbackScreen
      state={state}
      error={error}
      onRetry={() => router.replace('/(auth)/sign-in')}
      onBackToSignIn={() => router.replace('/(auth)/sign-in')}
    />
  );
}
