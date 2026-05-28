import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { tokens } from '~/design/tokens';

/**
 * Three vertical bars that bounce up and down — the "currently
 * playing" indicator surfaced on the Now Playing card and the
 * recently-listened list. Each bar runs a looped sine-ish height
 * animation with a different phase offset so the trio reads as an
 * equaliser rather than a metronome.
 *
 * `playing=true` runs the animation; `playing=false` snaps each bar
 * to a held mid-height value so a paused state still reads as audio
 * (no jitter, no animation cost). `color` defaults to the brand
 * forest accent; pass an override for tinted contexts.
 *
 * Animated values are driven by the JS thread, but the bars are
 * 3-4px wide so layout cost is negligible. `useNativeDriver` is off
 * because we animate `height` (not a transform); flipping to a
 * scaleY transform was tried but produced visible anchor-point
 * snapping at the bottom of each bar.
 */
export function EqBars({
  playing = true,
  color = tokens.colors.forest[800],
  height = 16,
}: {
  /** When false, bars freeze at their mid-state instead of looping. */
  playing?: boolean;
  /** Bar tint. Defaults to forest[800]. */
  color?: string;
  /** Container height in px. Bars interpolate between ~25% and ~90% of this. */
  height?: number;
}) {
  // One animated value per bar. Range [0, 1] — interpolated to a
  // height range below so the bars don't shrink to invisibility.
  const a = useRef(new Animated.Value(0.4)).current;
  const b = useRef(new Animated.Value(0.9)).current;
  const c = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!playing) {
      // Hold a steady mid-state when paused so the UI still
      // communicates "audio source" without burning CPU on a loop.
      a.setValue(0.55);
      b.setValue(0.75);
      c.setValue(0.5);
      return;
    }
    // Phase-offset loops — each bar uses the same duration but
    // starts at a different point in its cycle, so they don't all
    // peak / trough simultaneously.
    const makeLoop = (val: Animated.Value, toHigh: number, toLow: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: toHigh,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(val, {
            toValue: toLow,
            duration: 420,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: false,
          }),
        ]),
      );

    const loopA = makeLoop(a, 0.9, 0.3);
    const loopB = makeLoop(b, 0.4, 1);
    const loopC = makeLoop(c, 1, 0.5);
    loopA.start();
    loopB.start();
    loopC.start();
    return () => {
      loopA.stop();
      loopB.stop();
      loopC.stop();
    };
  }, [a, b, c, playing]);

  // Bar height range proportional to the container — keeps bars
  // visually balanced whether the container is 14px tall or 28px.
  const lo = Math.max(3, height * 0.25);
  const hi = Math.max(lo + 2, height * 0.9);
  const heightFor = (val: Animated.Value) =>
    val.interpolate({ inputRange: [0, 1], outputRange: [lo, hi] });

  return (
    <View style={[styles.wrap, { height }]}>
      <Animated.View style={[styles.bar, { backgroundColor: color, height: heightFor(a) }]} />
      <Animated.View style={[styles.bar, { backgroundColor: color, height: heightFor(b) }]} />
      <Animated.View style={[styles.bar, { backgroundColor: color, height: heightFor(c) }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 3,
    borderRadius: 1.5,
  },
});
