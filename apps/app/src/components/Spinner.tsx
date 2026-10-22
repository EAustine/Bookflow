import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { tokens } from '~/design/tokens';

/**
 * The loading spinner, built to `tokens.button.spinner` — 16px, 1.5px
 * stroke, 700ms rotation.
 *
 * Exists because the design system specifies a particular ring and
 * `Button` was rendering `<ActivityIndicator size="small">` instead:
 * different size, different stroke, platform-dependent shape, and a
 * different spin rate on Android. The spec asked for one spinner.
 *
 * Drawn with two borders rather than SVG — a dimmed full ring as the
 * track, and a rotating ring with only `borderTopColor` set as the
 * arc. Cheaper than pulling react-native-svg in for a 16px control,
 * and the rotation runs on the native driver.
 */

export type SpinnerProps = {
  /** Defaults to the token size (16). */
  size?: number;
  /** Defaults to the token stroke (1.5). */
  strokeWidth?: number;
  /** Arc colour — pass the label colour of the surface it sits on. */
  color?: string;
};

export function Spinner({
  size = tokens.button.spinner.size,
  strokeWidth = tokens.button.spinner.strokeWidth,
  color = tokens.colors.cream[50],
}: SpinnerProps) {
  const spin = useRef(new Animated.Value(0)).current;
  const durationMs = tokens.button.spinner.durationMs;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, durationMs]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const ring = {
    borderRadius: size / 2,
    borderWidth: strokeWidth,
  } as const;

  return (
    <View
      accessibilityRole="progressbar"
      style={{ width: size, height: size }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          ring,
          { borderColor: color, opacity: 0.25 },
        ]}
      />
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          ring,
          {
            borderColor: 'transparent',
            borderTopColor: color,
            transform: [{ rotate }],
          },
        ]}
      />
    </View>
  );
}
