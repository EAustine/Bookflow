import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import {
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  Geist_400Regular,
  Geist_500Medium,
} from '@expo-google-fonts/geist';
import { Lexend_400Regular } from '@expo-google-fonts/lexend';
import { Literata_400Regular } from '@expo-google-fonts/literata';
import { configureRevenueCat } from '~/lib/revenuecat';
import {
  type AuthExchangeErrorKind,
  completeAuthCallback,
  parseAuthCallback,
  setupRevenueCatAuthSync,
} from '~/lib/auth';
import { supabase } from '~/lib/supabase';
import type { TabKey } from '~/components';
import { AuthCallbackScreen } from '~/screens/AuthCallbackScreen';
import { ComingSoonScreen } from '~/screens/ComingSoonScreen';
import { LibraryScreen } from '~/screens/LibraryScreen';
import { OnboardingFirstBookScreen } from '~/screens/OnboardingFirstBookScreen';
import { OnboardingIntentScreen } from '~/screens/OnboardingIntentScreen';
import { SignInScreen } from '~/screens/SignInScreen';
import { SignUpScreen } from '~/screens/SignUpScreen';
import { SplashScreen } from '~/screens/SplashScreen';
import { WelcomeScreen } from '~/screens/WelcomeScreen';
import { YouScreen, type YouPlan, type YouProfile } from '~/screens/YouScreen';

// Prevents React Strict Mode's double-mount from firing two simultaneous
// completeAuthCallback calls, which race on Supabase's Web Locks API and
// produce a NavigatorLockAcquireTimeoutError. Module-level so it survives
// the unmount/remount cycle; resets on full page reload (every new link click).
let authCallbackInFlight = false;

// Placeholder data until M2 wires real profile/usage queries from Supabase.
// Driving these from CLAUDE.md's persona Ama keeps mocks honest with
// product intent rather than generic "John Doe" placeholders.
const MOCK_PROFILE: YouProfile = {
  name: 'Ama Mensah',
  email: 'ama.mensah@gmail.com',
};
const MOCK_PLAN: YouPlan = {
  name: 'Free',
  meters: {
    audio: { used: 52, total: 90 },
    aiCredits: { used: 16000, total: 50000 },
    books: { used: 1, total: 2 },
  },
};

LogBox.ignoreLogs(['props.pointerEvents is deprecated']);

const skipNative =
  Constants.appOwnership === 'expo' || Platform.OS === 'web';

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Geist_400Regular,
    Geist_500Medium,
    Lexend_400Regular,
    Literata_400Regular,
  });
  const [stage, setStage] = useState<
    | 'splash'
    | 'welcome'
    | 'signin'
    | 'signup'
    | 'authCallback'
    | 'authCallbackError'
    | 'onboardingIntent'
    | 'onboardingFirstBook'
    | 'library'
  >('splash');
  // Within the logged-in 'library' stage, this picks which tab is rendered.
  // Lifted to App so tab state survives re-renders of any single screen and
  // so future deep-links (e.g. "open Bookflow on the You tab") have one
  // setter to call.
  const [activeTab, setActiveTab] = useState<TabKey>('library');
  const [callbackError, setCallbackError] = useState<AuthExchangeErrorKind>('unknown');
  // Functional setter so a late-firing splash timer can't drag us back to
  // 'welcome' after the deep-link handler has already moved past splash.
  const onSplashComplete = useCallback(
    () => setStage((prev) => (prev === 'splash' ? 'welcome' : prev)),
    [],
  );
  const goToSignIn = useCallback(() => setStage('signin'), []);
  const goToSignUp = useCallback(() => setStage('signup'), []);
  const goToWelcome = useCallback(() => setStage('welcome'), []);
  const goToLibrary = useCallback(() => setStage('library'), []);
  const goToAuthCallback = useCallback(() => setStage('authCallback'), []);
  const goToOnboardingIntent = useCallback(() => setStage('onboardingIntent'), []);
  const goToOnboardingFirstBook = useCallback(() => setStage('onboardingFirstBook'), []);

  // Google OAuth success — same routing logic as magic-link: new users see
  // onboarding, returning users go straight to library.
  const onGoogleSignIn = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const createdAt = user?.created_at ? new Date(user.created_at).getTime() : 0;
    const isNewUser = Date.now() - createdAt < 5 * 60 * 1000;
    setStage(isNewUser ? 'onboardingIntent' : 'library');
  }, []);

  /**
   * Sign-out flow. YouScreen surfaces the confirmation sheet, awaits this
   * promise to keep its loading spinner accurate, and we route everyone
   * back to Welcome. Reset activeTab so the next sign-in lands on Library.
   */
  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // Ignore — even if the network call fails, the local session is
      // cleared by supabase-js and we still want to send the user home.
      console.warn('[auth] signOut failed:', err);
    }
    setActiveTab('library');
    setStage('welcome');
  }, []);

  useEffect(() => {
    if (skipNative) return;
    configureRevenueCat();
    return setupRevenueCatAuthSync();
  }, []);

  /**
   * Magic-link / OAuth deep-link handler.
   *
   * Fires for both `getInitialURL` (cold start: app opened by tapping the
   * link) and `addEventListener` (warm start: link tapped while the app
   * is already running).
   *
   * The callback URL carries either:
   *   - PKCE: `?code=…` query param  (native, exchanged via code_verifier)
   *   - Implicit: `#access_token=…&refresh_token=…` fragment  (web)
   *
   * `parseAuthCallback` returns a discriminated payload and
   * `completeAuthCallback` dispatches to `exchangeCodeForSession` or
   * `setSession` accordingly. Either way we end up with a persisted
   * session and route to onboarding (or the error screen).
   */
  useEffect(() => {
    let cancelled = false;

    const handleUrl = async (url: string | null | undefined) => {
      if (!url) return;
      const payload = parseAuthCallback(url);
      if (!payload) return;
      if (cancelled || authCallbackInFlight) return;
      authCallbackInFlight = true;

      setStage('authCallback');
      const result = await completeAuthCallback(payload);
      authCallbackInFlight = false;
      if (cancelled) return;

      if (result.ok) {
        // New users (account created within last 5 min) go through onboarding.
        // Returning users skip straight to library. M2 will replace this with
        // a profile.onboarding_intent query for a more reliable signal.
        const { data: { user } } = await supabase.auth.getUser();
        const createdAt = user?.created_at ? new Date(user.created_at).getTime() : 0;
        const isNewUser = Date.now() - createdAt < 5 * 60 * 1000;
        setStage(isNewUser ? 'onboardingIntent' : 'library');
      } else {
        setCallbackError(result.error);
        setStage('authCallbackError');
      }
    };

    Linking.getInitialURL().then(handleUrl).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  /**
   * Session restoration on cold start. If the user already has a persisted
   * Supabase session (signed in previously, token still valid), skip the
   * Welcome/SignIn flow and land them on the library directly. The
   * functional setStage guard makes sure the deep-link handler — which can
   * race with this — keeps its precedence: a fresh sign-in via magic link
   * should still see the verifying screen.
   */
  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (cancelled || !session) return;
        setStage((prev) => (prev === 'splash' ? 'library' : prev));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          {stage === 'splash' && <SplashScreen onComplete={onSplashComplete} />}
          {stage === 'welcome' && (
            <WelcomeScreen onGetStarted={goToSignUp} onSignIn={goToSignIn} />
          )}
          {stage === 'signin' && (
            <SignInScreen
              onBack={goToWelcome}
              onSwitchVariant={goToSignUp}
              onComplete={goToAuthCallback}
              onGoogleSignIn={onGoogleSignIn}
            />
          )}
          {stage === 'signup' && (
            <SignUpScreen
              onBack={goToWelcome}
              onSignIn={goToSignIn}
              onComplete={goToAuthCallback}
              onGoogleSignIn={onGoogleSignIn}
            />
          )}
          {stage === 'authCallback' && (
            <AuthCallbackScreen
              state="verifying"
              onRetry={goToSignIn}
              onBackToSignIn={goToSignIn}
            />
          )}
          {stage === 'authCallbackError' && (
            <AuthCallbackScreen
              state="error"
              error={callbackError}
              onRetry={goToSignIn}
              onBackToSignIn={goToSignIn}
            />
          )}
          {stage === 'onboardingIntent' && (
            <OnboardingIntentScreen
              onContinue={(_intent) => {
                // TODO: persist `onboarding_intent` to profile + emit `signup_intent_picked` to PostHog
                goToOnboardingFirstBook();
              }}
              onSkip={goToOnboardingFirstBook}
            />
          )}
          {stage === 'onboardingFirstBook' && (
            <OnboardingFirstBookScreen
              onContinue={(_selection) => {
                // TODO: copy curated book into user_books + emit `signup_first_book_picked`
                goToLibrary();
              }}
              onSkip={goToLibrary}
            />
          )}
          {stage === 'library' && (
            <>
              {activeTab === 'library' && (
                <LibraryScreen
                  onTabChange={setActiveTab}
                  userName={MOCK_PROFILE.name}
                />
              )}
              {activeTab === 'you' && (
                <YouScreen
                  profile={MOCK_PROFILE}
                  plan={MOCK_PLAN}
                  onTabChange={setActiveTab}
                  onSignOut={handleSignOut}
                />
              )}
              {(activeTab === 'discover' || activeTab === 'listen') && (
                <ComingSoonScreen
                  tab={activeTab}
                  onTabChange={setActiveTab}
                />
              )}
            </>
          )}
          <StatusBar style="dark" />
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
