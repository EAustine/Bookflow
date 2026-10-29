/**
 * ProgressRing — Figma `Progress ring` `123:57`.
 *
 * A track, an arc, and the percentage in the middle. Three states, from
 * the component's `Value` and `Show value` properties:
 *
 * | state         | arc                  | centre        |
 * |---------------|----------------------|---------------|
 * | determinate   | `bg/accent`          | `{n}%`        |
 * | failed        | `color/error`        | `{n}%`, error |
 * | indeterminate | none                 | spinner       |
 *
 * **The arc and the label come from one rounded value.** §7 of the
 * brief asks for this outright, and the version this replaced did not
 * do it: the arc was drawn from the raw fraction while the label was
 * rounded, so 0.666 drew a 66.6% arc beside the text "67%". Rounding
 * once, here, is the whole point of the component existing.
 *
 * Lives in `~/components` rather than in the Library feature because it
 * is a design-system component in Figma and §7 puts it on "the
 * Uploading screen, all sizes" — it is not the Library's.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type ProgressRingProps = {
  /**
   * 0..1. Undefined means genuinely unknown — the ring goes
   * indeterminate and shows no number, which is §7's "none when
   * indeterminate". Do not pass 0 to mean "no idea"; 0 is a real
   * value and draws an empty arc under a "0%".
   */
  value?: number;
  /** Paints the arc and the label in error red. */
  failed?: boolean;
};

const { size, radius, strokeWidth } = tokens.progressRing;
const CIRCUMFERENCE = 2 * Math.PI * radius;
const CENTRE = size / 2;

export function ProgressRing({ value, failed = false }: ProgressRingProps) {
  const indeterminate = value == null;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: tokens.progressRing.spinnerDurationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin, indeterminate]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // One rounded percent drives both the arc and the label, so they can
  // never disagree. Clamped because a caller computing a fraction from
  // bytes can overshoot on the last chunk.
  const percent = indeterminate
    ? 0
    : Math.round(Math.max(0, Math.min(1, value)) * 100);
  const arcColor = failed ? tokens.colors.error : tokens.bgColors.accent;

  return (
    <View style={styles.wrap}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={radius}
          fill="none"
          stroke={tokens.bgColors.raised}
          strokeWidth={strokeWidth}
        />
        {!indeterminate && (
          <Circle
            cx={CENTRE}
            cy={CENTRE}
            r={radius}
            fill="none"
            stroke={arcColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - percent / 100)}
            rotation={-90}
            origin={`${CENTRE}, ${CENTRE}`}
          />
        )}
      </Svg>
      <View style={styles.centre}>
        {indeterminate ? (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Icon
              name="Loader"
              size={tokens.progressRing.spinnerSize}
              color={tokens.bgColors.accent}
            />
          </Animated.View>
        ) : (
          <Text style={[styles.label, failed && styles.labelFailed]}>
            {percent}%
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: size,
    height: size,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.progressRing.labelSize,
    lineHeight: tokens.progressRing.labelLineHeight,
    color: tokens.textColors.primary,
  },
  labelFailed: {
    color: tokens.textColors.error,
  },
});
