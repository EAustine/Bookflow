/**
 * SplashScreen — JS-land cold-launch animation.
 *
 * Plays once after the native splash dismisses. Background must match the
 * native splash (cream-50) so the handoff is seamless.
 *
 * Timeline (3.1s):
 *   0–1200ms · main curve draws on (stroke-dashoffset 40 → 0)
 *   200–1400ms · echo curve draws + fades to 0.4 opacity
 *   800–1400ms · wordmark fades in
 *   1400–3100ms · one "breath": a gentle scale pulse on the logomark
 *                 (1.0 → 1.06 → 1.0, 1.7s)
 *   3100ms · onComplete() — the splash has played out; the caller is
 *            free to route onward
 *
 * Why the pulse: a static hold reads as "frozen" — users start to
 * wonder if the app crashed. A subtle inhale/exhale animation signals
 * "still alive, still loading." The loop is infinite, so a slow boot
 * keeps breathing past 3100ms rather than freezing (see below).
 *
 * `onComplete` is a release, not a command. The root layout only leaves
 * the splash once this has fired *and* session restore has answered, so if
 * restore is slow this stays mounted past TOTAL_DURATION_MS — the pulse
 * repeats indefinitely, which is exactly the honest "still working"
 * state we want. (It used to be the other way round: restore set
 * `stage` directly and won the race at ~1.2s, so the pulse never ran
 * once.)
 *
 * Measured on an iPhone 17 Pro simulator (2026-10-21, 600fps capture):
 * the main arc sweeps the mark's full 96pt width — no gap, no early
 * stop — settling ~1.0s after first ink, the echo ~1.15s, both on the
 * expected Material-standard S-curve.
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
import {
  LOGOMARK_ECHO,
  LOGOMARK_MAIN,
  LOGOMARK_STROKE,
  LOGOMARK_VIEWBOX,
  Logomark,
} from '~/components/Logomark';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Path lengths of the canonical arcs in LOGOMARK_VIEWBOX units, rounded
// up so the dash fully covers the stroke (main 39.25, echo 25.12).
// Were 110 / 80, the lengths of the old non-canonical curves. See F-8.
const MAIN_DASH = 40;
const ECHO_DASH = 26;

// 96 wide at the mark's fixed 28.32 : 18.72 aspect.
const LOGO_W = 96;
const LOGO_H = Math.round((LOGO_W * 18.72) / 28.32);
// Total visible duration. Native splash dismisses → React mounts this →
// onComplete fires. The native splash adds a few hundred ms before the
// JS animation even starts, so this is most of the user-perceived time
// from "tap icon" to "first interactive screen".
//
// 3100 = DRAW_DURATION_MS + one full breath (1700). Deliberately one
// breath, not two: a second cycle cost ~1.7s on every cold start, and
// Ama opening the app on a bus does not need to watch the logo inhale
// twice. Raise to 4800 for two cycles if the hold ever needs to cover
// slower boot work.
const TOTAL_DURATION_MS = 3100;
// When the breathing pulse starts — after the draw-on has fully
// settled, so the reveal stays crisp.
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
    // motion. One 1.7s breath fills the hold exactly: 1400 + 1700 =
    // TOTAL_DURATION_MS, so onComplete fires as the logo settles back
    // to ×1.0. The repeat is infinite anyway — that only matters when
    // a slow session restore holds the splash open longer.
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
          <Logomark width={LOGO_W} echoOpacity={0.4} />
          <Text style={styles.wordmark}>Bookflow</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.stack}>
        <Animated.View style={logomarkStyle}>
          {/* Same canonical arcs as <Logomark>, drawn inline because the
              draw-on animates strokeDashoffset per path. */}
          <Svg width={LOGO_W} height={LOGO_H} viewBox={LOGOMARK_VIEWBOX}>
            <AnimatedPath
              d={LOGOMARK_MAIN}
              stroke={tokens.colors.forest[800]}
              strokeWidth={LOGOMARK_STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={MAIN_DASH}
              animatedProps={mainProps}
            />
            <AnimatedPath
              d={LOGOMARK_ECHO}
              stroke={tokens.colors.forest[800]}
              strokeWidth={LOGOMARK_STROKE}
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
    color: tokens.textColors.primary,
    letterSpacing: -0.72,
  },
});
