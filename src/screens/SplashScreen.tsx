/**
 * SplashScreen — JS-land cold-launch animation.
 *
 * Plays once after the native splash dismisses. Background must match the
 * native splash (cream-50) so the handoff is seamless. Animation timeline
 * is sourced from /Users/completefarmer/Downloads/01_splash.html.
 *
 *   0–1200ms · main curve draws on (stroke-dashoffset 200 → 0)
 *   200–1400ms · echo curve draws + fades to 0.4 opacity
 *   800–1400ms · wordmark fades in
 *   1400–1800ms · hold (lets the user register the wordmark)
 *   1800ms · onComplete() — caller routes onward
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
const HOLD_AFTER_MS = 400;

export type SplashScreenProps = {
  onComplete: () => void;
};

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const mainOffset = useSharedValue(MAIN_DASH);
  const echoOffset = useSharedValue(ECHO_DASH);
  const echoOpacity = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);

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

    const holdTimer = setTimeout(onComplete, 1400 + HOLD_AFTER_MS);
    return () => {
      clearTimeout(holdTimer);
      cancelAnimation(mainOffset);
      cancelAnimation(echoOffset);
      cancelAnimation(echoOpacity);
      cancelAnimation(wordmarkOpacity);
    };
  }, [echoOffset, echoOpacity, mainOffset, onComplete, wordmarkOpacity]);

  const mainProps = useAnimatedProps(() => ({ strokeDashoffset: mainOffset.value }));
  const echoProps = useAnimatedProps(() => ({
    strokeDashoffset: echoOffset.value,
    opacity: echoOpacity.value,
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmarkOpacity.value }));

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
