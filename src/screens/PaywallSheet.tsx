/**
 * PaywallSheet — generic upgrade prompt with three contextual variants.
 *
 * Per /docs/specs/b6_01_paywall_triggers_student.html:
 *   - 'book-limit'  : amber/warn tint, shows the books-used meter.
 *   - 'ai-tokens'   : red/error tint, shows the AI tokens meter.
 *   - 'feature-gate': forest tint, shows a "what you get" feature card.
 *
 * All variants share the same shell: icon + eyebrow + headline + subline +
 * primary "Upgrade" CTA + tertiary "Maybe later" / "Keep free" link. The
 * student-discount link sits below as a low-pressure escape hatch.
 */

import { forwardRef, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text, type IconName } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Variants ─────────────────────────────────────────────────────────────────

export type PaywallVariant = 'book-limit' | 'ai-tokens' | 'feature-gate';

type Tint = {
  bg: string;
  fg: string;
  iconBg: string;
  fillTrack: string;
  fillBar: string;
};

const WARN_FG = tokens.colors.warn;
const WARN_BG = tokens.colors.warnBg;
const ERROR_FG = tokens.colors.error;
const ERROR_BG = tokens.colors.errorBg;

const TINTS: Record<PaywallVariant, Tint> = {
  'book-limit': {
    bg: WARN_BG,
    fg: WARN_FG,
    iconBg: WARN_BG,
    fillTrack: 'rgba(160, 105, 42, 0.15)',
    fillBar: WARN_FG,
  },
  'ai-tokens': {
    bg: ERROR_BG,
    fg: ERROR_FG,
    iconBg: ERROR_BG,
    fillTrack: 'rgba(181, 69, 58, 0.15)',
    fillBar: ERROR_FG,
  },
  'feature-gate': {
    bg: tokens.colors.forest[50],
    fg: tokens.colors.forest[800],
    iconBg: tokens.colors.forest[100],
    fillTrack: 'rgba(31, 58, 41, 0.1)',
    fillBar: tokens.colors.forest[800],
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type PaywallMeter = {
  label: string;
  used: number;
  total: number;
  /** e.g. "books", "tokens" — appended to "X / Y {unit}". */
  unit?: string;
};

export type PaywallFeature = {
  icon: IconName;
  text: string;
};

export type PaywallSheetProps = {
  variant: PaywallVariant;
  eyebrow: string; // e.g. "Free plan limit", "AI credits exhausted", "Pro feature"
  title: string;
  subtitle: string;
  meter?: PaywallMeter; // shown for book-limit / ai-tokens
  features?: PaywallFeature[]; // shown for feature-gate
  ctaLabel?: string;
  onUpgrade: () => void;
  onLater?: () => void;
  onStudentVerify?: () => void;
  onDismiss?: () => void;
};

// ─── Sheet ────────────────────────────────────────────────────────────────────

export const PaywallSheet = forwardRef<BottomSheetModal, PaywallSheetProps>(
  function PaywallSheet(
    {
      variant,
      eyebrow,
      title,
      subtitle,
      meter,
      features,
      ctaLabel = 'Upgrade to Premium',
      onUpgrade,
      onLater,
      onStudentVerify,
      onDismiss,
    },
    ref,
  ) {
    const tint = TINTS[variant];
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior="close"
        />
      ),
      [],
    );

    const iconName: IconName =
      variant === 'book-limit'
        ? 'Book'
        : variant === 'ai-tokens'
          ? 'AlertTriangle'
          : 'Sparkles';

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
        onDismiss={onDismiss}
      >
        <BottomSheetView style={styles.content}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: tint.iconBg }]}>
            <Icon name={iconName} size={22} color={tint.fg} strokeWidth={1.5} />
          </View>

          {/* Eyebrow */}
          <Text style={[styles.eyebrow, { color: tint.fg }]}>{eyebrow}</Text>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Meter card */}
          {meter && (
            <View style={[styles.meterCard, { backgroundColor: tint.bg }]}>
              <View style={styles.meterMeta}>
                <Text style={[styles.meterLabel, { color: tint.fg }]}>
                  {meter.label}
                </Text>
                <Text style={[styles.meterValue, { color: tint.fg }]}>
                  {meter.used} / {meter.total}{meter.unit ? ` ${meter.unit}` : ''}
                </Text>
              </View>
              <View style={[styles.meterTrack, { backgroundColor: tint.fillTrack }]}>
                <View
                  style={[
                    styles.meterBar,
                    {
                      width: `${Math.min(100, (meter.used / Math.max(1, meter.total)) * 100)}%`,
                      backgroundColor: tint.fillBar,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          {/* Feature list (feature-gate variant) */}
          {features && features.length > 0 && (
            <View style={[styles.featureCard, { backgroundColor: tint.bg }]}>
              <Text style={[styles.featureLabel, { color: tint.fg }]}>
                What you get
              </Text>
              {features.map((f, i) => (
                <View key={i} style={styles.featureRow}>
                  <Icon name={f.icon} size={14} color={tint.fg} strokeWidth={1.75} />
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Primary CTA */}
          <Pressable
            onPress={onUpgrade}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Icon name="Sparkles" size={14} color={tokens.colors.forest[900]} strokeWidth={1.75} />
            <Text style={styles.ctaLabel}>{ctaLabel}</Text>
          </Pressable>

          {/* Student verify link */}
          {onStudentVerify && (
            <Pressable onPress={onStudentVerify} hitSlop={6} style={styles.studentLink}>
              <Text style={styles.studentLinkText}>
                Student? <Text style={styles.studentLinkBold}>Verify for $4.99/mo →</Text>
              </Text>
            </Pressable>
          )}

          {/* Later link */}
          <Pressable onPress={onLater ?? onDismiss} hitSlop={6}>
            <Text style={styles.laterLabel}>Maybe later</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 24,
    alignItems: 'center',
  },

  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
    maxWidth: 320,
  },

  meterCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
  },
  meterMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  meterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
  },
  meterValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  meterTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  meterBar: {
    height: '100%',
    borderRadius: 3,
  },

  featureCard: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    marginBottom: 18,
    gap: 8,
  },
  featureLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.primary,
    lineHeight: 18,
  },

  cta: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.colors.amber[500],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  ctaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },

  studentLink: { paddingVertical: 6, marginBottom: 4 },
  studentLinkText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  studentLinkBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  laterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
    paddingVertical: 6,
  },
});
