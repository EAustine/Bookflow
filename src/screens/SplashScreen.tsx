/**
 * SplashScreen — JS-land cold-launch animation.
 *
 * Plays once after the native splash dismisses. Background must match the
 * native splash (cream-50) so the handoff is seamless.
 *
 * Timeline (5s total):
 *   0–1200ms · main curve draws on (stroke-dashoffset 110 → 0)
 *   200–1400ms · echo curve draws + fades to 0.4 opacity
 *   800–1400ms · wordmark fades in
 *   1400–4800ms · gentle "breathing" scale pulse on the logomark
 *                 (1.0 → 1.06 → 1.0, 1.7s per breath, ~2 cycles)
 *   5000ms · onComplete() — caller routes onward
 *
 * Why the pulse: a 5s static hold reads as "frozen" — users start to
 * wonder if the app crashed. A subtle inhale/exhale animation signals
 * "still alive, still loading."
 *
 * Web: Reanimated animated SVG nodes cause "Node cannot be found in the
 * current page." in React Strict Mode (dev) because Reanimated queues RAF
 * callbacks that fire after the nodes are unmounted. On web we skip the
 * draw animation entirely — show the static logo and proceed after a short
 * hold. Splash screens are a native pattern; web users see the page load.
 */

import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { tokens } from '~/design/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Path lengths from the canonical v2 logomark (cubic curves). Slight buffer
// above the measured values (107.16 / 76.51) so the stroke is fully hidden
// at offset = dash.
const MAIN_DASH = 110;
const ECHO_DASH = 80;
// Total visible duration. Native splash dismisses → React mounts this →
// onComplete fires. The native splash adds a few hundred ms before the
// JS animation even starts, so 5s is the total user-perceived time
// from "tap icon" to "first interactive screen".
const TOTAL_DURATION_MS = 5000;
const DRAW_DURATION_MS = 1400;

export type SplashScreenProps = {
  onComplete: () => void;
};

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const mainOffset = useSharedValue(MAIN_DASH);
  const echoOffset = useSharedValue(ECHO_DASH);
  const echoOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  // Logomark "breathing" — gentle scale pulse during the hold so the
  // 5s splash doesn't feel frozen. Drives a transform on the SVG
  // wrapper, not the paths themselves (cheaper, smoother).
  const breathScale = useSharedValue(1);

  useEffect(() => {
    // Web: skip Reanimated animation to avoid binding animated props to SVG
    // nodes that Strict Mode will immediately unmount (see file comment).
    if (Platform.OS === 'web') {
      const timer = setTimeout(onComplete, 600);
      return () => clearTimeout(timer);
    }

    const standard = Easing.bezier(0.4, 0, 0.2, 1);

    mainOffset.value = withTiming(0, { duration: 1200, easing: standard });
    echoOffset.value = withDelay(200, withTiming(0, { duration: 1200, easing: standard }));
    echoOpacity.value = withDelay(200, withTiming(0.4, { duration: 1200, easing: standard }));
    wordmarkOpacity.value = withDelay(
      800,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
    );
    // Start the breathing pulse after the draw-on completes, so the
    // initial reveal is crisp and the loop kicks in as a "settled"
    // motion. 1.7s per breath × 2 cycles ≈ 3.4s of pulsing fits the
    // remaining ~3.6s of hold time before onComplete fires.
    breathScale.value = withDelay(
      DRAW_DURATION_MS,
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: 850, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // infinite — runs until cancelled in cleanup
        false,
      ),
    );

    const holdTimer = setTimeout(onComplete, TOTAL_DURATION_MS);
    return () => {
      clearTimeout(holdTimer);
      cancelAnimation(mainOffset);
      cancelAnimation(echoOffset);
      cancelAnimation(echoOpacity);
      cancelAnimation(wordmarkOpacity);
      cancelAnimation(breathScale);
    };
  }, [
    breathScale,
    echoOffset,
    echoOpacity,
    mainOffset,
    onComplete,
    wordmarkOpacity,
  ]);

  const mainProps = useAnimatedProps(() => ({ strokeDashoffset: mainOffset.value }));
  const echoProps = useAnimatedProps(() => ({
    strokeDashoffset: echoOffset.value,
    opacity: echoOpacity.value,
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmarkOpacity.value }));
  const logomarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathScale.value }],
  }));

  // Web: static logo, no animated nodes.
  if (Platform.OS === 'web') {
    return (
      <View style={styles.root}>
        <View style={styles.stack}>
          <Svg width={96} height={96} viewBox="0 0 100 100">
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
              opacity={0.4}
            />
          </Svg>
          <Text style={styles.wordmark}>Bookflow</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.stack}>
        <Animated.View style={logomarkStyle}>
          <Svg width={96} height={96} viewBox="0 0 100 100">
            <AnimatedPath
              d="M 25 80 C 33.5 22 66.5 22 75 80"
              stroke={tokens.colors.forest[800]}
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={MAIN_DASH}
              animatedProps={mainProps}
            />
            <AnimatedPath
              d="M 35 78 C 45 33 55 33 65 78"
              stroke={tokens.colors.forest[800]}
              strokeWidth={9}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={ECHO_DASH}
              animatedProps={echoProps}
            />
          </Svg>
        </Animated.View>
        <Animated.Text style={[styles.wordmark, wordmarkStyle]}>Bookflow</Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stack: {
    alignItems: 'center',
    gap: tokens.space['2xl'],
  },
  wordmark: {
    fontFamily: tokens.fonts.displayBold,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '600',
    color: tokens.textColors.primary,
    letterSpacing: -0.72,
  },
});
