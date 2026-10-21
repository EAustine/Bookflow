/**
 * YouScreen — the "You" tab.
 *
 * Profile + plan + settings gateway, per
 * /Users/completefarmer/Downloads/you_tab.html (Batch 3).
 *
 * Architecture:
 *   - Self-contained presentational screen. Caller (App.tsx) supplies
 *     `profile`, `plan`, `onSignOut`, and `onTabChange`. Sign-out's actual
 *     `supabase.auth.signOut()` call lives in App so the routing back to
 *     Welcome lives in one place.
 *   - The sign-out confirmation is a stacked-CTA bottom sheet, per design
 *     rule #2 (confirmation sheets always stack, never side-by-side) and
 *     rule #5 (destructive actions always trigger a confirmation sheet,
 *     never fire on tap).
 *   - Plan-card meters auto-promote their fill to amber at ≥80% usage so
 *     users get a soft "running low" cue without a dark-pattern nudge.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { pollBalanceAfterPurchase, type PurchasedBalances } from '~/lib/aiUsage';
import { AccountScreen } from '~/screens/AccountScreen';
import { TopupBalanceBlock } from '~/screens/TopupBalanceBlock';
import { HelpFAQScreen } from '~/screens/HelpFAQScreen';
import { SettingsScreen } from '~/screens/SettingsScreen';
import {
  DefaultVoiceScreen,
  NotificationsScreen,
  ReadingDisplayScreen,
  SendFeedbackScreen,
  TranslationLanguageScreen,
} from '~/screens/YouDrillScreens';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  TRANSLATION_LANGUAGE_LABELS,
  useReaderStore,
} from '~/stores/readerStore';
import { VOICE_OPTIONS } from '~/lib/aiAudio';
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  Icon,
  ListRow,
  TabBar,
  type TabKey,
  Text,
} from '~/components';
import { BuyCreditsSheet, type BuyCreditsSheetRef } from '~/screens/BuyCreditsSheet';
import { tokens } from '~/design/tokens';
import {
  presentPaywall,
  openManageSubscription,
  useProSubscriptionDetails,
  ENTITLEMENT_PRO,
} from '~/lib/revenuecat';

// ============================================================================
// TYPES
// ============================================================================

export type YouProfile = {
  name: string;
  email: string;
  /** Resolved public URL of the user's profile picture (from the
   *  `avatars` bucket). Null when the user hasn't uploaded one;
   *  UI falls back to the colored-initials chip in that case. */
  avatarUrl?: string | null;
};

export type YouPlanName = 'Free' | 'Standard' | 'Premium';

export type YouPlan = {
  name: YouPlanName;
  meters: {
    audio: { used: number; total: number }; // minutes
    aiCredits: { used: number; total: number }; // tokens
    books: { used: number; total: number };
  };
  /** Purchased top-up balances, shown below the meters. */
  balances: PurchasedBalances;
};

export type YouScreenProps = {
  profile: YouProfile;
  plan: YouPlan;
  onTabChange: (tab: TabKey) => void;
  onSignOut: () => Promise<void> | void;
  // Drill-in handlers — currently no-ops; wired as M2+ screens land.
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
  /**
   * Fired whenever YouScreen pushes / pops a sub-view (Account &
   * subscription, Settings, Reading display, etc.). App.tsx uses
   * this to hide the global mini-player overlay while the user is
   * deep in their settings — same pattern as `onReaderOpenChange`
   * on LibraryScreen. Top-level "home" view emits `false`.
   */
  onSubViewOpenChange?: (open: boolean) => void;
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
  onSubViewOpenChange,
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

  const sheetRef = useRef<BottomSheetRef>(null);
  const buyCreditsRef = useRef<BuyCreditsSheetRef>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState<
    | 'home'
    | 'account'
    | 'settings'
    | 'reading'
    | 'voice'
    | 'language'
    | 'notifications'
    | 'help'
    | 'feedback'
  >('home');

  // Notify the parent shell when the You tab enters/leaves a drill-in
  // sub-view so the global mini-player overlay can hide. Effect-based
  // so the callback fires both directions without wrapping every
  // setView call site.
  useEffect(() => {
    onSubViewOpenChange?.(view !== 'home');
  }, [view, onSubViewOpenChange]);

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

  if (view === 'settings') {
    return <SettingsScreen onBack={() => setView('home')} />;
  }
  if (view === 'reading') {
    return <ReadingDisplayScreen onBack={() => setView('home')} />;
  }
  if (view === 'voice') {
    return <DefaultVoiceScreen onBack={() => setView('home')} />;
  }
  if (view === 'language') {
    return <TranslationLanguageScreen onBack={() => setView('home')} />;
  }
  if (view === 'notifications') {
    return <NotificationsScreen onBack={() => setView('home')} />;
  }
  if (view === 'help') {
    // HelpFAQScreen (search-enabled, 30 questions across 6 sections)
    // replaces the previous 5-question HelpScreen stub in
    // YouDrillScreens. Same onBack contract so the navigation
    // shape is unchanged.
    return <HelpFAQScreen onBack={() => setView('home')} />;
  }
  if (view === 'feedback') {
    return <SendFeedbackScreen onBack={() => setView('home')} />;
  }
  if (view === 'account') {
    return (
      <AccountScreen
        profile={profile}
        plan={plan}
        onBack={() => setView('home')}
        onSignOut={onSignOut}
        onUpgrade={handleUpgrade}
      />
    );
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
          <PageHeader />
          <ProfileHeader
            profile={profile}
            onPress={() => setView('account')}
          />
          <PlanCard
            plan={plan}
            onUpgrade={handleUpgrade}
            onManage={handleManage}
          />

          <SettingsSection label="Reading">
            <ListRow
              leadingIcon="TextSize"
              label="Reading display"
              hint={liveReadingHint}
              drillsInto
              onPress={onReadingDisplay ?? (() => setView('reading'))}
            />
            <Divider />
            <ListRow
              leadingIcon="Microphone"
              label="Default voice"
              hint={liveVoiceHint}
              drillsInto
              onPress={onDefaultVoice ?? (() => setView('voice'))}
            />
            <Divider />
            <ListRow
              leadingIcon="Globe"
              label="Translation language"
              hint={liveLanguageHint}
              drillsInto
              onPress={onTranslationLanguage ?? (() => setView('language'))}
            />
          </SettingsSection>

          <SettingsSection label="Account">
            <ListRow
              leadingIcon="User"
              label="Account & subscription"
              drillsInto
              onPress={() => setView('account')}
            />
            <Divider />
            <ListRow
              leadingIcon="CreditCard"
              label="Buy credits"
              hint="AI + audio top-ups"
              drillsInto
              onPress={() => buyCreditsRef.current?.present()}
            />
            <Divider />
            <ListRow
              leadingIcon="Settings"
              label="Settings"
              drillsInto
              onPress={() => setView('settings')}
            />
            <Divider />
            <ListRow
              leadingIcon="Bell"
              label="Notifications"
              drillsInto
              onPress={onNotifications ?? (() => setView('notifications'))}
            />
            <Divider />
            <ListRow
              leadingIcon="Logout"
              label="Sign out"
              destructive
              onPress={presentSignOutSheet}
            />
          </SettingsSection>

          <SettingsSection label="Support">
            <ListRow
              leadingIcon="HelpCircle"
              label="Help & FAQ"
              drillsInto
              onPress={onHelp ?? (() => setView('help'))}
            />
            <Divider />
            <ListRow
              leadingIcon="MessageCircle"
              label="Send feedback"
              drillsInto
              onPress={onSendFeedback ?? (() => setView('feedback'))}
            />
          </SettingsSection>

          <Text variant="body-xs" color="disabled" align="center" style={styles.versionFooter}>
            {appVersion}
          </Text>
        </ScrollView>
        <TabBar activeTab="you" onChange={onTabChange} />
      </SafeAreaView>

      <BottomSheet ref={sheetRef} enablePanDownToClose={!signingOut}>
        <SignOutSheetBody
          onConfirm={confirmSignOut}
          onCancel={dismissSheet}
          loading={signingOut}
        />
      </BottomSheet>

      <BuyCreditsSheet
        ref={buyCreditsRef}
        onPurchased={() => pollBalanceAfterPurchase(plan.balances.refresh)}
      />
    </>
  );
}

// ============================================================================
// PAGE HEADER
// ============================================================================

function PageHeader() {
  return (
    <View style={styles.pageHeader}>
      <Text variant="display-md">You</Text>
    </View>
  );
}

// ============================================================================
// PROFILE HEADER (tappable card)
// ============================================================================

function ProfileHeader({
  profile,
  onPress,
}: {
  profile: YouProfile;
  onPress: () => void;
}) {
  const initials = getInitials(profile.name, profile.email);
  // Mirrors AccountScreen's ProfileSection — render the avatar
  // image when present, fall back to initials when the URL is null
  // OR the Image element fails to load (broken signed URL, stale
  // cache, missing object). The `console.warn` on failure tells us
  // the exact URL that broke so we can debug the storage / RLS
  // configuration without guessing.
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showImage = !!profile.avatarUrl && !avatarLoadFailed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${profile.name}, ${profile.email}. Account and subscription`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileCard,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            key={profile.avatarUrl ?? 'no-avatar'}
            source={{ uri: profile.avatarUrl ?? undefined }}
            style={styles.avatarImage}
            resizeMode="cover"
            onError={(e) => {
              console.warn(
                '[avatar/you] failed to load',
                profile.avatarUrl,
                e.nativeEvent?.error,
              );
              setAvatarLoadFailed(true);
            }}
            onLoad={() => setAvatarLoadFailed(false)}
          />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>
      <View style={styles.profileMeta}>
        <Text variant="heading-sm" numberOfLines={1}>
          {profile.name}
        </Text>
        <Text variant="body-sm" color="muted" numberOfLines={1}>
          {profile.email}
        </Text>
      </View>
      <View style={styles.chevronCircle}>
        <Icon name="ChevronRight" size={16} color={tokens.textColors.subtle} />
      </View>
    </Pressable>
  );
}

/**
 * Up to two initials. Falls back to the first 1-2 chars of the email's
 * local part if the name is empty (e.g. a fresh signup before profile
 * is filled).
 */
function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    const initials = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
    if (initials) return initials;
  }
  const local = email.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '·';
}

// ============================================================================
// PLAN CARD
// ============================================================================

function PlanCard({
  plan,
  onUpgrade,
  onManage,
}: {
  plan: YouPlan;
  onUpgrade: () => void;
  onManage: () => void;
}) {
  // Subscribers get the richer two-section card; free users keep the
  // compact meters + upgrade CTA.
  if (plan.name !== 'Free') {
    return <ProPlanCard plan={plan} onManage={onManage} />;
  }

  const audioPct = pct(plan.meters.audio.used, plan.meters.audio.total);
  const aiPct = pct(plan.meters.aiCredits.used, plan.meters.aiCredits.total);
  const booksPct = pct(plan.meters.books.used, plan.meters.books.total);

  return (
    <View style={styles.planCard}>
      <View style={styles.planHeader}>
        <Text style={styles.planLabel}>YOUR PLAN</Text>
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>{plan.name}</Text>
        </View>
      </View>

      <View style={styles.meters}>
        <Meter
          name="Audio"
          value={`${plan.meters.audio.used} / ${plan.meters.audio.total} min`}
          percent={audioPct}
        />
        <Meter
          name="AI credits"
          value={`${formatTokens(plan.meters.aiCredits.used)} / ${formatTokens(
            plan.meters.aiCredits.total,
          )} tokens`}
          percent={aiPct}
        />
        <Meter
          name="Books"
          value={`${plan.meters.books.used} / ${plan.meters.books.total}`}
          percent={booksPct}
        />
      </View>

      <TopupBalanceBlock balances={plan.balances} onDark />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Upgrade to Standard"
        onPress={onUpgrade}
        style={({ pressed }) => [
          styles.upgradeBtn,
          pressed && { backgroundColor: tokens.colors.amber[200] },
        ]}
      >
        <Icon name="Sparkles" size={14} color={tokens.colors.forest[900]} />
        <Text style={styles.upgradeBtnLabel}>Upgrade to Standard</Text>
      </Pressable>
    </View>
  );
}

// ─── Pro plan card — two-section hero design ──────────────────────────────

function ProPlanCard({
  plan,
  onManage,
}: {
  plan: YouPlan;
  onManage: () => void;
}) {
  const { renewalLabel, priceLabel } = useProSubscriptionDetails();
  const renewsLine =
    renewalLabel && priceLabel
      ? `Renews ${renewalLabel} · ${priceLabel}`
      : priceLabel
        ? `Active · ${priceLabel}`
        : renewalLabel
          ? `Renews ${renewalLabel}`
          : 'Active subscription';

  const aiUsed = plan.meters.aiCredits.used;
  const aiTotal = plan.meters.aiCredits.total;
  const aiPct =
    aiTotal > 0 && aiTotal !== Infinity
      ? Math.min(100, (aiUsed / aiTotal) * 100)
      : 0;

  return (
    <View style={styles.proCard}>
      {/* Top — dark forest hero */}
      <View style={styles.proTop}>
        <View style={styles.proLabelRow}>
          <Text style={styles.proEyebrow}>Your plan</Text>
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeLabel}>Active</Text>
          </View>
        </View>
        <Text style={styles.proNameHero}>{plan.name}</Text>
        <Text style={styles.proRenews}>{renewsLine}</Text>
      </View>

      {/* Bottom — cream usage meters */}
      <View style={styles.proBottom}>
        <Text style={styles.proUsageLabel}>This month</Text>

        <View style={styles.proUsageRows}>
          <ProUsageRow
            icon={
              <Icon name="Headphones" size={14} color={tokens.colors.ink[500]} />
            }
            name="Audio"
            unlimited={plan.meters.audio.total === Infinity}
            value={`${plan.meters.audio.used} / ${plan.meters.audio.total} min`}
          />
          <ProUsageRow
            icon={
              <Icon name="Books" size={14} color={tokens.colors.ink[500]} />
            }
            name="Books"
            unlimited={plan.meters.books.total === Infinity}
            value={`${plan.meters.books.used} / ${plan.meters.books.total}`}
          />
          <ProUsageRow
            icon={
              <Icon name="Sparkles" size={14} color={tokens.colors.ink[500]} />
            }
            name="AI credits"
            value={`${formatTokens(aiUsed)} / ${formatTokens(aiTotal)}`}
            percent={aiPct}
            resetLabel={nextResetLabel()}
          />
        </View>

        <TopupBalanceBlock balances={plan.balances} />

        <View style={styles.proDivider} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Manage plan"
          onPress={onManage}
          style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.6 }]}
        >
          <View style={styles.manageLeft}>
            <Icon name="Settings" size={16} color={tokens.colors.ink[500]} />
            <Text style={styles.manageText}>Manage plan</Text>
          </View>
          <Icon
            name="ChevronRight"
            size={14}
            color={tokens.textColors.subtle}
          />
        </Pressable>
      </View>
    </View>
  );
}

function ProUsageRow({
  icon,
  name,
  value,
  unlimited,
  percent,
  resetLabel,
}: {
  icon: ReactNode;
  name: string;
  value?: string;
  unlimited?: boolean;
  percent?: number;
  resetLabel?: string;
}) {
  return (
    <View style={styles.proUsageRow}>
      <View style={styles.proUsageRowTop}>
        <View style={styles.proUsageName}>
          {icon}
          <Text style={styles.proUsageNameText}>{name}</Text>
        </View>
        {unlimited ? (
          <View style={styles.unlimitedChipLight}>
            <Text style={styles.unlimitedChipLightGlyph}>∞</Text>
            <Text style={styles.unlimitedChipLightLabel}>Unlimited</Text>
          </View>
        ) : (
          <Text style={styles.proUsageValue}>{value}</Text>
        )}
      </View>
      {percent !== undefined && (
        <>
          <View style={styles.proUsageTrack}>
            <View
              style={[
                styles.proUsageFill,
                { width: `${Math.max(0, Math.min(100, percent))}%` },
              ]}
            />
          </View>
          {resetLabel ? (
            <Text style={styles.proUsageTrackLabel}>{resetLabel}</Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** "Resets Jul 1" — the first of next month, when monthly allowances roll. */
function nextResetLabel(): string {
  try {
    const d = new Date();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `Resets ${next.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })}`;
  } catch {
    return 'Resets monthly';
  }
}

function Meter({
  name,
  value,
  percent,
  unlimited,
}: {
  name: string;
  value: string;
  percent: number;
  /** Pro tiers have no cap on some meters — render an "Unlimited" chip
   * instead of a progress bar, which would be meaningless. */
  unlimited?: boolean;
}) {
  // Uniform muted-forest fill across every meter (audio / AI / books) so they
  // read as one consistent set, rather than one bar flipping amber at ≥80%.
  const fillColor = tokens.colors.forest[200];
  const clamped = Math.max(0, Math.min(100, percent));

  // Unlimited row: no track. Name on the left, an "Unlimited" chip with
  // an infinity glyph on the right — a clean, intentional treatment
  // rather than a full/empty bar that implies a limit that isn't there.
  if (unlimited) {
    return (
      <View style={styles.meterRowUnlimited}>
        <Text style={styles.meterName}>{name}</Text>
        <View style={styles.unlimitedChip}>
          <Text style={styles.unlimitedChipGlyph}>∞</Text>
          <Text style={styles.unlimitedChipLabel}>Unlimited</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.meterRow}>
      <View style={styles.meterMeta}>
        <Text style={styles.meterName}>{name}</Text>
        <Text style={styles.meterValue}>{value}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${clamped}%`, backgroundColor: fillColor },
          ]}
        />
      </View>
    </View>
  );
}

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return (used / total) * 100;
}

function formatTokens(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

// ============================================================================
// SETTINGS SECTION
// ============================================================================

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsSection}>
      <Text variant="label-sm" color="subtle" style={styles.sectionLabel}>
        {label}
      </Text>
      <View style={styles.listGroup}>{children}</View>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
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
    <View>
      <View style={styles.sheetIconWrap}>
        <Icon name="Logout" size={22} color={tokens.colors.error} />
      </View>
      <Text variant="display-sm" style={styles.sheetTitle}>
        Sign out?
      </Text>
      <Text variant="body-sm" color="muted" style={styles.sheetBody}>
        You'll need to sign back in to access your library and reading
        progress. Your data stays safe.
      </Text>
      <View style={styles.sheetActions}>
        <Button
          label="Sign out"
          variant="destructive"
          size="large"
          fullWidth
          loading={loading}
          onPress={onConfirm}
        />
        <Button
          label="Cancel"
          variant="tertiary"
          size="standard"
          fullWidth
          disabled={loading}
          onPress={onCancel}
        />
      </View>
    </View>
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
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: tokens.space.xl,
  },

  // Page header
  pageHeader: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.md,
  },

  // Profile header card
  profileCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii['2xl'],
    padding: tokens.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
  },
  avatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: tokens.colors.cream[50],
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Plan card
  planCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xl,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii['2xl'],
    padding: tokens.space.lg,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space.md,
  },
  planLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.9,
    color: tokens.colors.forest[200],
  },
  planBadge: {
    backgroundColor: tokens.colors.forest[700],
    borderRadius: tokens.radii.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 3,
  },
  planBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: tokens.colors.forest[100],
  },
  meters: {
    gap: tokens.space.md,
    marginBottom: tokens.space.md,
  },
  meterRow: {
    gap: 5,
  },
  meterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meterName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: tokens.colors.forest[200],
  },
  meterValue: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16,
    color: tokens.colors.forest[200],
    opacity: 0.75,
  },
  meterTrack: {
    height: 4,
    backgroundColor: tokens.overlay.onDark.track,
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },
  // Unlimited (Pro) meter row — no track; a chip on the right instead.
  meterRowUnlimited: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 25,
  },
  unlimitedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.overlay.onDark.chip,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 11,
  },
  unlimitedChipGlyph: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '600',
    color: tokens.colors.cream[50],
  },
  unlimitedChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: tokens.colors.cream[50],
  },
  upgradeBtn: {
    height: 40,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.colors.amber[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.xs,
  },
  upgradeBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },

  // ─── Pro plan card (two-section hero) ──────────────────────────────
  proCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xl,
    borderRadius: tokens.radii['2xl'],
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
  },
  proTop: {
    backgroundColor: tokens.colors.forest[800],
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
  },
  proLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  proEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: tokens.colors.forest[400],
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.overlay.amber.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.overlay.amber.border,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.amber[500],
  },
  activeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: tokens.colors.amber[500],
  },
  proNameHero: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.5,
    color: tokens.colors.cream[50],
    marginBottom: 4,
  },
  proRenews: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.forest[200],
  },
  proBottom: {
    backgroundColor: tokens.colors.cream[100],
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: 18,
  },
  proUsageLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 12,
  },
  proUsageRows: {
    gap: 12,
    marginBottom: 16,
  },
  proUsageRow: {
    gap: 5,
  },
  proUsageRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proUsageName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  proUsageNameText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.ink[700],
  },
  proUsageValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  unlimitedChipLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.forest[50],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.forest[200],
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  unlimitedChipLightGlyph: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '600',
    color: tokens.colors.forest[800],
  },
  unlimitedChipLightLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  proUsageTrack: {
    height: 4,
    backgroundColor: tokens.colors.ink[100],
    borderRadius: 2,
    overflow: 'hidden',
  },
  proUsageFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: tokens.colors.forest[800],
  },
  proUsageTrackLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
    marginTop: 2,
  },
  proDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    marginBottom: 14,
  },
  manageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manageText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.ink[700],
  },

  // Settings sections
  settingsSection: {
    marginBottom: tokens.space.xl,
  },
  sectionLabel: {
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xs,
  },
  listGroup: {
    marginHorizontal: tokens.space.lg,
    backgroundColor: tokens.bgColors.canvas,
    borderRadius: tokens.radii.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
    marginLeft: tokens.space.lg + 32 + tokens.listRow.gap,
    // Aligns the divider with the start of row content (icon-bg width 32 +
    // row gap), so the leading icon column reads as a continuous strip.
  },

  // Version footer
  versionFooter: {
    paddingTop: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
  },

  // Sign-out sheet body
  sheetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: tokens.radii['2xl'],
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.md,
  },
  sheetTitle: {
    marginBottom: tokens.space.xs,
  },
  sheetBody: {
    marginBottom: tokens.space.xl,
  },
  sheetActions: {
    gap: tokens.space.sm,
  },
});
