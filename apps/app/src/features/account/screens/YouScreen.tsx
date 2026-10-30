/**
 * YouScreen — the "You" tab.
 *
 * Profile + plan + settings gateway, per
 * /Users/completefarmer/Downloads/you_tab.html (Batch 3).
 *
 * Architecture:
 *   - Self-contained presentational screen. The caller (`SignedInShell`)
 *     supplies `profile`, `plan`, `onSignOut`, and `onTabChange`.
 *     Sign-out's actual `supabase.auth.signOut()` call lives in
 *     `useShellSession` so the routing back to Welcome lives in one place.
 *   - The sign-out confirmation is a stacked-CTA bottom sheet, per design
 *     rule #2 (confirmation sheets always stack, never side-by-side) and
 *     rule #5 (destructive actions always trigger a confirmation sheet,
 *     never fire on tap).
 *   - Plan-card meters auto-promote their fill to amber at ≥80% usage so
 *     users get a soft "running low" cue without a dark-pattern nudge.
 *
 * Responsive shape (M6, §4 "You & Settings"):
 *   - **Compact** keeps the router. A row calls the shell's handler and
 *     the page pushes over the whole shell, as it always has.
 *   - **Medium** is one 600 column, centred, and the page replaces home
 *     inside it with the Sub header's back button.
 *   - **Expanded and Desktop** are master and detail: the 440 master is
 *     always this screen's own body, and the page fills a 560 column in
 *     the pane beside it. The back button is gone there because the
 *     master is the way out, so a page is always open — §8 leaves a
 *     separate wide You home out for exactly that reason, and the
 *     default is Reading display.
 *
 * So above Compact the tab renders the pages itself rather than letting
 * them push. They are the same components the routes mount, given a
 * different container and no `onBack` — not a second copy.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { pollBalanceAfterPurchase } from '~/features/ai';
import { AccountScreen } from './AccountScreen';
import { HelpFAQScreen } from './HelpFAQScreen';
import { SettingsScreen } from './SettingsScreen';
import { DefaultVoiceScreen, NotificationsScreen, ReadingDisplayScreen, SendFeedbackScreen, TranslationLanguageScreen } from './YouDrillScreens';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TRANSLATION_LANGUAGE_LABELS,
  useReaderStore,
} from '~/stores/readerStore';
import { VOICE_OPTIONS } from '~/features/listen';
import {
  ConfirmSheetBody,
  Presenter,
  type PresenterRef,
  TabBar,
  type TabKey,
} from '~/components';
import { useSizeClass } from '~/hooks/useSizeClass';
import { YouHomeBody } from '../components';
import {
  YOU_DEFAULT_PAGE,
  type YouPage,
  type YouPlan,
  type YouProfile,
} from '../types';
import {
  BuyCreditsSheet,
  type BuyCreditsSheetRef,
  TopupBalancePage,
  type TopupKind,
} from '~/features/billing';
import { tokens } from '~/design/tokens';
import {
  presentPaywall,
  openManageSubscription,
  ENTITLEMENT_PRO,
} from '~/features/billing';

// ============================================================================
// TYPES
// ============================================================================

// `YouProfile`, `YouPlan` and `YouPlanName` moved to `../types` in M6 so
// the extracted components could use them without importing back into
// this screen. Re-exported here because every call site imports them
// from the feature barrel, which re-exports this file.
export type {
  YouPlan,
  YouPlanName,
  YouProfile,
} from '../types';

export type YouScreenProps = {
  profile: YouProfile;
  plan: YouPlan;
  onTabChange: (tab: TabKey) => void;
  onSignOut: () => Promise<void> | void;
  // Drill-in handlers. Wired to routes by `app/(tabs)/you.tsx` as of M2.
  //
  // Optional, each falling back to the internal `view` state, so the
  // screen still works standalone — which is what made the migration
  // additive rather than a rewrite. The fallbacks are dead in the app
  // now; they are kept until the drill-ins are verified against a
  // signed-in account, because they are the cheapest possible revert.
  onAccountAndSubscription?: () => void;
  onReadingDisplay?: () => void;
  onDefaultVoice?: () => void;
  onTranslationLanguage?: () => void;
  onSettings?: () => void;
  onNotifications?: () => void;
  onHelp?: () => void;
  onSendFeedback?: () => void;
  onUpgrade?: () => void;
  // Display-only hints for the Reading section's trailing values.
  readingDisplayHint?: string;
  defaultVoiceHint?: string;
  translationLanguageHint?: string;
  appVersion?: string;
  /** Pull-to-refresh — re-reads the plan-card meters, balances, and stats. */
  onRefresh?: () => Promise<void> | void;
};

// Sensible defaults so the screen still reads nicely if a hint isn't wired.
const DEFAULTS = {
  readingDisplayHint: 'Literata · M',
  defaultVoiceHint: 'Aria',
  translationLanguageHint: 'English',
  appVersion: 'Bookflow 0.1.0 · Build 1',
} as const;

// ============================================================================
// SCREEN
// ============================================================================

export function YouScreen({
  profile,
  plan,
  onTabChange,
  onSignOut,
  onAccountAndSubscription,
  onReadingDisplay,
  onDefaultVoice,
  onTranslationLanguage,
  onSettings,
  onNotifications,
  onHelp,
  onSendFeedback,
  onUpgrade,
  readingDisplayHint = DEFAULTS.readingDisplayHint,
  defaultVoiceHint = DEFAULTS.defaultVoiceHint,
  translationLanguageHint = DEFAULTS.translationLanguageHint,
  appVersion = DEFAULTS.appVersion,
  onRefresh,
}: YouScreenProps) {
  const [refreshing, setRefreshing] = useState(false);
  const handlePullRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  // Resolve the upgrade handler once. Prefer the parent-provided handler
  // (App wires it to presentPaywall); if a caller ever forgets to thread
  // it, fall back to presenting the hosted paywall directly so the
  // Upgrade button can NEVER silently no-op. This is exactly what bit the
  // You tab + Account screen before — `onUpgrade` was optional and
  // defaulted to `() => {}`, so every Upgrade tap here did nothing.
  const handleUpgrade = useCallback(() => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    void presentPaywall({ requiredEntitlement: ENTITLEMENT_PRO }).catch(() => {
      // presentPaywall throws when RC is disabled / has no offering; the
      // helper already surfaces a friendly Alert, so swallow here.
    });
  }, [onUpgrade]);

  // "Manage plan" for an already-subscribed user. NOT the paywall —
  // presentPaywallIfNeeded no-ops when the entitlement is already active,
  // which is exactly why the old "Manage plan" button did nothing. Deep-
  // links to the Google Play subscriptions page (cancel / change plan).
  const handleManage = useCallback(() => {
    void openManageSubscription();
  }, []);

  const sheetRef = useRef<PresenterRef>(null);
  /**
   * The tab's one buy modal. `TopupBalanceBlock` used to mount its own
   * at each of its four call sites, so a free You tab held five at
   * once; every host now opens this one instead.
   */
  const buyCreditsRef = useRef<BuyCreditsSheetRef>(null);
  const openBuyCredits = useCallback(
    (kind?: TopupKind) => buyCreditsRef.current?.present(kind),
    [],
  );
  const [signingOut, setSigningOut] = useState(false);

  const { sizeClass, isWide } = useSizeClass();
  /**
   * Master and detail, not just "has a rail". Medium keeps one column
   * and swaps the page in; only Expanded and Desktop show both at once.
   * Library draws the same distinction by falling through its Compact
   * and Medium branches.
   */
  const masterDetail = sizeClass === 'expanded' || sizeClass === 'desktop';

  const [page, setPage] = useState<YouPage>(
    masterDetail ? YOU_DEFAULT_PAGE : 'home',
  );

  /**
   * There is no wide You home, so arriving at — or resizing into —
   * Expanded has to open something. Resizing the other way keeps
   * whatever is open and lets it grow a back button, which is the less
   * surprising half: the user loses the master, not their place.
   */
  useEffect(() => {
    if (masterDetail && page === 'home') setPage(YOU_DEFAULT_PAGE);
  }, [masterDetail, page]);

  /**
   * Opening a page. Above Compact this screen renders it, so the row
   * sets local state; on Compact the shell's router handler pushes it.
   * Same inversion as `LibraryScreen`'s master rows, which choose
   * between filling the pane and replacing the screen on `isWide`.
   */
  const openPage = useCallback(
    (next: YouPage) => () => {
      if (isWide) {
        setPage(next);
        return;
      }
      // Compact: hand it to the shell's router. The `?? setPage`
      // fallbacks are what made the M2 route migration additive, and
      // they still cover a caller that mounts this screen standalone.
      const route = {
        home: undefined,
        account: onAccountAndSubscription,
        settings: onSettings,
        reading: onReadingDisplay,
        voice: onDefaultVoice,
        language: onTranslationLanguage,
        notifications: onNotifications,
        // No route of its own. Figma draws Top-up balance as a page at
        // every size, phone included, so this falls through to local
        // state rather than pushing — which is also what the "Buy
        // credits" row's chevron has always promised.
        topup: undefined,
        help: onHelp,
        feedback: onSendFeedback,
      }[next];
      if (route) route();
      else setPage(next);
    },
    [
      isWide,
      onAccountAndSubscription,
      onSettings,
      onReadingDisplay,
      onDefaultVoice,
      onTranslationLanguage,
      onNotifications,
      onHelp,
      onSendFeedback,
    ],
  );

  // Live preference labels for the trailing hints in the Reading
  // section. Reading the store here means the hint reflects the
  // user's current choice without prop drilling.
  const fontFamily = useReaderStore((s) => s.fontFamily);
  const fontSize = useReaderStore((s) => s.fontSize);
  const translationLanguage = useReaderStore((s) => s.translationLanguage);
  const defaultVoiceId = useReaderStore((s) => s.defaultVoiceId);
  const liveReadingHint = `${
    fontFamily === 'serif' ? 'Literata' : fontFamily === 'lexend' ? 'Lexend' : 'Sans'
  } · ${fontSize}px`;
  const liveVoiceHint =
    VOICE_OPTIONS.find((v) => v.id === defaultVoiceId)?.label ?? 'Rachel';
  const liveLanguageHint = TRANSLATION_LANGUAGE_LABELS[translationLanguage];

  const presentSignOutSheet = useCallback(() => {
    sheetRef.current?.present();
  }, []);

  const dismissSheet = useCallback(() => {
    if (signingOut) return; // Don't let Cancel cancel an in-flight sign-out
    sheetRef.current?.dismiss();
  }, [signingOut]);

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
      // Parent unmounts us by routing to Welcome; the dismiss is mostly a
      // safety net in case the parent decides to keep us mounted.
      sheetRef.current?.dismiss();
    } finally {
      setSigningOut(false);
    }
  }, [onSignOut, signingOut]);

  /**
   * The open page. The same components the routes mount, with `onBack`
   * only where there is somewhere to go back to: Medium replaces home
   * so it gets one, and above Medium the master is still beside it so
   * it does not. Edit profile is the exception and lives inside
   * `AccountScreen`, which keeps its own back button at every size
   * because the master has no row for it.
   */
  const back = masterDetail ? undefined : () => setPage('home');
  let pageNode: ReactNode = null;
  switch (page) {
    case 'home':
      break;
    case 'settings':
      pageNode = (
        <SettingsScreen
          onBack={back}
          onReadingDisplay={openPage('reading')}
          onDefaultVoice={openPage('voice')}
          onTranslationLanguage={openPage('language')}
        />
      );
      break;
    case 'reading':
      pageNode = <ReadingDisplayScreen onBack={back} />;
      break;
    case 'voice':
      pageNode = <DefaultVoiceScreen onBack={back} />;
      break;
    case 'language':
      pageNode = <TranslationLanguageScreen onBack={back} />;
      break;
    case 'notifications':
      pageNode = <NotificationsScreen onBack={back} />;
      break;
    case 'help':
      // HelpFAQScreen (search-enabled, 30 questions across 6 sections)
      // replaces the previous 5-question HelpScreen stub in
      // YouDrillScreens. Same onBack contract so the navigation
      // shape is unchanged.
      pageNode = <HelpFAQScreen onBack={back} />;
      break;
    case 'feedback':
      pageNode = <SendFeedbackScreen onBack={back} />;
      break;
    case 'topup':
      pageNode = (
        <TopupBalancePage
          balances={plan.balances}
          onBuy={openBuyCredits}
          onBack={back}
        />
      );
      break;
    case 'account':
      pageNode = (
        <AccountScreen
          profile={profile}
          plan={plan}
          onBack={back}
          onSignOut={onSignOut}
          onUpgrade={handleUpgrade}
          onBuyCredits={openBuyCredits}
        />
      );
      break;
  }

  const home = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullRefresh}
            tintColor={tokens.colors.forest[800]}
            colors={[tokens.colors.forest[800]]}
          />
        ) : undefined
      }
    >
      <YouHomeBody
        profile={profile}
        plan={plan}
        openPage={openPage}
        activePage={masterDetail ? page : null}
        onBuyCredits={openBuyCredits}
        onSignOut={presentSignOutSheet}
        onUpgrade={handleUpgrade}
        onManagePlan={handleManage}
        readingHint={liveReadingHint}
        voiceHint={liveVoiceHint}
        languageHint={liveLanguageHint}
        appVersion={appVersion}
      />
    </ScrollView>
  );

  /**
   * Compact: the page, when one is open at all, replaces the whole
   * screen including the tab bar — the shape the router already gives
   * every drill-in, kept for the fallback path.
   */
  let stage: ReactNode;
  if (!isWide) {
    stage = pageNode ?? (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        {home}
        <TabBar activeTab="you" onChange={onTabChange} />
      </SafeAreaView>
    );
  } else if (!masterDetail) {
    // Medium: one 600 column, centred in the content area the shell
    // leaves beside the rail. The page swaps in for home.
    //
    // The safe area is applied per child, not around the stage. Every
    // page component brings its own `SafeAreaView` — they were all
    // top-level screens before this — and `react-native-safe-area-
    // context` does not subtract an inset a parent already applied, so
    // wrapping them adds the status bar twice. Measured on device: the
    // Sub header sat 24 low. `LibraryBookPane` avoids this by having
    // no safe area of its own; these pages cannot, because the router
    // still mounts them bare on Compact.
    stage = (
      <View style={styles.stage}>
        <View style={styles.mediumColumn}>
          {pageNode ?? (
            <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
              {home}
            </SafeAreaView>
          )}
        </View>
      </View>
    );
  } else {
    // Expanded and Desktop: 440 master, then the pane. The detail owns
    // the hairline between them, matching `LibraryBookPane`, and insets
    // its 560 column by the page gutter — which is what puts the column
    // at 33 on Expanded and 41 on Desktop.
    stage = (
      <View style={styles.stage}>
        <View style={styles.masterDetail}>
          <SafeAreaView style={styles.master} edges={['top', 'left']}>
            {home}
          </SafeAreaView>
          <View
            style={[
              styles.detail,
              { paddingLeft: tokens.layout.gutter[sizeClass] },
            ]}
          >
            <View style={styles.detailColumn}>{pageNode}</View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      {stage}

      {/* Confirm modal (440) above Compact, sheet on the phone (§3). */}
      <Presenter kind="confirm" ref={sheetRef} enablePanDownToClose={!signingOut}>
        <SignOutSheetBody
          onConfirm={confirmSignOut}
          onCancel={dismissSheet}
          loading={signingOut}
        />
      </Presenter>

      <BuyCreditsSheet
        ref={buyCreditsRef}
        onPurchased={() => pollBalanceAfterPurchase(plan.balances.refresh)}
      />
    </>
  );
}

// ============================================================================
// SIGN-OUT BOTTOM SHEET BODY
// ============================================================================

function SignOutSheetBody({
  onConfirm,
  onCancel,
  loading,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <ConfirmSheetBody
      icon="Logout"
      title="Sign out?"
      body="You'll need to sign back in to access your library and reading progress. Your data stays safe."
      confirmLabel="Sign out"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  /** The same box without a safe area — children apply their own. */
  stage: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: tokens.space.xl,
  },
  /**
   * Tablet portrait: one centred column. The frames put it at 600 in
   * a 748 content area, i.e. 74 either side, which is what centring a
   * 600 cap produces without naming the margin.
   */
  mediumColumn: {
    flex: 1,
    width: '100%',
    maxWidth: tokens.layout.you.medium,
    alignSelf: 'center',
  },
  masterDetail: {
    flex: 1,
    flexDirection: 'row',
  },
  master: {
    width: tokens.layout.pane.master,
  },
  /**
   * The hairline belongs to the detail, not the master — the same way
   * `LibraryBookPane` carries its own `borderLeft`. There is no gap
   * between the columns; the divider is the whole separation.
   */
  detail: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  /** Left aligned after the gutter, not centred in the pane. */
  detailColumn: {
    flex: 1,
    width: '100%',
    maxWidth: tokens.layout.you.detail,
  },
});
