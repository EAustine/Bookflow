import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, type BottomSheetRef, Button, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { YouPlan, YouProfile } from '~/screens/YouScreen';

// ─── Props ────────────────────────────────────────────────────────────────────

export type AccountScreenProps = {
  profile: YouProfile;
  plan: YouPlan;
  onBack: () => void;
  onSignOut: () => Promise<void> | void;
  onUpgrade: () => void;
  onExportData?: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function AccountScreen({
  profile,
  plan,
  onBack,
  onSignOut,
  onUpgrade,
  onExportData,
}: AccountScreenProps) {
  const signOutSheetRef = useRef<BottomSheetRef>(null);
  const [signingOut, setSigningOut] = useState(false);

  const confirmSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await onSignOut();
      signOutSheetRef.current?.dismiss();
    } finally {
      setSigningOut(false);
    }
  }, [onSignOut, signingOut]);

  const isPro = plan.name !== 'Free';

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <SubHeader onBack={onBack} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <ProfileSection profile={profile} />

          {isPro ? (
            <ProPlanCard plan={plan} />
          ) : (
            <FreePlanCard plan={plan} onUpgrade={onUpgrade} />
          )}

          <SectionGroup label="Account">
            {!isPro && (
              <>
                <ListRow
                  iconName="CreditCard"
                  label="Verify student status"
                  hint="$4.99/mo"
                  onPress={() => {}}
                />
                <RowDivider />
              </>
            )}
            <ListRow iconName="Refresh" label="Restore purchases" onPress={() => {}} />
          </SectionGroup>

          <SectionGroup label="Privacy & data">
            <ListRow iconName="Shield" label="Privacy policy" onPress={() => {}} />
            <RowDivider />
            <ListRow iconName="FileText" label="Terms of service" onPress={() => {}} />
            <RowDivider />
            <ListRow iconName="Download" label="Export my data" onPress={onExportData ?? (() => {})} />
          </SectionGroup>

          <SectionGroup>
            <ListRow
              iconName="Logout"
              label="Sign out"
              destructive
              onPress={() => signOutSheetRef.current?.present()}
            />
            <RowDivider />
            <ListRow iconName="Trash" label="Delete account" muted onPress={() => {}} />
          </SectionGroup>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet ref={signOutSheetRef} enablePanDownToClose={!signingOut}>
        <SignOutBody
          loading={signingOut}
          onConfirm={confirmSignOut}
          onCancel={() => {
            if (!signingOut) signOutSheetRef.current?.dismiss();
          }}
        />
      </BottomSheet>
    </>
  );
}

// ─── Sub-header ───────────────────────────────────────────────────────────────

function SubHeader({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.subHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
      </Pressable>
      <Text style={styles.subHeaderTitle}>Account &amp; subscription</Text>
    </View>
  );
}

// ─── Profile section ──────────────────────────────────────────────────────────

function ProfileSection({ profile }: { profile: YouProfile }) {
  const initials = getInitials(profile.name, profile.email);
  return (
    <View style={styles.profileSection}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitials}>{initials}</Text>
      </View>
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>{profile.name}</Text>
        <Text style={styles.profileEmail} numberOfLines={1}>
          {profile.email}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
        onPress={() => {}}
      >
        <Text style={styles.editBtnLabel}>Edit</Text>
      </Pressable>
    </View>
  );
}

function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    const result = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
    if (result) return result;
  }
  return (email.split('@')[0] ?? '').slice(0, 2).toUpperCase() || '·';
}

// ─── Free plan card ───────────────────────────────────────────────────────────

function FreePlanCard({ plan, onUpgrade }: { plan: YouPlan; onUpgrade: () => void }) {
  const { audio, aiCredits, books } = plan.meters;

  return (
    <View style={styles.subCard}>
      <View style={styles.freeCardHeader}>
        <View>
          <Text style={styles.planEyebrow}>Your plan</Text>
          <Text style={styles.planName}>Free</Text>
          <Text style={styles.planStatus}>Resets June 1</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onUpgrade}
          style={({ pressed }) => [styles.upgradeBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.upgradeBtnLabel}>Upgrade</Text>
        </Pressable>
      </View>

      <View style={styles.cardMeters}>
        <MeterRow
          name="Audio"
          valueLabel={`${audio.used} / ${audio.total} min`}
          percent={pct(audio.used, audio.total)}
        />
        <MeterRow
          name="AI credits"
          valueLabel={`${fmt(aiCredits.used)} / ${fmt(aiCredits.total)}`}
          percent={pct(aiCredits.used, aiCredits.total)}
        />
        <MeterRow
          name="Books"
          valueLabel={`${books.used} / ${books.total}`}
          percent={pct(books.used, books.total)}
        />
      </View>
    </View>
  );
}

// ─── Pro plan card ────────────────────────────────────────────────────────────

const PRO_FEATURES = [
  'Unlimited audio streaming & offline downloads',
  'Unlimited library',
  '500K AI credits / month',
  '3 premium AI voices',
];

function ProPlanCard({ plan }: { plan: YouPlan }) {
  const planLabel = plan.name === 'Standard' ? 'Standard · Yearly' : plan.name;

  return (
    <View style={styles.subCard}>
      <View style={styles.proCardHeader}>
        <View>
          <Text style={styles.planEyebrowPro}>Your plan</Text>
          <Text style={styles.planNamePro}>{planLabel}</Text>
          <Text style={styles.planStatusPro}>Active · $79 / year</Text>
        </View>
        <View style={styles.proCheck}>
          <Icon name="Check" size={11} color={tokens.colors.forest[800]} strokeWidth={2.5} />
        </View>
      </View>

      <View style={styles.renewalRow}>
        <Text style={styles.renewalLabel}>Next renewal</Text>
        <Text style={styles.renewalDate}>May 12, 2027</Text>
      </View>

      <View style={styles.proFeatures}>
        {PRO_FEATURES.map((f) => (
          <View key={f} style={styles.proFeatureRow}>
            <View style={styles.featureCheck}>
              <Icon name="Check" size={9} color={tokens.colors.forest[800]} strokeWidth={2.5} />
            </View>
            <Text style={styles.proFeatureText}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={styles.proActions}>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.proActionBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {}}
        >
          <Text style={styles.proActionManage}>Manage</Text>
        </Pressable>
        <View style={styles.proActionDivider} />
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.proActionBtn, pressed && { opacity: 0.7 }]}
          onPress={() => {}}
        >
          <Text style={styles.proActionCancel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Meter row ────────────────────────────────────────────────────────────────

function MeterRow({
  name,
  valueLabel,
  percent,
}: {
  name: string;
  valueLabel: string;
  percent: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillColor = percent >= 80 ? tokens.colors.amber[500] : tokens.colors.forest[800];
  return (
    <View style={styles.meterRow}>
      <View style={styles.meterMeta}>
        <Text style={styles.meterName}>{name}</Text>
        <Text style={styles.meterVal}>{valueLabel}</Text>
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${clamped}%`, backgroundColor: fillColor }]} />
      </View>
    </View>
  );
}

function pct(used: number, total: number) {
  return total > 0 ? (used / total) * 100 : 0;
}

function fmt(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}

// ─── Section group ────────────────────────────────────────────────────────────

function SectionGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionGroup}>
      {label && <Text style={styles.sectionEyebrow}>{label}</Text>}
      <View style={styles.listGroup}>{children}</View>
    </View>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ─── List row ─────────────────────────────────────────────────────────────────

import type { IconName } from '~/components/Icon';

function ListRow({
  iconName,
  label,
  hint,
  destructive,
  muted,
  onPress,
}: {
  iconName: IconName;
  label: string;
  hint?: string;
  destructive?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const iconBg = destructive
    ? tokens.bgColors.errorMuted
    : muted
    ? tokens.bgColors.surface
    : tokens.bgColors.surface;

  const iconColor = destructive
    ? tokens.colors.error
    : muted
    ? tokens.colors.ink[300]
    : tokens.textColors.secondary;

  const labelColor = destructive
    ? tokens.colors.error
    : muted
    ? tokens.colors.ink[400]
    : tokens.textColors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={[styles.rowIconBg, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={15} color={iconColor} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }, muted && styles.rowLabelMuted]}>
        {label}
      </Text>
      {hint && <Text style={styles.rowHint}>{hint}</Text>}
      {!destructive && !muted && (
        <Icon name="ChevronRight" size={13} color={tokens.colors.ink[300]} />
      )}
    </Pressable>
  );
}

// ─── Sign-out sheet body ──────────────────────────────────────────────────────

function SignOutBody({
  loading,
  onConfirm,
  onCancel,
}: {
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
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
        You'll need to sign back in to access your library and reading progress. Your data stays
        safe.
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: tokens.space['2xl'],
  },

  // Sub-header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    flex: 1,
  },

  // Profile section
  profileSection: {
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.lg,
    marginBottom: tokens.space.lg,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 14,
    padding: tokens.space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    lineHeight: 24,
  },
  profileInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  profileName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  profileEmail: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  editBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  editBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // Plan cards (shared wrapper)
  subCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },

  // Free card header
  freeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.bgColors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  planEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 3,
  },
  planName: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 22,
  },
  planStatus: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  upgradeBtn: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upgradeBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Meters (inside free card)
  cardMeters: {
    padding: 14,
    gap: 12,
    backgroundColor: tokens.bgColors.canvas,
  },
  meterRow: { gap: 5 },
  meterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meterName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  meterVal: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  meterTrack: {
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },

  // Pro card header
  proCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.colors.forest[800],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.forest[700],
  },
  planEyebrowPro: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.forest[200],
    marginBottom: 3,
  },
  planNamePro: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    lineHeight: 22,
  },
  planStatusPro: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    marginTop: 1,
  },
  proCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  // Renewal row
  renewalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: tokens.space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  renewalLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
  },
  renewalDate: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  // Pro features
  proFeatures: {
    padding: 12,
    paddingHorizontal: tokens.space.md,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  proFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureCheck: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  proFeatureText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.secondary,
    flex: 1,
  },

  // Pro actions footer
  proActions: {
    flexDirection: 'row',
    backgroundColor: tokens.bgColors.canvas,
  },
  proActionBtn: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proActionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  proActionManage: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  proActionCancel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.error,
  },

  // Section group
  sectionGroup: {
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
  },
  sectionEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 8,
  },
  listGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },

  // List row
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.md,
    backgroundColor: tokens.bgColors.canvas,
  },
  rowIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  rowLabelMuted: {
    fontFamily: tokens.fonts.ui,
    fontWeight: '400',
  },
  rowHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[400],
    flexShrink: 0,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },

  // Sign-out sheet
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
