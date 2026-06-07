import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import {
  BackHandler,
  LogBox,
  Platform,
  StyleSheet,
  ToastAndroid,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import { useShareIntent } from 'expo-share-intent';
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
import { installRejectionTracker } from '~/lib/installRejectionTracker';
import {
  configureRevenueCat,
  presentPaywall,
  useIsPro,
  ENTITLEMENT_PRO,
} from '~/lib/revenuecat';
import {
  fireBookReadyNotification,
  installNotificationHandler,
  useDailyReminderSync,
  useNotificationPermission,
  useStreakWarningSync,
} from '~/lib/notifications';
import { useReaderStore } from '~/stores/readerStore';

// Install the global unhandled-rejection silencer for network
// errors. Idempotent and side-effect free unless a rejection fires.
// Has to run at module evaluation time — before any provider
// effects mount network fetches — so the Hermes tracker is hooked
// up before the first rejection event lands. See
// `installRejectionTracker.ts` for the full rationale.
installRejectionTracker();

// Tell expo-notifications how to display notifications fired while
// the app is in the foreground. Module-load time so the handler is
// in place before any notification can fire (e.g. a deep-link that
// arrives during cold start). Idempotent.
installNotificationHandler();
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
import { ListenHistoryScreen } from '~/screens/ListenHistoryScreen';
import { ListenHomeScreen } from '~/screens/ListenHomeScreen';
import { ListenScreen, MiniPlayer } from '~/screens/ListenScreen';
import {
  AudioSessionProvider,
  clearLastListenedBookId,
  readLastListenedBookId,
  useAudioSession,
  useAudioStable,
} from '~/lib/audioSession';
import { VOICE_OPTIONS } from '~/lib/aiAudio';
import { BooksProvider, useBooks } from '~/hooks/useBooks';
import { useBackHandler } from '~/lib/useBackHandler';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useMonthlyListenStats } from '~/lib/readingStats';
import {
  type ListenPlaybackState,
  type MonthStats,
} from '~/screens/ListenNowPlayingScreen';
import type { Book } from '~/types/book';
// PaywallPlanScreen (custom mockup) retired — all upgrade entry points
// now use RevenueCat's hosted paywall via presentPaywall(). The custom
// screen never wired its CTA to a purchase; the hosted paywall handles
// purchase / restore / localized pricing / store-compliance copy.
import {
  LibraryScreen,
  clearLibrarySignedUrlCache,
} from '~/screens/LibraryScreen';
import { clearReaderImageSignedUrlCache } from '~/screens/ReaderScreen';
import {
  OnboardingFirstBookScreen,
  type FirstBookSelection,
} from '~/screens/OnboardingFirstBookScreen';
import { importDiscoverBook } from '~/lib/discoverImport';
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

// Fallback "this month" stats shown while the real aggregate query is
// still in flight. The real data comes from `useMonthlyListenStats()`
// inside LibraryStage; this only renders for a few hundred ms at most
// before the hook resolves.
const FALLBACK_MONTH: MonthStats = {
  listeningHours: 0,
  listeningHoursDelta: undefined,
  booksStarted: 0,
  booksFinished: 0,
  audioRemainingMin: 90,
  audioResetLabel: undefined,
};

// Free-tier plan limits. Real RevenueCat-driven entitlements would
// override these; until then we report a static "Free" plan with these
// caps so the YouScreen progress meters look correct against actual
// usage data we DO have (books count, listening minutes this month).
const FREE_PLAN_LIMITS = {
  audioMinutesPerMonth: 90,
  aiCreditsPerMonth: 50_000,
  booksTotal: 5,
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
  const [signupName, setSignupName] = useState('');
  // Pre-picked assets handed off to LibraryScreen on its next mount.
  // Two surfaces write here:
  //   1. Onboarding step 2's "Upload" tab — App.tsx opens the picker
  //      before routing to Library so the new-user flow stays one
  //      coherent sequence (pick → land on library → upload progress)
  //      rather than dumping the user onto an empty library and asking
  //      them to find Add → Upload.
  //   2. iOS Share Extension / Android Intent handler (via
  //      expo-share-intent) — when the user picks "Bookflow" from any
  //      other app's share sheet for an EPUB/PDF, we receive the file
  //      list here and pipe it through the same channel.
  // Array (not a single asset) so multi-file shares from the OS share
  // sheet feed into the same code path as multi-file picker uploads.
  // LibraryScreen consumes the array on mount, clears the slot.
  const [pendingUploadAssets, setPendingUploadAssets] = useState<
    DocumentPicker.DocumentPickerAsset[] | null
  >(null);
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
    (selection: FirstBookSelection) => {
      // Library selection: kick off real imports from Project
      // Gutenberg for every book the user picked (1..N). Fire-and-
      // forget for each — the import-from-url edge function returns
      // the book_id within ~400ms (download + processing run in the
      // background), and the user lands on the library where
      // realtime delivers the rows as each processes. Failures are
      // non-fatal: we still complete onboarding and route to library
      // so a user without a stable connection isn't stuck on this
      // screen, and any books that did import successfully will
      // surface as they're ready.
      //
      // We launch all imports in parallel (not awaited, not chained)
      // because Gutenberg is the bottleneck — sequencing would mean
      // the second book waits ~400ms for the first import-from-url
      // call to round-trip before its own background download even
      // starts.
      if (selection.source === 'library' && selection.books.length > 0) {
        for (const book of selection.books) {
          if (!book.gutenbergId) continue;
          const gutenbergId = book.gutenbergId;
          void importDiscoverBook({
            title: book.title,
            author: book.author,
            epubUrl: `https://www.gutenberg.org/ebooks/${gutenbergId}.epub.images`,
            source: 'gutenberg',
          });
        }
      }
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
   * Onboarding step 2's "Upload" tab → "Choose file". Opens the OS
   * document picker right away (the OS sheet covers iCloud, Drive,
   * Dropbox, on-device Files — wherever the user keeps their EPUBs
   * and PDFs). On a successful pick we mark onboarding complete,
   * stash the asset, and transition to the library where the
   * upload progress + processing UI live. On cancel or error we
   * stay on the onboarding screen so the user can switch back to
   * the curated-library tab or try again.
   *
   * Earlier the screen was rendered without any `onPickFile`
   * prop at all — the button was a silent no-op, which leaked the
   * entire bring-your-own-library cohort directly into a dead end
   * in step 2 of onboarding. This wires the existing useBookUpload
   * pipeline to that surface via the asset-handoff state above.
   */
  const handleOnboardingPickFile = useCallback(async () => {
    let asset: DocumentPicker.DocumentPickerAsset;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/epub+zip'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      asset = result.assets[0];
    } catch (err) {
      console.warn('[onboarding] file picker failed:', err);
      return;
    }
    setPendingUploadAssets([asset]);
    void persistOnboardingComplete();
    goToLibrary();
  }, [goToLibrary, persistOnboardingComplete]);

  // ─── Share Extension / Intent handler ─────────────────────────────────
  // When the user picks "Bookflow" from another app's iOS share sheet
  // (Files, Mail, Safari, Dropbox, etc.) or an Android intent
  // ("Open with…" on an EPUB/PDF in any file manager / cloud client),
  // expo-share-intent surfaces the shared files here. We translate
  // them into the same `DocumentPickerAsset` shape that the picker
  // produces and feed them through the existing `pendingUploadAssets`
  // channel — LibraryScreen on mount calls
  // `upload.startUploadFromAssets(...)` and the user lands directly
  // on the processing screen. Same flow as multi-file picker upload.
  //
  // Native config for the share extension itself lives in
  // `app.json` → plugins → `expo-share-intent` (iOS Share Extension
  // target + Android intent-filter for application/epub+zip and
  // application/pdf). Changes there require a new EAS build.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    resetOnBackground: true,
  });
  useEffect(() => {
    if (!hasShareIntent || !shareIntent.files || shareIntent.files.length === 0) {
      return;
    }
    // Filter to the formats we can actually import. The plugin config
    // already restricts the activation rules to EPUB+PDF, but defending
    // here too keeps things robust if a tester or share-target glitch
    // sends us something else.
    const supportedAssets: DocumentPicker.DocumentPickerAsset[] = [];
    for (const f of shareIntent.files) {
      const mimeType = f.mimeType?.toLowerCase() ?? '';
      const name = f.fileName?.toLowerCase() ?? '';
      const looksLikeBook =
        mimeType === 'application/pdf' ||
        mimeType === 'application/epub+zip' ||
        name.endsWith('.pdf') ||
        name.endsWith('.epub');
      if (!looksLikeBook) continue;
      supportedAssets.push({
        uri: f.path,
        name: f.fileName,
        mimeType: f.mimeType,
        size: f.size ?? undefined,
        // lastModified is required on DocumentPickerAsset (Web API
        // parity field). expo-share-intent doesn't surface a real
        // mtime; "now" is a sane default for our pipeline (we don't
        // consume this field anywhere).
        lastModified: Date.now(),
      });
    }
    if (supportedAssets.length === 0) {
      // Nothing usable in the share — clear the intent so future
      // shares can fire. The user will see no library state change,
      // which is correct: they shared an unsupported file.
      resetShareIntent();
      return;
    }
    setPendingUploadAssets(supportedAssets);
    resetShareIntent();
    // Route the user to the library stage. If they're already
    // signed in and beyond onboarding, this is a no-op; if they
    // happen to receive a share while on welcome/signin we still
    // route them there (LibraryScreen's mount-effect will eat the
    // upload once the user is authenticated, or do nothing if not —
    // share-from-cold-start with no auth is rare enough to accept).
    setStage((prev) => (prev === 'library' ? prev : 'library'));
  }, [hasShareIntent, shareIntent, resetShareIntent]);

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
    // Drop every in-memory signed URL keyed by the previous user's
    // storage prefix and the AsyncStorage pointer to their last-
    // listened book. Without these, the next sign-in on the same
    // device could briefly resolve covers / inline images from the
    // outgoing user's namespace, or auto-restore their listening
    // session on the Listen tab.
    try {
      clearLibrarySignedUrlCache();
      clearReaderImageSignedUrlCache();
      void clearLastListenedBookId();
    } catch (err) {
      console.warn('[auth] signed-URL cache clear failed:', err);
    }
    setActiveTab('library');
    setStage('welcome');
  }, []);

  useEffect(() => {
    if (skipNative) return;
    configureRevenueCat();
    return setupRevenueCatAuthSync();
  }, []);

  // Keep the OS-side notifications in sync with the user's toggles
  // + chosen hour. The hooks re-run schedule/cancel whenever any
  // input changes. Both live at the root because mounting them
  // inside the Settings screen would only sync while Settings is
  // open; we want OS state to stay correct for the whole session.
  const reminderEnabled = useReaderStore((s) => s.notifReminderOn);
  const reminderHour = useReaderStore((s) => s.notifReminderHour);
  const reminderMinute = useReaderStore((s) => s.notifReminderMinute);
  const streakWarningEnabled = useReaderStore((s) => s.notifStreakWarningOn);
  const { granted: notifGranted } = useNotificationPermission();
  useDailyReminderSync(
    reminderEnabled,
    reminderHour,
    reminderMinute,
    notifGranted,
  );
  useStreakWarningSync(
    streakWarningEnabled,
    reminderHour,
    reminderMinute,
    notifGranted,
  );

  // Android hardware-back at the root of the BackHandler subscription
  // stack. This runs ONLY when no sub-screen has consumed the press —
  // BackHandler subscriptions are LIFO, so per-screen handlers (e.g.
  // YouDrillScreens' DrillHeader, which calls `onBack` and returns
  // true) intercept first. By the time we get here, the user is on
  // a tab home and the OS would otherwise kill the app.
  //
  // Behaviour: first press shows a toast and starts a 2-second window;
  // a second press inside that window exits the app cleanly. Beyond
  // 2 seconds, the timer resets so a stray press much later doesn't
  // surprise-exit.
  const lastBackPressRef = useRef<number>(0);
  useBackHandler(() => {
    const now = Date.now();
    if (now - lastBackPressRef.current < 2000) {
      // Confirmed exit: user explicitly pressed back twice in a row.
      BackHandler.exitApp();
      return true;
    }
    lastBackPressRef.current = now;
    if (Platform.OS === 'android') {
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
    }
    // Consume the press so the OS doesn't also exit on the first tap.
    return true;
  });

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
        {/*
          AudioSessionProvider lives ABOVE BottomSheetModalProvider so that
          bottom sheets — which render via the modal provider's portal,
          OUTSIDE the React tree where they're declared — can still see
          the audio context via `useAudioSession()`. Without this, the
          per-book VoiceSheet on the Listen screen crashed with
          "useAudioSession must be used inside <AudioSessionProvider>"
          the instant the user tapped the voice picker.

          The provider is safe to mount at all stages (splash, welcome,
          signin, onboarding) because its inner `useAudio` is dormant
          when `book === null`, and the only mount-time work is reading
          a few Zustand values synchronously — no Supabase, no network.
        */}
        <AudioSessionProvider>
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
                onPickFile={() => void handleOnboardingPickFile()}
              />
            )}
            {stage === 'library' && (
              // BooksProvider wraps LibraryStage so the user's library
              // is fetched ONCE per signed-in session and held in
              // context. Without this, Library / Discover / Listen /
              // ListenHistory each mounted their own useBooks
              // instance, and tab switches tore down and re-hydrated
              // the books list on every navigation — a visible
              // "shimmer + re-fetch" pattern that made the Library
              // tab feel slow whenever the user came back to it.
              //
              // Mounts at the library stage boundary (not at
              // SafeAreaProvider) so unmounting on sign-out cleans up
              // the realtime subscription and AsyncStorage cache
              // handles — fresh session starts fresh.
              <BooksProvider>
                <LibraryStage
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  userName={signupName}
                  onSignOut={handleSignOut}
                  onUpgrade={() => void presentPaywall({ requiredEntitlement: ENTITLEMENT_PRO })}
                  listenState={listenState}
                  setListenState={setListenState}
                  pendingUploadAssets={pendingUploadAssets}
                  onPendingUploadAssetsConsumed={() =>
                    setPendingUploadAssets(null)
                  }
                />
              </BooksProvider>
            )}
            <StatusBar style="dark" />
          </BottomSheetModalProvider>
        </AudioSessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Format a positive number of seconds as `M:SS`. Returns "0:00" for
 * non-finite or negative inputs so the now-playing card never paints
 * "NaN:NaN" while expo-audio's first status update is in flight.
 */
/**
 * Snap an arbitrary playback rate onto the typed `Speed` union the
 * ListenNowPlaying pill accepts. Picks the closest entry; defaults
 * to 1× if the input is nonsensical.
 */
function snapSpeed(rate: number): import('~/screens/PlaybackSpeedSheet').Speed {
  const allowed: import('~/screens/PlaybackSpeedSheet').Speed[] = [
    0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3,
  ];
  if (!Number.isFinite(rate) || rate <= 0) return 1;
  let best = allowed[0];
  let bestDelta = Math.abs(rate - best);
  for (const s of allowed) {
    const d = Math.abs(rate - s);
    if (d < bestDelta) {
      best = s;
      bestDelta = d;
    }
  }
  return best;
}

function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Build the `nowPlaying` props for ListenNowPlayingScreen from the live
 * audio session. Pure derivation — no state of its own — so re-renders
 * fire on every position update via React's normal pipeline.
 *
 * Speed / recentlyListened / monthStats aren't yet wired to real data
 * (no playbackRate API on expo-audio yet, no listen_sessions aggregation
 * query); we substitute reasonable placeholders so the screen still
 * renders end-to-end.
 */
function buildNowPlayingProps(
  audio: ReturnType<typeof useAudioSession>,
  listenState: ListenPlaybackState,
  setListenState: React.Dispatch<React.SetStateAction<ListenPlaybackState>>,
  recentBooks: Book[],
  monthStats: MonthStats,
  onSwitchBook: (b: Book) => void,
  onOpenHistory: () => void,
  /** Open the foreground ListenScreen overlay (where the dedicated
   * voice picker lives). Used for the voice-pill tap path; cycling
   * voices in place would be a worse UX than the full picker. */
  onExpandToForeground: () => void,
) {
  const book = audio.book!;
  const dur = Math.max(0, audio.durationSeconds);
  const pos = Math.min(Math.max(0, audio.positionSeconds), dur || 0);
  const remaining = Math.max(0, dur - pos);
  const progress = dur > 0 ? Math.round((pos / dur) * 100) : 0;
  const voiceLabel =
    VOICE_OPTIONS.find((v) => v.id === audio.voiceId)?.label ?? 'Rachel';

  return {
    state: (audio.isPlaying ? 'playing' : 'paused') as ListenPlaybackState,
    bookTitle: book.title,
    author: book.author || '',
    chapterLabel: `Page ${audio.pageIndex + 1}${
      progress > 0 ? ` · ${progress}% done` : ''
    }`,
    progressPercent: progress,
    elapsed: formatTimecode(pos),
    remaining: `-${formatTimecode(remaining)}`,
    // Snap the live audio.playbackRate onto the Speed union so the
    // pill displays the user's actual chosen rate, not a hardcoded 1×.
    speed: snapSpeed(audio.playbackRate),
    voice: voiceLabel,
    // Build the recently-listened list from the user's books — active
    // book first, then up to two others sorted by lastReadAt desc, so
    // the user can quickly switch sessions without leaving the player.
    recentlyListened: (() => {
      // Recently-listened row builder. Each row carries the book's
      // coverColor + coverStoragePath so the player UI can render
      // an actual cover thumbnail instead of just colored initials
      // — the row component lazily resolves the storage path via
      // `resolveCoverUrl` (cached) and falls back to the colored
      // placeholder if the resolve fails offline.
      const activeRow = {
        id: book.id,
        bookTitle: book.title,
        meta: audio.isPlaying ? 'Playing now' : 'Paused',
        initials: (book.title || '??').slice(0, 2).toUpperCase(),
        coverColor: book.coverColor,
        coverStoragePath: book.coverStoragePath ?? null,
      };
      const others = recentBooks
        .filter((b) => b.id !== book.id)
        .sort((a, b) => {
          const aT = a.lastReadAt?.getTime() ?? -1;
          const bT = b.lastReadAt?.getTime() ?? -1;
          return bT - aT;
        })
        .slice(0, 2)
        .map((b) => ({
          id: b.id,
          bookTitle: b.title,
          meta:
            b.progressPercent === 100
              ? 'Finished'
              : b.progressPercent > 0
                ? `${b.progressPercent}% done`
                : 'Not started',
          initials: (b.title || '??').slice(0, 2).toUpperCase(),
          coverColor: b.coverColor,
          coverStoragePath: b.coverStoragePath ?? null,
        }));
      return [activeRow, ...others];
    })(),
    activeRecentId: book.id,
    monthStats,
    onPlayPause: () => {
      // Mirror state to the `listenState` driver so the empty-state
      // mock toggle continues to render correctly during the same
      // session if the user backs out and returns.
      if (audio.isPlaying) {
        audio.pause();
        setListenState('paused');
      } else {
        audio.play();
        setListenState('playing');
      }
      void listenState; // keep linter happy without forcing reads
    },
    onScrubTo: (percent: number) => {
      // Translate the scrub-bar percent (0..100) into seconds and seek.
      // Guard against pre-load duration of 0 — without this the bar can
      // emit a seek before audio is ready and we'd skip to NaN.
      if (dur <= 0) return;
      const target = Math.max(0, Math.min(dur, (percent / 100) * dur));
      void audio.seekTo(target);
    },
    onSkipBack: () => {
      // Outer left = page prev. Clamps to first page.
      const prev = Math.max(0, audio.pageIndex - 1);
      if (prev !== audio.pageIndex) audio.setPageIndex(prev);
    },
    onSkipForward: () => {
      // Outer right = page next. Clamps to last page based on
      // `book.totalPages` (canonical post chapters→pages migration).
      const total = Math.max(1, book.totalPages || 1);
      const next = Math.min(total - 1, audio.pageIndex + 1);
      if (next !== audio.pageIndex) audio.setPageIndex(next);
    },
    onRewind15: () => {
      // Inner left = -15s within the current page.
      void audio.seekTo(Math.max(0, pos - 15));
    },
    onForward15: () => {
      // Inner right = +15s within the current page. Clamp at duration
      // so we don't overshoot — auto-advance handles end-of-page.
      const cap = dur > 0 ? dur : pos + 15;
      void audio.seekTo(Math.min(cap, pos + 15));
    },
    // Speed pill — cycles through the Listen-screen speed set on tap.
    // Direct, instant feedback; no sheet roundtrip. Wrapping at 2× →
    // 0.75× matches the Listen-screen transport's cycleSpeed order.
    onOpenSpeedSheet: () => {
      const order: number[] = [0.75, 1, 1.25, 1.5, 1.75, 2];
      const current = snapSpeed(audio.playbackRate);
      const idx = order.indexOf(current);
      const next = order[(idx + 1) % order.length];
      audio.setPlaybackRate(next);
    },
    // Voice pill — the full picker (with free/Pro split + upsell)
    // lives on the foreground ListenScreen. Expand into that so the
    // user can browse + pick, instead of force-cycling a single
    // voice they may not want.
    onOpenVoiceSheet: () => {
      onExpandToForeground();
    },
    onOpenChaptersSheet: () => {},
    onOpenRecent: (id: string) => {
      // Tap a recent row → switch audio to that book if it's not the
      // active one. Active-book tap is a no-op (already viewing it).
      if (id === book.id) return;
      const target = recentBooks.find((b) => b.id === id);
      if (target) onSwitchBook(target);
    },
    onSeeAllRecent: onOpenHistory,
  };
}

/**
 * Inner shell for the authenticated 'library' stage. Lives inside
 * `<AudioSessionProvider>` so it can subscribe to session changes via
 * `useAudioSession`. Owns:
 *   - tab routing
 *   - "Listen" hand-off from any screen → start session + auto-route to
 *     the Listen tab so the user lands on the player they just kicked off
 *   - the global `MiniPlayer` overlay that floats above the TabBar on
 *     non-Listen tabs while a session is active
 */
/**
 * Live-audio wrapper for the Listen tab's home screen. Reads the
 * full audio session (including positionSeconds / isPlaying), which
 * means this component re-renders 3-4× per second while audio is
 * playing. Isolating that re-render scope here keeps the parent
 * LibraryStage (and every other tab branch) from rebuilding on
 * each tick — they subscribe to the stable slice only.
 */
function ListenHomeWithLiveAudio({
  listenState,
  setListenState,
  books,
  monthStats,
  handleStartListening,
  openHistory,
  lastListenedId,
  onTabChange,
  onExpandToForeground,
}: {
  listenState: ListenPlaybackState;
  setListenState: React.Dispatch<React.SetStateAction<ListenPlaybackState>>;
  books: Book[];
  monthStats: MonthStats;
  handleStartListening: (book: Book) => void;
  openHistory: () => void;
  lastListenedId: string | null;
  onTabChange: (tab: TabKey) => void;
  /** Pops the foreground ListenScreen overlay (where the voice
   * picker + scrub bar live). Wired from LibraryStage. */
  onExpandToForeground: () => void;
}) {
  const audio = useAudioSession();
  const lastListenedBook = (() => {
    const ready = books.filter((b) => b.processingStatus === 'ready');
    if (ready.length === 0) return null;
    if (lastListenedId) {
      const hit = ready.find((b) => b.id === lastListenedId);
      if (hit) return hit;
    }
    const touched = ready.filter(
      (b) => ((b as { last_read_page?: number }).last_read_page ?? 0) > 0,
    );
    if (touched.length > 0) {
      return [...touched].sort((a, b) => {
        const aT = a.lastReadAt?.getTime() ?? -1;
        const bT = b.lastReadAt?.getTime() ?? -1;
        return bT - aT;
      })[0];
    }
    return [...ready].sort((a, b) => {
      const aT = a.addedAt?.getTime() ?? 0;
      const bT = b.addedAt?.getTime() ?? 0;
      return bT - aT;
    })[0];
  })();
  return (
    <ListenHomeScreen
      isPlaying={audio.book !== null}
      nowPlaying={
        audio.book
          ? buildNowPlayingProps(
              audio,
              listenState,
              setListenState,
              books,
              monthStats,
              handleStartListening,
              openHistory,
              onExpandToForeground,
            )
          : undefined
      }
      lastListenedBook={lastListenedBook}
      onResumeListening={handleStartListening}
      onTabChange={onTabChange}
    />
  );
}

function LibraryStage({
  activeTab,
  setActiveTab,
  userName: signupName,
  onSignOut,
  onUpgrade,
  listenState,
  setListenState,
  pendingUploadAssets,
  onPendingUploadAssetsConsumed,
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  userName: string;
  onSignOut: () => Promise<void>;
  onUpgrade: () => void;
  listenState: ListenPlaybackState;
  setListenState: React.Dispatch<React.SetStateAction<ListenPlaybackState>>;
  /** Assets pre-picked during onboarding step 2 OR surfaced by the
   * iOS Share Extension / Android intent handler. LibraryScreen
   * consumes them on mount and kicks the multi-file pipeline
   * immediately. Array (not a single asset) so multi-file shares
   * from the OS share sheet feed in alongside single-asset
   * onboarding picks through one channel. */
  pendingUploadAssets: DocumentPicker.DocumentPickerAsset[] | null;
  /** Clear the pending assets once LibraryScreen has handed them to upload. */
  onPendingUploadAssetsConsumed: () => void;
}) {
  // Subscribe to the stable slice only — book / pageIndex / voice
  // and the imperative setters. We do NOT re-render this whole
  // stage on every audio tick; surfaces that need the live scrub
  // position (the now-playing card on the Listen tab) read the
  // full context from inside their own subcomponent (see
  // `ListenHomeWithLiveAudio` below).
  const audio = useAudioStable();
  // The user's books — used both for the recently-listened slice on the
  // now-playing card and for the See-all history screen. useBooks
  // already fetches + caches at the App scope, so this is cheap.
  const { books } = useBooks();

  // "Book finished processing" local notification. The realtime
  // subscription in useBooks refetches on any books-table change; we
  // detect the transition by comparing this render's processing-status
  // map against the previous render's via a ref. Books that flipped
  // from processing/pending → ready since last render get a one-shot
  // local notification, gated on the user's toggle + OS permission.
  // No-op on first render (the ref is empty) so we don't flood the
  // user with notifications for every already-ready book the first
  // time the library mounts.
  //
  // Both hooks called locally — LibraryStage runs inside BooksProvider
  // so they only fire while the user is signed in, which is exactly
  // when we want the transition detection live.
  const bookFinishedEnabled = useReaderStore((s) => s.notifBookFinishedOn);
  const { granted: bookFinishedGranted } = useNotificationPermission();
  const prevBookStatusRef = useRef<Map<string, string | null>>(new Map());
  useEffect(() => {
    const prev = prevBookStatusRef.current;
    const next = new Map<string, string | null>();
    for (const b of books) {
      next.set(b.id, b.processingStatus ?? null);
      const previousStatus = prev.get(b.id);
      // Skip first-mount and books we haven't seen before. We only
      // want to notify on a genuine transition WITHIN this session,
      // not on backfill from a fresh refetch.
      if (previousStatus === undefined) continue;
      const wasProcessing =
        previousStatus === 'processing' || previousStatus === 'pending';
      const isReady = b.processingStatus === 'ready';
      if (wasProcessing && isReady) {
        void fireBookReadyNotification({
          bookId: b.id,
          title: b.title,
          enabled: bookFinishedEnabled,
          granted: bookFinishedGranted,
        });
      }
    }
    prevBookStatusRef.current = next;
  }, [books, bookFinishedEnabled, bookFinishedGranted]);
  // Persisted "last book the user tapped Listen on" — written by the
  // audio session, read here so the Listen tab's resume card stays
  // visible across app restarts even if the books table's last_read_at
  // hasn't caught up yet. Hydrates async; null until the first read.
  const [lastListenedId, setLastListenedId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readLastListenedBookId().then((id) => {
      if (!cancelled) setLastListenedId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Refresh the cached id whenever the active session changes — when
  // the user starts listening to book B, audio.book becomes B and we
  // should immediately reflect that in the resume slot too (so backing
  // out shows the right card without an app restart).
  useEffect(() => {
    if (audio.book?.id) setLastListenedId(audio.book.id);
  }, [audio.book?.id]);

  // Cold-start session restore. When the app launches and we have a
  // persisted last-listened book id that matches a real library
  // entry, kick off a paused session for it (autoplay=false) so the
  // Listen tab can render the full now-playing UI instead of
  // dropping back to the empty/resume placeholder. The user still
  // has to tap Play to actually hear audio.
  //
  // Guarded by `didColdRestoreRef` so we only auto-restore once per
  // mount — subsequent audio.book changes are user-initiated and we
  // don't want to fight them.
  const didColdRestoreRef = useRef(false);
  useEffect(() => {
    if (didColdRestoreRef.current) return;
    if (audio.book) return; // already have a live session
    if (!lastListenedId) return;
    const match = books.find((b) => b.id === lastListenedId);
    if (!match) return;
    didColdRestoreRef.current = true;
    audio.start(match, { autoplay: false });
  }, [audio, books, lastListenedId]);
  // Real "this month" stats — listening hours / books started / books
  // finished, aggregated from reading_sessions + books. Falls back to
  // zeros until the first fetch resolves (~< 1s on a normal connection).
  const { stats: realMonthStats } = useMonthlyListenStats();
  const monthStats: MonthStats = realMonthStats ?? FALLBACK_MONTH;

  // Plan card on YouScreen — name comes from RevenueCat now (Free vs
  // Standard/Premium per the entitlement). Meters come from data we
  // already have: listening minutes this month from monthStats,
  // books count from useBooks. AI credits aren't metered yet so we
  // report 0 used.
  const { isPro, plan: rcPlan } = useIsPro();
  const planName: YouPlan['name'] = isPro
    ? rcPlan.tier === 'pro' && rcPlan.period === 'lifetime'
      ? 'Premium'
      : 'Standard'
    : 'Free';
  const plan: YouPlan = {
    name: planName,
    meters: {
      audio: {
        used: Math.round(monthStats.listeningHours * 60),
        total: FREE_PLAN_LIMITS.audioMinutesPerMonth,
      },
      aiCredits: {
        used: 0,
        total: FREE_PLAN_LIMITS.aiCreditsPerMonth,
      },
      books: {
        used: books.length,
        total: FREE_PLAN_LIMITS.booksTotal,
      },
    },
  };
  // Real user info from Supabase auth + profiles. Falls back to the
  // signup-time name we captured during the auth flow (signupName) so
  // there's no flash of "" while the profiles row is in flight.
  const { user: currentUser } = useCurrentUser();
  const displayName = currentUser.name || signupName || 'there';
  const displayEmail = currentUser.email || '';
  // Sub-route within the Listen tab: when true, render the full
  // recently-listened history list instead of the now-playing card. We
  // could elevate this to a route but a single boolean is enough for
  // the one push currently possible from the Listen tab.
  const [historyOpen, setHistoryOpen] = useState(false);
  // Foreground listen mode (per design 10_listen.html). When true, the
  // full ListenScreen — bimodal page text + audio player at the bottom
  // — overlays the entire stage including the TabBar. When false, audio
  // may still be playing in the background; in that case the MiniPlayer
  // docks above the TabBar on every tab. This is the screen the user
  // tapped "Listen" to reach; the Listen tab is a separate surface
  // (now-playing companion + recently-listened + stats).
  const [listenForeground, setListenForeground] = useState(false);
  // Reader-open flag — driven by LibraryScreen so the global mini
  // player can hide while the user is reading. Without this the bar
  // floats over the reader chrome, distracts from the page, and
  // overlaps the bottom action row.
  const [readerOpen, setReaderOpen] = useState(false);
  // You-sub-view flag — driven by YouScreen so the mini player
  // stays out of focused settings surfaces (Account, Settings,
  // Notifications, etc). Mirrors the readerOpen pattern.
  const [youSubViewOpen, setYouSubViewOpen] = useState(false);
  // Discover-sub-view flag — driven by DiscoverScreen so the mini
  // player hides on the category list and book detail screens, not
  // just the home rails.
  //
  // All these useState calls live ABOVE the listenForeground early
  // return below. Putting them after the early return would make
  // React see a different number of hooks on the render where the
  // user taps Listen ("Rendered fewer hooks than expected" crash).
  const [discoverSubViewOpen, setDiscoverSubViewOpen] = useState(false);

  const handleStartListening = useCallback(
    (book: Book) => {
      audio.start(book);
      // "Listen" on a book opens the foreground listen mode (bimodal).
      // We don't switch tabs — the user stays on whichever tab they
      // were on under the overlay, so backing out returns there.
      setHistoryOpen(false);
      setListenForeground(true);
    },
    [audio],
  );

  // Foreground listen mode — render ListenScreen INSTEAD of the tab
  // shell (rather than overlaying via absolute positioning). This keeps
  // the BottomSheetModalProvider's portal target stack-flat with the
  // ListenScreen content, so sleep / voice / page sheets render above
  // the listen UI without fighting an absolute zIndex.
  if (listenForeground && audio.book) {
    return (
      <ListenScreen
        book={audio.book}
        // Back: dismiss the foreground listening overlay AND switch
        // the active tab to Library so the user lands on their book
        // shelf instead of whatever screen launched the session
        // (often the Reader, which would just feel like "going
        // backward" rather than "exiting playback"). The audio
        // session itself stays alive — playback continues, the
        // MiniPlayer surfaces over Library, and tapping it expands
        // back into ListenScreen.
        //
        // Minimize: same dismiss without the tab swap — used for
        // the in-screen chevron-down that says "shrink to mini
        // player but stay where I am". (Currently same closure as
        // onBack at the parent, but kept distinct so we can diverge
        // if minimize ever needs different behaviour.)
        onBack={() => {
          setListenForeground(false);
          setActiveTab('library');
        }}
        onMinimize={() => setListenForeground(false)}
      />
    );
  }

  return (
    <View style={styles.stageRoot}>
      {activeTab === 'library' && (
        <LibraryScreen
          onTabChange={setActiveTab}
          userName={displayName}
          onUpgrade={onUpgrade}
          onStartListening={handleStartListening}
          onReaderOpenChange={setReaderOpen}
          pendingUploadAssets={pendingUploadAssets}
          onPendingUploadAssetsConsumed={onPendingUploadAssetsConsumed}
        />
      )}
      {activeTab === 'you' && (
        <YouScreen
          profile={{
            name: displayName,
            email: displayEmail,
            avatarUrl: currentUser.avatarUrl,
          }}
          plan={plan}
          onTabChange={setActiveTab}
          onSignOut={onSignOut}
          onSubViewOpenChange={setYouSubViewOpen}
        />
      )}
      {activeTab === 'discover' && (
        <DiscoverScreen
          onTabChange={setActiveTab}
          onSubViewOpenChange={setDiscoverSubViewOpen}
        />
      )}
      {activeTab === 'listen' && historyOpen && (
        <ListenHistoryScreen
          activeBookId={audio.book?.id ?? null}
          onBack={() => setHistoryOpen(false)}
          onPlay={(b) => {
            // Tap a row → start (or resume) audio for that book and
            // close the history overlay.
            audio.start(b);
            setHistoryOpen(false);
          }}
        />
      )}
      {activeTab === 'listen' && !historyOpen && (
        <ListenHomeWithLiveAudio
          listenState={listenState}
          setListenState={setListenState}
          books={books}
          monthStats={monthStats}
          handleStartListening={handleStartListening}
          openHistory={() => setHistoryOpen(true)}
          lastListenedId={lastListenedId}
          onTabChange={setActiveTab}
          onExpandToForeground={() => setListenForeground(true)}
        />
      )}

      {/* Global MiniPlayer — visible on Library and Discover-home only.
          Hidden on:
          - Listen tab (the full now-playing card already lives there)
          - You tab — and every drill-in inside it (Account, Settings,
            Notifications, …) — focused settings / profile shouldn't
            share the screen with floating audio chrome
          - Any tab while the foreground ListenScreen overlay is up
          - Any tab while a reader is open (PDF / EPUB full / EPUB
            text) — the floating bar overlaps the reader's bottom
            action row and competes with the page for attention.
          - Any drill-in inside the Discover tab (category list, book
            detail) — same focus reasoning. */}
      {audio.book &&
        !listenForeground &&
        !readerOpen &&
        !youSubViewOpen &&
        !discoverSubViewOpen &&
        activeTab !== 'listen' &&
        activeTab !== 'you' && (
          <View style={styles.miniPlayerOverlay} pointerEvents="box-none">
            <MiniPlayer onExpand={() => setListenForeground(true)} />
          </View>
        )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  stageRoot: {
    flex: 1,
  },
  // The overlay is anchored to the bottom of the stage; the inner
  // MiniPlayer adds its own padding to clear the TabBar (~56px content +
  // safe-area). pointerEvents box-none on the wrapper means tapping the
  // tab bar still goes through.
  //
  // No explicit zIndex — gorhom BottomSheetModal renders its own
  // backdrop + sheet via Portal. With an explicit zIndex on this
  // overlay, the mini bar paints over the bottom sheet. Letting the
  // platform stack-order win (bottom sheets are inserted later in the
  // tree) means the sheet visibly covers the mini bar, which is what
  // the user expects from a modal.
  miniPlayerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
