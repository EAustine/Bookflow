/**
 * AuthCallbackScreen — transient screen shown while a magic link is verified.
 *
 * Two states:
 *   - 'verifying' · logomark + "Almost there." + pulsing dots (~1–3s typical)
 *   - 'error'     · alert icon + "This link has expired." + Get a new link / Back
 *
 * Per /Users/completefarmer/Downloads/03c_auth_callback.html.
 *
 * Routing after a successful Supabase token exchange happens at the caller —
 * this screen exposes `onSuccess` (auto-fired) and per-error callbacks. Real
 * Supabase wiring (exchangeCodeForSession + profile lookup) lives at the call
 * site; this is purely the visual + animation layer.
 *
 * Animation timeline:
 *   0ms      · logomark fades in (200ms)
 *   200ms+   · three dots pulse, 200ms stagger, 1.4s loop
 *   on error · dots stop, error state crossfades over 250ms
 */

import { useEffect } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Button } from '~/components/Button';
import { Icon } from '~/components/Icon';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';

export type AuthCallbackError =
  | 'expired'
  | 'used'
  | 'network'
  | 'unknown';

const ERROR_COPY: Record<AuthCallbackError, { title: string; sub: string; primary: string }> = {
  expired: {
    title: 'This link has expired.',
    sub: "Magic links work for 15 minutes after they're sent. Get a new one and try again.",
    primary: 'Get a new link',
  },
  used: {
    title: 'This link was already used.',
    sub: 'For security, magic links only work once. Get a fresh one and try again.',
    primary: 'Get a new link',
  },
  network: {
    title: "Couldn't connect.",
    sub: "We couldn't reach our servers. Check your connection and try again.",
    primary: 'Try again',
  },
  unknown: {
    title: 'Something went wrong.',
    sub: "We couldn't verify this link. Get a new one or contact support if it keeps happening.",
    primary: 'Get a new link',
  },
};

export type AuthCallbackScreenProps = {
  /** Controlled state. Defaults to 'verifying'. Caller flips to 'error' on failure. */
  state?: 'verifying' | 'error';
  /** Which error variant to render in the error state. Defaults to 'expired'. */
  error?: AuthCallbackError;
  /** Pressed when the user taps the primary CTA in the error state. */
  onRetry: () => void;
  /** Pressed when the user taps "Back to sign in". */
  onBackToSignIn: () => void;
};

export function AuthCallbackScreen({
  state = 'verifying',
  error = 'expired',
  onRetry,
  onBackToSignIn,
}: AuthCallbackScreenProps) {
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {state === 'verifying' ? <Verifying /> : <ErrorState error={error} onRetry={onRetry} onBackToSignIn={onBackToSignIn} />}
    </SafeAreaView>
  );
}

// ============================================================================
// Verifying
// ============================================================================

function Verifying() {
  const markOpacity = useSharedValue(0);

  useEffect(() => {
    markOpacity.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
  }, [markOpacity]);

  const markStyle = useAnimatedStyle(() => ({ opacity: markOpacity.value }));

  return (
    <View style={styles.verifyContent}>
      <Animated.View style={markStyle}>
        <Logomark size={56} />
      </Animated.View>

      <View style={styles.verifyTextBlock}>
        <RNText style={styles.verifyTitle}>Almost there.</RNText>
        <Text variant="body-sm" color="muted" align="center" style={styles.verifySub}>
          Verifying your sign-in link…
        </Text>
      </View>

      <View style={styles.dots}>
        <PulseDot delay={0} />
        <PulseDot delay={200} />
        <PulseDot delay={400} />
      </View>
    </View>
  );
}

function PulseDot({ delay }: { delay: number }) {
  // 0 = base (forest-200, 0.3 opacity, 0.85 scale)
  // 1 = active (forest-800, 1.0 opacity, 1.0 scale)
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
          withTiming(0, { duration: 700, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(phase);
  }, [delay, phase]);

  // Outer wrapper handles scale only — opacity is driven by the stacked dots
  // below so the color crossfades cleanly without compounding through scale.
  const wrapperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.85 + phase.value * 0.15 }],
  }));
  // Base (forest-200): visible at rest, fades to transparent at peak.
  const baseStyle = useAnimatedStyle(() => ({
    opacity: 0.3 * (1 - phase.value),
  }));
  // Active (forest-800): invisible at rest, fades in to full at peak.
  const activeStyle = useAnimatedStyle(() => ({
    opacity: phase.value,
  }));

  return (
    <Animated.View style={[styles.dotWrap, wrapperStyle]}>
      <Animated.View style={[styles.dotBase, baseStyle]} />
      <Animated.View style={[styles.dotActive, activeStyle]} />
    </Animated.View>
  );
}

// ============================================================================
// Error
// ============================================================================

function ErrorState({
  error,
  onRetry,
  onBackToSignIn,
}: {
  error: AuthCallbackError;
  onRetry: () => void;
  onBackToSignIn: () => void;
}) {
  const copy = ERROR_COPY[error];

  return (
    <View style={styles.errorContent}>
      <View style={styles.errorIllustration}>
        <View style={styles.errorIcon}>
          <Icon name="AlertTriangle" size={36} color={tokens.colors.ink[700]} />
        </View>

        <View style={styles.errorTextBlock}>
          <RNText style={styles.errorTitle}>{copy.title}</RNText>
          <Text variant="body-md" color="muted" align="center" style={styles.errorSub}>
            {copy.sub}
          </Text>
        </View>
      </View>

      <View style={styles.errorActions}>
        <Button label={copy.primary} variant="primary" size="large" fullWidth onPress={onRetry} />
        <Button
          label="Back to sign in"
          variant="tertiary"
          size="standard"
          fullWidth
          onPress={onBackToSignIn}
        />
      </View>
    </View>
  );
}

// ============================================================================
// Logomark
// ============================================================================

function Logomark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M 25 80 C 33.5 22 66.5 22 75 80"
        stroke={tokens.colors.forest[800]}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 35 78 C 45 33 55 33 65 78"
        stroke={tokens.colors.forest[800]}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
        opacity={0.45}
      />
    </Svg>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Verifying
  verifyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 28,
  },
  verifyTextBlock: {
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  verifyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 26,
    letterSpacing: -0.2,
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  verifySub: {
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 240,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  dotWrap: {
    width: 6,
    height: 6,
  },
  dotBase: {
    position: 'absolute',
    inset: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[200],
  },
  dotActive: {
    position: 'absolute',
    inset: 0,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.forest[800],
  },

  // Error
  errorContent: {
    flex: 1,
    paddingTop: tokens.space['2xl'],
    paddingHorizontal: 28,
    paddingBottom: tokens.space.lg,
  },
  errorIllustration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingBottom: tokens.space['2xl'],
  },
  errorIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: tokens.bgColors.errorMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTextBlock: {
    alignItems: 'center',
    maxWidth: 280,
  },
  errorTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 32,
    letterSpacing: -0.52,
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: tokens.space.md,
  },
  errorSub: {
    fontSize: 14,
    lineHeight: 22,
  },
  errorActions: {
    gap: 6,
  },
});
