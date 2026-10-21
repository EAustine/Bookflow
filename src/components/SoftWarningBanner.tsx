/**
 * SoftWarningBanner — the "you're approaching your audio limit" banner
 * that sits under the Library header.
 *
 * It is the **only live paywall surface in the repo.** Everything else
 * that offers an upgrade calls RevenueCat's hosted paywall, whose design
 * lives in their dashboard, not here (see F-1 / F-35).
 *
 * It used to live inside `PaywallScreen.tsx`, which was 506 lines of
 * which this was the only reachable export — `LibraryScreen` imported
 * this and nothing imported the screen. That file is gone; this moved
 * here so the one live surface sits with the other components rather
 * than inside dead code. (F-34.)
 *
 * Amber, not red: this is "approaching a limit", not "something broke".
 * Tapping anywhere opens upgrade options; the X dismisses without
 * nagging again.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type SoftWarningBannerProps = {
  minutesLeft: number;
  onUpgrade: () => void;
  onDismiss: () => void;
};

export function SoftWarningBanner({
  minutesLeft,
  onUpgrade,
  onDismiss,
}: SoftWarningBannerProps) {
  return (
    <Pressable onPress={onUpgrade} style={styles.softWarning}>
      <Icon name="AlertTriangle" size={16} color={tokens.colors.warn} />
      <View style={styles.warnTextCol}>
        <Text style={styles.warnTitle}>
          {minutesLeft} minutes of audio left this month
        </Text>
        <Text style={styles.warnSub}>
          Tap to see upgrade options before you hit the limit.
        </Text>
      </View>
      <Pressable
        onPress={(e) => {
          // Stop the dismiss from also firing the banner's own onPress,
          // which would open the upgrade flow the user just dismissed.
          e.stopPropagation?.();
          onDismiss();
        }}
        style={styles.warnDismissBtn}
        hitSlop={8}
      >
        <Icon name="X" size={10} color={tokens.colors.ink[500]} />
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  softWarning: {
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.sm,
    backgroundColor: tokens.colors.warnBg,
    borderRadius: 10,
    borderWidth: tokens.borderWidth.hairline,
    borderColor: tokens.colors.amber[200],
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  warnTextCol: { flex: 1 },
  warnTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.warn,
    marginBottom: 1,
  },
  warnSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
  },
  warnDismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: tokens.overlay.onLight.scrim,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
