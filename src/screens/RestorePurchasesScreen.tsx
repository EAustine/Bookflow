/**
 * RestorePurchasesScreen — three-state restore flow.
 *
 * Per /docs/specs/b7_01_os_system_states.html. The host owns the state
 * machine; this screen renders one of three views:
 *
 *   - 'restoring'    — spinner while RevenueCat checks the App Store.
 *   - 'restored'     — green icon + plan card with renewal date + CTA.
 *   - 'nothing'      — neutral empty state + contact-support exit.
 *
 * Wiring (host):
 *   1. setState('restoring')
 *   2. await Purchases.restorePurchases()
 *   3. inspect customerInfo.entitlements → 'restored' or 'nothing'
 */

import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type RestoreState = 'restoring' | 'restored' | 'nothing';

export type RestoredPlan = {
  /** e.g. "Standard · Yearly". */
  name: string;
  /** e.g. "Renews May 12, 2027 · All features active". */
  detail: string;
};

export type RestorePurchasesScreenProps = {
  state: RestoreState;
  plan?: RestoredPlan; // required when state === 'restored'
  onBack: () => void;
  onGoToLibrary?: () => void;
  onContactSupport?: () => void;
};

const SUCCESS_FG = '#2D7A4F';
const SUCCESS_BG = '#E8F4ED';
const SUCCESS_BORDER = '#A8D5B9';

export function RestorePurchasesScreen({
  state,
  plan,
  onBack,
  onGoToLibrary,
  onContactSupport,
}: RestorePurchasesScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={16} color={tokens.textColors.primary} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.headerTitle}>Restore purchases</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Body */}
      <View style={styles.body}>
        {state === 'restoring' && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={tokens.colors.forest[800]} style={{ marginBottom: 18 }} />
            <Text style={styles.title}>Checking with the App Store…</Text>
            <Text style={styles.sub}>This usually takes a few seconds.</Text>
          </View>
        )}

        {state === 'restored' && (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: SUCCESS_BG }]}>
              <Icon name="CheckCircle" size={32} color={SUCCESS_FG} strokeWidth={2} />
            </View>
            <Text style={styles.title}>Purchase restored</Text>
            <Text style={styles.sub}>
              Welcome back — your plan is reactivated and ready to use.
            </Text>

            {plan && (
              <View style={styles.planCard}>
                <View style={styles.planIcon}>
                  <Icon name="Check" size={16} color={tokens.colors.cream[50]} strokeWidth={2.25} />
                </View>
                <View style={styles.planText}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planSub}>{plan.detail}</Text>
                </View>
              </View>
            )}

            <Pressable
              onPress={onGoToLibrary ?? (() => {})}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>Go to library</Text>
            </Pressable>
          </View>
        )}

        {state === 'nothing' && (
          <View style={styles.center}>
            <View style={[styles.iconCircle, { backgroundColor: tokens.bgColors.surface }]}>
              <Icon name="Refresh" size={28} color={tokens.colors.ink[400]} strokeWidth={1.5} />
            </View>
            <Text style={styles.title}>No purchase found</Text>

            <View style={styles.nothingCard}>
              <Text style={styles.nothingTitle}>
                No active subscription on this Apple ID
              </Text>
              <Text style={styles.nothingSub}>
                If you subscribed with a different Apple ID, sign in to that
                account and try again. Or contact support if you think this is
                an error.
              </Text>
            </View>

            <Pressable
              onPress={onContactSupport ?? (() => {})}
              style={({ pressed }) => [styles.cta, styles.ctaSecondary, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Text style={[styles.ctaLabel, styles.ctaLabelSecondary]}>Contact support</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  body: {
    flex: 1,
    paddingHorizontal: 28,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
  },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 6,
    textAlign: 'center',
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
    maxWidth: 300,
  },

  // Restored plan card
  planCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SUCCESS_BG,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: SUCCESS_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  planIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    backgroundColor: SUCCESS_FG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planText: { flex: 1 },
  planName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: SUCCESS_FG,
    marginBottom: 2,
  },
  planSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },

  // Nothing-found card
  nothingCard: {
    width: '100%',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
    padding: 14,
    marginBottom: 24,
  },
  nothingTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 4,
  },
  nothingSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    lineHeight: 17,
  },

  cta: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaSecondary: {
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 0.5,
    borderColor: tokens.borderColors.subtle,
  },
  ctaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  ctaLabelSecondary: {
    color: tokens.textColors.secondary,
  },
});
