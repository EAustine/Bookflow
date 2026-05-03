/**
 * StudentVerificationScreen — three-state student-discount flow.
 *
 * Per /docs/specs/b6_01_paywall_triggers_student.html. The screen renders
 * different content for each state in the verification journey:
 *
 *   1. 'entry'    — collect .edu (or institution) email + show price chip.
 *   2. 'pending'  — confirmation that the magic link was sent.
 *   3. 'verified' — success state with checkmark + "Start Premium" CTA.
 *
 * A 3-dot step indicator at the top reflects progress. The host owns the
 * state and email value so this screen can be re-mounted from a deep link
 * (verification email click) and resume mid-flow.
 */

import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type StudentVerificationState = 'entry' | 'pending' | 'verified';

export type StudentVerificationScreenProps = {
  state: StudentVerificationState;
  email?: string;
  onChangeEmail?: (email: string) => void;
  monthlyPrice?: string; // e.g. "$4.99/mo"
  onBack: () => void;
  onSendVerification: () => void;
  onResend?: () => void;
  onStartPremium?: () => void;
};

const SUCCESS_FG = '#2D7A4F';
const SUCCESS_BG = '#E8F4ED';
const SUCCESS_BORDER = '#A8D5B9';
const PENDING_FG = '#A0692A';
const PENDING_BG = '#FDF3E3';

export function StudentVerificationScreen({
  state,
  email = '',
  onChangeEmail,
  monthlyPrice = '$4.99/mo',
  onBack,
  onSendVerification,
  onResend,
  onStartPremium,
}: StudentVerificationScreenProps) {
  const [localEmail, setLocalEmail] = useState(email);
  const value = onChangeEmail ? email : localEmail;
  const setValue = onChangeEmail ?? setLocalEmail;

  const stepIndex = state === 'entry' ? 0 : state === 'pending' ? 1 : 2;
  const canSubmit = /\S+@\S+\.\S+/.test(value);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Back">
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} strokeWidth={1.75} />
        </Pressable>
        <Text style={styles.headerTitle}>Student verification</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Step dots */}
      <View style={styles.steps}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              i === stepIndex && styles.stepDotActive,
              i < stepIndex && styles.stepDotDone,
            ]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero icon */}
        <View
          style={[
            styles.hero,
            state === 'verified' && { backgroundColor: SUCCESS_BG },
            state === 'pending' && { backgroundColor: PENDING_BG },
          ]}
        >
          <Icon
            name={
              state === 'verified'
                ? 'CheckCircle'
                : state === 'pending'
                  ? 'Mail'
                  : 'Shield'
            }
            size={28}
            color={
              state === 'verified'
                ? SUCCESS_FG
                : state === 'pending'
                  ? PENDING_FG
                  : tokens.colors.forest[800]
            }
            strokeWidth={1.5}
          />
        </View>

        {/* State-specific content */}
        {state === 'entry' && (
          <>
            <Text style={styles.title}>Get Premium for less</Text>
            <Text style={styles.subtitle}>
              Verify your student status with your school email and unlock
              Premium for {monthlyPrice} for 12 months.
            </Text>

            {/* Price chip */}
            <View style={styles.priceChip}>
              <Text style={styles.priceChipLabel}>Student price</Text>
              <Text style={styles.priceChipValue}>{monthlyPrice}</Text>
              <Text style={styles.priceChipNote}>renews yearly · cancel anytime</Text>
            </View>

            {/* Email field */}
            <Text style={styles.fieldLabel}>School email</Text>
            <View style={styles.fieldWrap}>
              <Icon name="Mail" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
              <TextInput
                style={styles.field}
                value={value}
                onChangeText={setValue}
                placeholder="you@school.edu"
                placeholderTextColor={tokens.textColors.disabled}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={canSubmit ? onSendVerification : undefined}
              />
            </View>
            <Text style={styles.helperText}>
              We'll send a one-time link to confirm. Most .edu and institution
              domains qualify.
            </Text>

            {/* CTA */}
            <Pressable
              onPress={onSendVerification}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.cta,
                !canSubmit && styles.ctaDisabled,
                pressed && canSubmit && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.ctaLabel}>Send verification email</Text>
            </Pressable>
          </>
        )}

        {state === 'pending' && (
          <>
            <Text style={styles.title}>Check your inbox</Text>
            <Text style={styles.subtitle}>
              We sent a verification link to{'\n'}
              <Text style={styles.subtitleStrong}>{value || 'your email'}</Text>
            </Text>

            <View style={[styles.notice, { backgroundColor: PENDING_BG }]}>
              <Icon name="Info" size={14} color={PENDING_FG} strokeWidth={1.75} />
              <Text style={[styles.noticeText, { color: PENDING_FG }]}>
                The link expires in 30 minutes. Open it on this device to
                finish verifying.
              </Text>
            </View>

            <Pressable
              onPress={onResend ?? (() => {})}
              style={({ pressed }) => [styles.cta, styles.ctaSecondary, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Icon name="Refresh" size={13} color={tokens.colors.forest[800]} strokeWidth={1.75} />
              <Text style={[styles.ctaLabel, styles.ctaLabelSecondary]}>Resend email</Text>
            </Pressable>

            <Pressable onPress={onBack} hitSlop={6}>
              <Text style={styles.tertiaryLabel}>Use a different email</Text>
            </Pressable>
          </>
        )}

        {state === 'verified' && (
          <>
            <Text style={styles.title}>You're verified</Text>
            <Text style={styles.subtitle}>
              Welcome to Premium at the student rate. Your discount is active
              for 12 months — we'll remind you before it renews.
            </Text>

            <View
              style={[
                styles.notice,
                {
                  backgroundColor: SUCCESS_BG,
                  borderWidth: 0.5,
                  borderColor: SUCCESS_BORDER,
                },
              ]}
            >
              <Icon name="CheckCircle" size={14} color={SUCCESS_FG} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.noticeText, { color: SUCCESS_FG, fontFamily: tokens.fonts.uiMedium, fontWeight: '500' }]}>
                  Premium · Student rate
                </Text>
                <Text style={[styles.noticeText, { color: SUCCESS_FG, marginTop: 2 }]}>
                  {monthlyPrice} · billed monthly
                </Text>
              </View>
            </View>

            <Pressable
              onPress={onStartPremium ?? (() => {})}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Icon name="Sparkles" size={14} color={tokens.colors.forest[900]} strokeWidth={1.75} />
              <Text style={styles.ctaLabel}>Start using Premium</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 16,
    paddingBottom: 8,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.ink[200],
  },
  stepDotActive: {
    width: 24,
    backgroundColor: tokens.colors.forest[800],
  },
  stepDotDone: {
    backgroundColor: tokens.colors.forest[700],
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },

  hero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
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
    marginBottom: 22,
    maxWidth: 320,
  },
  subtitleStrong: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },

  priceChip: {
    width: '100%',
    padding: 16,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    marginBottom: 22,
  },
  priceChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.08,
    textTransform: 'uppercase',
    color: tokens.colors.forest[800],
    marginBottom: 4,
  },
  priceChipValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '500',
    color: tokens.colors.forest[800],
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  priceChipNote: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[700],
  },

  fieldLabel: {
    alignSelf: 'flex-start',
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: 6,
  },
  fieldWrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.borderColors.subtle,
    marginBottom: 8,
  },
  field: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    padding: 0,
  },
  helperText: {
    alignSelf: 'flex-start',
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    lineHeight: 16,
    marginBottom: 22,
  },

  notice: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 22,
  },
  noticeText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 17,
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
  ctaSecondary: {
    backgroundColor: tokens.colors.forest[50],
  },
  ctaDisabled: {
    backgroundColor: tokens.colors.ink[200],
  },
  ctaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },
  ctaLabelSecondary: {
    color: tokens.colors.forest[800],
  },
  tertiaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
    paddingVertical: 6,
  },
});
