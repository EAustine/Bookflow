import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

/**
 * Shown when an operation has been pending longer than the
 * threshold defined by `useSlowOp` (default 5s). Tells the user
 * the wait is likely a connection problem and offers a retry.
 *
 * Designed to slot below a screen's header (or at the top of a
 * scrollable area) — the warn-amber palette intentionally clashes
 * with the rest of the chrome so it reads as a temporary status
 * line, not a permanent piece of UI.
 *
 * Pass an `onRetry` to enable the tap-to-retry affordance. Omit
 * it for screens where the operation will resolve on its own (e.g.
 * polling) — the banner is informational in that case.
 */
export function SlowNetworkBanner({
  onRetry,
  label,
}: {
  onRetry?: () => void;
  /**
   * Override the default message. Useful for screen-specific
   * copy, e.g. "Translation is taking a while — check your
   * connection" rather than the generic fallback.
   */
  label?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Icon
        name="WifiOff"
        size={14}
        color={tokens.colors.warn}
        strokeWidth={1.75}
      />
      <Text style={styles.text} numberOfLines={2}>
        {label ?? "This is taking longer than usual — check your connection."}
      </Text>
      {onRetry && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          hitSlop={8}
          style={({ pressed }) => [
            styles.retryBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: tokens.colors.warnBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.warnBorder,
  },
  text: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.warn,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: tokens.colors.warn,
  },
  retryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
