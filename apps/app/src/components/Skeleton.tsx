import { useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { tokens } from '~/design/tokens';

/**
 * The shimmer's two ends, from the design system rather than from here.
 *
 * These were the same two hex literals, and `responsive-milestones.md`
 * had them down as a visual change waiting on the sign-off pass: §4's
 * "skeletons use `color/bg/surface` blocks" reads as though binding
 * them would move every skeleton in the app onto #F5F1E8.
 *
 * It does not. The design system has its own `skeleton/from` and
 * `skeleton/to` variables, carried as `colors.skeletonFrom` and
 * `colors.skeletonTo`, and they hold exactly the two values this file
 * was hardcoding. §4's sentence is about the blocks at rest; the
 * shimmer is its own pair. So this is a literal becoming a token and
 * nothing on screen changes.
 */

export type SkeletonProps = {
  width: number | `${number}%`;
  height: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width, height, borderRadius = 4, style }: SkeletonProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [progress]);

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [
      tokens.colors.skeletonFrom,
      tokens.colors.skeletonTo,
    ]),
  }));

  return <Animated.View style={[{ width, height, borderRadius }, animStyle, style]} />;
}
