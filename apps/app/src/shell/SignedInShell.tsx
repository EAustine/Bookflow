/**
 * The signed-in shell.
 *
 * Moved out of `App.tsx` in M2, **unchanged**. This is `LibraryStage`
 * and its `ListenHomeWithLiveAudio` helper, lifted wholesale rather
 * than rewritten.
 *
 * Deliberately a move and not a redesign. The shell owns the audio
 * session, the mini-player overlay, the share-intent hand-off and the
 * four tab screens, and **none of it is reachable without a signed-in
 * account** — which this environment does not have. Rewriting code I
 * cannot run would be guessing. M3 decomposes it into `features/*`
 * where the data layer lands and where it can be tested.
 *
 * What M2 does change: `activeTab` is no longer state owned here. The
 * route is the source of truth, and `(tabs)/_layout.tsx` passes the
 * current route down as `activeTab`. Everything else is as it was.
 */
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
import { useShellChromeStore } from '~/stores/shellChrome';
import { SideRail } from '~/components/SideRail';
import { useSizeClass } from '~/hooks/useSizeClass';
import { useFonts } from 'expo-font';
import * as Linking from 'expo-linking';
import * as DocumentPicker from 'expo-document-picker';
import { useShareIntent } from 'expo-share-intent';
import {
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  Geist_400Regular,
  Geist_500Medium,
} from '@expo-google-fonts/geist';
import { Lexend_400Regular } from '@expo-google-fonts/lexend';
import { Literata_400Regular } from '@expo-google-fonts/literata';
import { installRejectionTracker } from '~/lib/installRejectionTracker';
import {
  useIsPro,
  ENTITLEMENT_PRO,
} from '~/features/billing';
import {
  fireBookReadyNotification,
  installNotificationHandler,
  useNotificationPermission,
  useStreakWarningSync,
} from '~/lib/notifications';
import { PLAYBACK_SPEEDS, useReaderStore } from '~/stores/readerStore';
import type { Speed } from '@bookflow/shared/src';

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
} from '~/features/auth';
import { supabase } from '~/lib/supabase';
import type { TabKey } from '~/components';
import { AuthCallbackScreen } from '~/features/auth';
import { DiscoverScreen } from '~/features/discover';
import { ListenHistoryScreen } from '~/features/listen';
import { ListenHomeScreen } from '~/features/listen';
import { ListenScreen, MiniPlayer, RailMiniPlayer } from '~/features/listen';
import {
  AudioSessionProvider,
  clearLastListenedBookId,
  readLastListenedBookId,
  useAudioSession,
  useAudioStable,
} from '~/features/listen';
import { VOICE_OPTIONS } from '~/features/listen';
import { BooksProvider, useBooks } from '~/hooks/useBooks';
import { useBackHandler } from '~/lib/useBackHandler';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useMonthlyListenStats } from '~/features/reader';
import {
  useMonthlyAiUsage,
  useMonthlyAudioUsage,
  usePurchasedBalances,
} from '~/features/ai';
import {
  type ListenPlaybackState,
  type MonthStats,
} from '~/features/listen';
import type { Book } from '~/types/book';
// PaywallPlanScreen (custom mockup) retired — all upgrade entry points
// now use RevenueCat's hosted paywall via presentPaywall(). The custom
// screen never wired its CTA to a purchase; the hosted paywall handles
// purchase / restore / localized pricing / store-compliance copy.
import { LibraryScreen } from '~/features/library';
import { clearReaderImageSignedUrlCache } from '~/features/reader';
import {
  OnboardingFirstBookScreen,
  type FirstBookSelection,
} from '~/features/auth';
import { importDiscoverBook } from '~/features/discover';
import { OnboardingIntentScreen, type OnboardingIntent } from '~/features/auth';
import { SignInScreen } from '~/features/auth';
import { SignUpScreen } from '~/features/auth';
import { SplashScreen } from '~/features/auth';
import { WelcomeScreen } from '~/features/auth';
import { YouScreen, type YouPlan, type YouProfile } from '~/features/account';

/**
 * The top-level navigation states. There is no router: `stage` is the
 * whole machine, and each stage renders one screen (see the JSX below).
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

export function SignedInShell({
  activeTab,
  setActiveTab,
  userName: signupName,
  onSignOut,
  onUpgrade,
  listenState,
  setListenState,
  pendingUploadAssets,
  onPendingUploadAssetsConsumed,
  youDrillHandlers,
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
  /**
   * Route pushes for the You tab's drill-ins, supplied by
   * `(tabs)/_layout.tsx`.
   *
   * Passed in rather than built here so this file stays router-free —
   * it is a verbatim move of `App.tsx`'s `LibraryStage`, and keeping it
   * that way is what makes the move reviewable against untestable code.
   */
  youDrillHandlers: {
    /** Absent for now — see the note in (tabs)/_layout.tsx. YouScreen
     *  falls back to its internal view, which is the shipped behaviour. */
    onAccountAndSubscription?: () => void;
    onSettings: () => void;
    onReadingDisplay: () => void;
    onDefaultVoice: () => void;
    onTranslationLanguage: () => void;
    onNotifications: () => void;
    onHelp: () => void;
    onSendFeedback: () => void;
  };
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
  const { stats: realMonthStats, refetch: refetchMonthStats } =
    useMonthlyListenStats();
  const monthStats: MonthStats = realMonthStats ?? FALLBACK_MONTH;
  // Real AI-credit usage this month (server-maintained counter on profiles).
  const { used: aiCreditsUsed, refresh: refreshAiUsage } = useMonthlyAiUsage();
  // Real audio usage this month (minutes) — same server counter the
  // generate-audio function enforces against.
  const { usedMinutes: audioUsedMin, refresh: refreshAudioUsage } =
    useMonthlyAudioUsage();
  // Purchased top-up balances (audio minutes + AI credits), shown on the plan
  // card's "Top-up balance" block.
  const balances = usePurchasedBalances();
  const refreshBalances = balances.refresh;

  // One place to re-read every plan-card data source — drives the You-tab
  // pull-to-refresh AND a refresh on tab entry (these hooks live in this
  // always-mounted stage, so they don't re-read on their own when the user
  // opens the tab — only on app-foreground). Cached/replayed audio never moves
  // the audio meter; only NEW narration does, the thing the cap protects.
  const refreshYou = useCallback(async () => {
    refreshAiUsage();
    refreshAudioUsage();
    refreshBalances();
    await refetchMonthStats();
  }, [refreshAiUsage, refreshAudioUsage, refreshBalances, refetchMonthStats]);

  useEffect(() => {
    if (activeTab === 'you') void refreshYou();
  }, [activeTab, refreshYou]);

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
  // Pro unlocks unlimited audio + library and a 10× AI-credit cap, so the
  // plan meters reflect that instead of the free caps. Infinity renders as
  // "Unlimited" in the meter UI; the 500K AI credits match the paywall copy.
  const planLimits = isPro
    ? {
        audioMinutesPerMonth: Infinity,
        aiCreditsPerMonth: 500_000,
        booksTotal: Infinity,
      }
    : FREE_PLAN_LIMITS;
  const plan: YouPlan = {
    name: planName,
    meters: {
      audio: {
        used: audioUsedMin,
        total: planLimits.audioMinutesPerMonth,
      },
      aiCredits: {
        used: aiCreditsUsed,
        total: planLimits.aiCreditsPerMonth,
      },
      books: {
        used: books.length,
        total: planLimits.booksTotal,
      },
    },
    balances,
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
  /**
   * A book Discover asked us to open in the reader. The reader is a
   * route inside the Library stage, so "Read now" on the wide book
   * detail crosses here: we switch tabs and hand the id over, and
   * `LibraryScreen` clears it once it has acted.
   */
  const [pendingReadBookId, setPendingReadBookId] = useState<string | null>(null);
  // Discover-sub-view flag — driven by DiscoverScreen so the mini
  // player hides on the category list and book detail screens, not
  // just the home rails.
  //
  // All these useState calls live ABOVE the listenForeground early
  // return below. Putting them after the early return would make
  // React see a different number of hooks on the render where the
  // user taps Listen ("Rendered fewer hooks than expected" crash).
  const [discoverSubViewOpen, setDiscoverSubViewOpen] = useState(false);

  // Same rule as the useState calls above: a hook, so it has to sit
  // above the listenForeground early return.
  const { isWide, sizeClass } = useSizeClass();

  /**
   * No rail: a screen is covering the shell rather than sitting in it.
   *
   * All three readers (§2 — "no rail at any size"), the foreground
   * Listen overlay, and the You drill-ins.
   *
   * **A Discover drill-in is deliberately not one.** §4 says "Book
   * detail is a page in the content area, not a sheet or panel", and
   * every wide Book detail frame draws the rail beside it — including
   * the Desktop one, with the rail mini player in place. It used to be
   * grouped with the takeovers here, which left the wide detail page
   * running edge to edge with no navigation.
   *
   * **Nor is a You sub-page**, as of M6. Every wide You frame draws the
   * rail, Medium included, and above Compact the page renders inside
   * the content column rather than pushing over the shell. The old
   * `youSubViewOpen` flag that hid the rail here is gone: the mini
   * player it also suppressed has its own `activeTab !== 'you'` guards
   * below, and Compact has no rail to hide.
   */
  const railHidden = listenForeground || readerOpen;

  /**
   * No mini player. The takeovers above plus the Discover drill-ins:
   * the floating bar competes with a focused page on a phone, and the
   * rail's own card covers Desktop. The mini player adds two more
   * conditions of its own below, for the Listen and You tabs.
   */
  const chromeHidden = railHidden || discoverSubViewOpen;

  /**
   * Publish whether the rail is on screen, so the toast — mounted at
   * the window root, outside this tree — can centre over the content
   * area rather than the window (§4). Same condition the rail renders
   * on below.
   */
  const railVisible = isWide && !railHidden;
  const setRailVisible = useShellChromeStore((s) => s.setRailVisible);
  useEffect(() => {
    setRailVisible(railVisible);
  }, [railVisible, setRailVisible]);

  const handleStartListening = useCallback(
    (book: Book) => {
      // No client-side audio gate: playing already-narrated audio (cached or
      // downloaded) is free and unlimited. The only thing that costs money —
      // generating NEW narration — is capped server-side in generate-audio,
      // which returns audio_limit_reached per uncached page; useAudio surfaces
      // the paywall there. So a user past their generation cap can still start
      // any listen and play anything already narrated; only an uncached page
      // prompts the upgrade, exactly when the cost would be incurred.
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
    <View style={[styles.stageRoot, isWide && styles.stageRootWide]}>
      {/* Primary nav above Compact (§2). Suppressed only by the real
          takeovers — see `railHidden`. A Discover drill-in keeps it,
          because the book detail is a page in the content area. */}
      {isWide && !railHidden && (
        <SideRail
          activeTab={activeTab}
          onChange={setActiveTab}
          expanded={sizeClass === 'desktop'}
          /* Desktop swaps the bar along the bottom of the content for
             a card at the foot of the rail. Same gates as the bar, so
             the two can never both be on screen. */
          footer={
            sizeClass === 'desktop' &&
            audio.book &&
            activeTab !== 'listen' &&
            activeTab !== 'you' ? (
              <RailMiniPlayer onExpand={() => setListenForeground(true)} />
            ) : null
          }
        />
      )}
      <View style={styles.contentColumn}>
      {activeTab === 'library' && (
        <LibraryScreen
          onTabChange={setActiveTab}
          userName={displayName}
          onUpgrade={onUpgrade}
          onStartListening={handleStartListening}
          onReaderOpenChange={setReaderOpen}
          pendingUploadAssets={pendingUploadAssets}
          onPendingUploadAssetsConsumed={onPendingUploadAssetsConsumed}
          openBookId={pendingReadBookId}
          onOpenBookConsumed={() => setPendingReadBookId(null)}
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
          onUpgrade={onUpgrade}
          onTabChange={setActiveTab}
          onSignOut={onSignOut}
          {...youDrillHandlers}
          onRefresh={refreshYou}
        />
      )}
      {activeTab === 'discover' && (
        <DiscoverScreen
          onTabChange={setActiveTab}
          onSubViewOpenChange={setDiscoverSubViewOpen}
          onReadBook={(book) => {
            setPendingReadBookId(book.id);
            setActiveTab('library');
          }}
          onListenToBook={handleStartListening}
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
            detail) — same focus reasoning.
          - Desktop, where the rail shows the card version instead. */}
      {audio.book &&
        !chromeHidden &&
        sizeClass !== 'desktop' &&
        activeTab !== 'listen' &&
        activeTab !== 'you' && (
          <View style={styles.miniPlayerOverlay} pointerEvents="box-none">
            <MiniPlayer onExpand={() => setListenForeground(true)} />
          </View>
        )}
      </View>
    </View>
  );
}



// Lifted from App.tsx with the shell, unchanged.

const FALLBACK_MONTH: MonthStats = {
  listeningHours: 0,
  listeningHoursDelta: undefined,
  booksStarted: 0,
  booksFinished: 0,
  audioRemainingMin: 60,
  audioResetLabel: undefined,
};

// Free-tier plan limits. Real RevenueCat-driven entitlements would
// override these; until then we report a static "Free" plan with these
// caps so the YouScreen progress meters look correct against actual
// usage data we DO have (books count, audio generated this month).
// audioMinutesPerMonth is the monthly NEW-narration (generation) allowance —
// cached + downloaded playback is free and uncapped (server enforces this).

const FREE_PLAN_LIMITS = {
  audioMinutesPerMonth: 60,
  aiCreditsPerMonth: 50_000,
  booksTotal: 5,
};

LogBox.ignoreLogs(['props.pointerEvents is deprecated']);

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
    // Falls back to the free voice. Was 'Rachel' — not one of the six
    // voices the app ships, so the fallback could only ever render a
    // name that does not exist (F-16).
    VOICE_OPTIONS.find((v) => v.id === audio.voiceId)?.label ?? 'Aria';

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
    // Speed pill — opens the picker the screen hosts beside it. It
    // used to cycle the set on tap, which meant the same control
    // behaved differently here and on the foreground player, and gave
    // no way to see or choose a speed.
    onSpeedChange: (next: Speed) => audio.setPlaybackRate(next),
    // Voice pill — the full picker (with free/Pro split + upsell)
    // lives on the foreground ListenScreen. Expand into that so the
    // user can browse + pick, instead of force-cycling a single
    // voice they may not want.
    onOpenVoiceSheet: () => {
      onExpandToForeground();
    },
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

const styles = StyleSheet.create({
  stageRoot: {
    flex: 1,
  },
  /** Rail beside content, rather than content alone. */
  stageRootWide: {
    flexDirection: 'row',
  },
  contentColumn: {
    flex: 1,
  },
  /**
   * Absolute within the content column, not the whole shell. On a phone
   * the two are the same box; above Compact this is what keeps the bar
   * out from under the rail and puts it "along the bottom of the
   * content", which is what §2 asks for on Medium and Expanded.
   */
  miniPlayerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});


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

function snapSpeed(rate: number): import('~/features/listen').Speed {
  // Single source of truth — see F-7. Previously a local literal that
  // included 3×, a speed the store rejected.
  const allowed: import('~/features/listen').Speed[] = [
    ...PLAYBACK_SPEEDS,
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
