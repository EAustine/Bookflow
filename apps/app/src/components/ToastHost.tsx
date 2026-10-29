import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useSizeClass } from '~/hooks/useSizeClass';
import { useToastStore } from '~/lib/toast';
import { useShellChromeStore } from '~/stores/shellChrome';

/**
 * App-wide success toast — a small forest card, auto-dismissing after
 * ~2.8s and tappable to dismiss early. Bookflow-styled (forest card,
 * amber check, cream text) in place of the OS Alert for light,
 * non-blocking confirmations. Mounted once at the app root; fire it
 * with `toast.show('…')` from anywhere.
 *
 * Placement follows the frames (M8), and it differs by size class:
 *
 * - **Compact** keeps the top. The phone has a tab bar at the bottom
 *   and the toast would land on it.
 * - **Above Compact** it sits 30 above the bottom safe area, which is
 *   free once the tab bar becomes a side rail.
 *
 * Horizontally it centres over the **content area**, not the window —
 * §4 — so it clears the rail. It reads `railVisible` rather than the
 * size class alone, because the reader and the foreground player are
 * wide surfaces that draw no rail.
 */
export function ToastHost() {
  const message = useToastStore((s) => s.message);
  const nonce = useToastStore((s) => s.nonce);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const { sizeClass, isWide } = useSizeClass();
  const railVisible = useShellChromeStore((s) => s.railVisible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) hide();
      });
    }, 2800);
    return () => clearTimeout(t);
  }, [nonce, message, anim, hide]);

  if (!message) return null;

  const railInset = railVisible
    ? sizeClass === 'desktop'
      ? tokens.layout.rail.expanded
      : tokens.layout.rail.collapsed
    : 0;

  // Slides in from whichever edge it is anchored to.
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [isWide ? 16 : -16, 0],
  });
  const dismiss = () =>
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) hide();
    });

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.host,
        { left: TOAST_GUTTER + railInset },
        isWide
          ? { bottom: insets.bottom + TOAST_BOTTOM }
          : { top: insets.top + 8 },
      ]}
    >
      <Animated.View
        style={[styles.animWrap, { opacity: anim, transform: [{ translateY }] }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={message}
          onPress={dismiss}
          style={styles.toast}
        >
          <View style={styles.iconWrap}>
            <Icon
              name="Check"
              size={14}
              color={tokens.colors.forest[900]}
            />
          </View>
          <Text style={styles.text} numberOfLines={2}>
            {message}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/** The frames sit the wide toast 30 above the bottom safe area. */
const TOAST_BOTTOM = 30;
const TOAST_GUTTER = 16;

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: TOAST_GUTTER,
    alignItems: 'center',
    zIndex: 9999,
  },
  animWrap: { width: '100%', alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 460,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii.xl,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.colors.amber[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13.5,
    lineHeight: 18,
    color: tokens.colors.cream[50],
  },
});
