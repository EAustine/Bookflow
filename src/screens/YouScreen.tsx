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

import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { tokens } from '~/design/tokens';

// ============================================================================
// TYPES
// ============================================================================

export type YouProfile = {
  name: string;
  email: string;
};

export type YouPlanName = 'Free' | 'Standard' | 'Premium';

export type YouPlan = {
  name: YouPlanName;
  meters: {
    audio: { used: number; total: number }; // minutes
    aiCredits: { used: number; total: number }; // tokens
    books: { used: number; total: number };
  };
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
}: YouScreenProps) {
  const sheetRef = useRef<BottomSheetRef>(null);
  const [signingOut, setSigningOut] = useState(false);

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

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <PageHeader />
          <ProfileHeader
            profile={profile}
            onPress={onAccountAndSubscription ?? (() => {})}
          />
          <PlanCard plan={plan} onUpgrade={onUpgrade ?? (() => {})} />

          <SettingsSection label="Reading">
            <ListRow
              leadingIcon="TextSize"
              label="Reading display"
              hint={readingDisplayHint}
              drillsInto
              onPress={onReadingDisplay ?? (() => {})}
            />
            <Divider />
            <ListRow
              leadingIcon="Microphone"
              label="Default voice"
              hint={defaultVoiceHint}
              drillsInto
              onPress={onDefaultVoice ?? (() => {})}
            />
            <Divider />
            <ListRow
              leadingIcon="Globe"
              label="Translation language"
              hint={translationLanguageHint}
              drillsInto
              onPress={onTranslationLanguage ?? (() => {})}
            />
          </SettingsSection>

          <SettingsSection label="Account">
            <ListRow
              leadingIcon="User"
              label="Account & subscription"
              drillsInto
              onPress={onAccountAndSubscription ?? (() => {})}
            />
            <Divider />
            <ListRow
              leadingIcon="Settings"
              label="Settings"
              drillsInto
              onPress={onSettings ?? (() => {})}
            />
            <Divider />
            <ListRow
              leadingIcon="Bell"
              label="Notifications"
              drillsInto
              onPress={onNotifications ?? (() => {})}
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
              onPress={onHelp ?? (() => {})}
            />
            <Divider />
            <ListRow
              leadingIcon="MessageCircle"
              label="Send feedback"
              drillsInto
              onPress={onSendFeedback ?? (() => {})}
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
        <Text style={styles.avatarText}>{initials}</Text>
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
}: {
  plan: YouPlan;
  onUpgrade: () => void;
}) {
  const audioPct = pct(plan.meters.audio.used, plan.meters.audio.total);
  const aiPct = pct(plan.meters.aiCredits.used, plan.meters.aiCredits.total);
  const booksPct = pct(plan.meters.books.used, plan.meters.books.total);

  const upgradeLabel = plan.name === 'Free' ? 'Upgrade to Standard' : 'Manage plan';

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

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={upgradeLabel}
        onPress={onUpgrade}
        style={({ pressed }) => [
          styles.upgradeBtn,
          pressed && { backgroundColor: tokens.colors.amber[200] },
        ]}
      >
        <Icon name="Sparkles" size={14} color={tokens.colors.forest[900]} />
        <Text style={styles.upgradeBtnLabel}>{upgradeLabel}</Text>
      </Pressable>
    </View>
  );
}

function Meter({
  name,
  value,
  percent,
}: {
  name: string;
  value: string;
  percent: number;
}) {
  // ≥80%: amber fill (soft "running low" cue, not alarming).
  // <80%: muted forest fill — present but quiet.
  const fillColor =
    percent >= 80 ? tokens.colors.amber[500] : tokens.colors.forest[200];
  const clamped = Math.max(0, Math.min(100, percent));
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
  },
  avatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
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
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
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
