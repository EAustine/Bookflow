import { useCallback, useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, StyleSheet, View } from 'react-native';
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
import { DiscoverScreen } from '~/screens/DiscoverScreen';
import { ListenHomeScreen } from '~/screens/ListenHomeScreen';
import {
  type ListenPlaybackState,
  type MonthStats,
  type RecentTrack,
} from '~/screens/ListenNowPlayingScreen';
import { PaywallPlanScreen } from '~/screens/PaywallScreen';
import { LibraryScreen } from '~/screens/LibraryScreen';
import { OnboardingFirstBookScreen } from '~/screens/OnboardingFirstBookScreen';
import { OnboardingIntentScreen, type OnboardingIntent } from '~/screens/OnboardingIntentScreen';
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

// Mock Listen-tab data. Real audio playback + recent-listens query is M2 work;
// for now the screen renders a representative book so the tab is interactive
// instead of a "coming soon" stub.
const MOCK_RECENT: RecentTrack[] = [
  { id: 'r1', bookTitle: 'Atomic Habits', meta: 'Ch. 18 · just now',     initials: 'AH', coverColor: '#C7986E' },
  { id: 'r2', bookTitle: 'Sapiens',       meta: 'Ch. 7 · yesterday',     initials: 'SA', coverColor: '#7A6E5C' },
  { id: 'r3', bookTitle: 'Deep Work',     meta: 'Finished · 3 days ago', initials: 'DW', coverColor: '#5B6B58' },
];

const MOCK_MONTH: MonthStats = {
  listeningHours: 4.2,
  listeningHoursDelta: '↑ from 2.8h',
  booksStarted: 3,
  booksFinished: 1,
  audioRemainingMin: 38,
  audioResetLabel: 'Resets June 1',
};

// Placeholder usage data until M2 wires real queries from Supabase.
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
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [callbackError, setCallbackError] = useState<AuthExchangeErrorKind>('unknown');
  const [signupName, setSignupName] = useState('');
  // Listen-tab UI state. Audio playback (react-native-track-player) is
  // deferred to M2 — RNTP 4.x doesn't compile cleanly against RN 0.83 + new
  // arch and there's no book audio in the pipeline yet anyway. The Listen
  // tab shows its empty state until M2 wires real playback.
  const [listenState, setListenState] = useState<ListenPlaybackState>('paused');
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

  const handleSignInComplete = useCallback(() => goToAuthCallback(), [goToAuthCallback]);
  const handleSignUpComplete = useCallback((fullName?: string) => {
    if (fullName?.trim()) setSignupName(fullName.trim());
    goToAuthCallback();
  }, [goToAuthCallback]);

  /**
   * Onboarding persistence. We write to `profiles` then navigate forward —
   * but the writes are best-effort. Onboarding is a soft signal (used for
   * personalisation later); blocking forward motion on a network hiccup
   * would be worse than silently logging the failure. Returning users get
   * routed correctly via session-restore's `onboarding_complete` check, so
   * a lost intent is purely cosmetic.
   */
  const persistOnboardingIntent = useCallback(async (intent: OnboardingIntent | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_intent: intent })
        .eq('id', user.id);
      if (error) console.warn('[onboarding] persist intent failed:', error.message);
    } catch (err) {
      console.warn('[onboarding] persist intent threw:', err);
    }
  }, []);

  const persistOnboardingComplete = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('profiles')
        .update({ onboarding_complete: true })
        .eq('id', user.id);
      if (error) console.warn('[onboarding] mark complete failed:', error.message);
    } catch (err) {
      console.warn('[onboarding] mark complete threw:', err);
    }
  }, []);

  const handleOnboardingIntentContinue = useCallback(
    (intent: OnboardingIntent) => {
      // Fire-and-forget — navigation is independent of the write.
      void persistOnboardingIntent(intent);
      goToOnboardingFirstBook();
    },
    [goToOnboardingFirstBook, persistOnboardingIntent],
  );

  const handleOnboardingIntentSkip = useCallback(() => {
    void persistOnboardingIntent(null);
    goToOnboardingFirstBook();
  }, [goToOnboardingFirstBook, persistOnboardingIntent]);

  const handleOnboardingFirstBookContinue = useCallback(
    (_selection: unknown) => {
      // TODO: copy curated book into user library (M2).
      void persistOnboardingComplete();
      goToLibrary();
    },
    [goToLibrary, persistOnboardingComplete],
  );

  const handleOnboardingFirstBookSkip = useCallback(() => {
    void persistOnboardingComplete();
    goToLibrary();
  }, [goToLibrary, persistOnboardingComplete]);

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
        // Route based on the profile flag, not a created_at heuristic. New
        // users land on onboardingIntent (the trigger seeds the row with
        // onboarding_complete=false); returning users go straight to library.
        // If the profile lookup fails we default to library — RLS will catch
        // any real auth issue downstream, and stranding the user is worse.
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
        setStage(onboardingComplete ? 'library' : 'onboardingIntent');
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
   * Session restoration on cold start. If the user has a persisted Supabase
   * session, look up their `onboarding_complete` flag and route directly to
   * Library (completed) or back into the onboarding flow (incomplete — e.g.
   * they killed the app mid-onboarding). The functional setStage guard
   * makes sure the deep-link handler — which can race with this — keeps
   * its precedence: a fresh sign-in via magic link should still see the
   * verifying screen.
   *
   * Profile fetch failures fall through to Library — RLS enforces the row
   * filter, so a missing/errored profile shouldn't strand the user on
   * splash. Better to let them in and surface any DB issue downstream.
   */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !session?.user) return;

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .single();
        if (cancelled) return;
        if (error) {
          console.warn('[boot] profile lookup failed:', error.message);
        }

        const next = profile?.onboarding_complete ? 'library' : 'onboardingIntent';
        setStage((prev) => (prev === 'splash' ? next : prev));
      } catch (err) {
        console.warn('[boot] session restore threw:', err);
      }
    })();
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
              onComplete={handleSignInComplete}
            />
          )}
          {stage === 'signup' && (
            <SignUpScreen
              onBack={goToWelcome}
              onSignIn={goToSignIn}
              onComplete={handleSignUpComplete}
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
              onContinue={handleOnboardingIntentContinue}
              onSkip={handleOnboardingIntentSkip}
            />
          )}
          {stage === 'onboardingFirstBook' && (
            <OnboardingFirstBookScreen
              onContinue={handleOnboardingFirstBookContinue}
              onSkip={handleOnboardingFirstBookSkip}
            />
          )}
          {stage === 'library' && (
            <>
              {activeTab === 'library' && (
                <LibraryScreen
                  onTabChange={setActiveTab}
                  userName={signupName || 'Ama Mensah'}
                  onUpgrade={() => setPaywallVisible(true)}
                />
              )}
              {activeTab === 'you' && (
                <YouScreen
                  profile={{ name: signupName || 'Ama Mensah', email: 'ama.mensah@gmail.com' }}
                  plan={MOCK_PLAN}
                  onTabChange={setActiveTab}
                  onSignOut={handleSignOut}
                />
              )}
              {activeTab === 'discover' && (
                <DiscoverScreen onTabChange={setActiveTab} />
              )}
              {activeTab === 'listen' && (
                <ListenHomeScreen
                  // No audio engine yet — Listen tab renders its empty state
                  // until M2. Mock now-playing data stays plumbed so flipping
                  // isPlaying=true at any point lights up the hero card for
                  // visual review.
                  isPlaying={false}
                  nowPlaying={{
                    state: listenState,
                    bookTitle: 'Atomic Habits',
                    author: 'James Clear',
                    chapterLabel: 'Ch. 18 · The Goldilocks Rule',
                    progressPercent: 42,
                    elapsed: '4:12',
                    remaining: '-6:56',
                    speed: 1,
                    voice: 'Sarah',
                    recentlyListened: MOCK_RECENT,
                    activeRecentId: 'r1',
                    monthStats: MOCK_MONTH,
                    onPlayPause: () =>
                      setListenState((s) => (s === 'playing' ? 'paused' : 'playing')),
                    onSkipBack: () => {},
                    onSkipForward: () => {},
                    onOpenSpeedSheet: () => {},
                    onOpenVoiceSheet: () => {},
                    onOpenChaptersSheet: () => {},
                    onOpenRecent: () => {},
                    onSeeAllRecent: () => {},
                  }}
                  onTabChange={setActiveTab}
                />
              )}
            </>
          )}
          {paywallVisible && (
            <View style={styles.paywallOverlay}>
              <PaywallPlanScreen onClose={() => setPaywallVisible(false)} />
            </View>
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
  paywallOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
});
