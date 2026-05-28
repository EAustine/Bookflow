/**
 * ModeTogglePill — two-state segmented control used in the reader chrome
 * to switch between "full" rendering (native PDF for PDFs, WebView /
 * original-formatting for EPUBs) and "text" mode (paginated extracted
 * text with word-tap, sentence-translate, save-highlight).
 *
 * Replaces the previous chapters icon at top right; chapters now live
 * exclusively in the bottom action bar. Designed to read at a glance:
 * the active half is filled, the inactive half is hairline-only.
 *
 * Variant ("dark" / "light") lets the caller match the surrounding
 * chrome — PDF reader uses a black-translucent header so it needs the
 * dark variant; EPUB reader uses the page surface so it needs the light.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type ReaderMode = 'full' | 'text';

export type ModeTogglePillProps = {
  mode: ReaderMode;
  onChange: (mode: ReaderMode) => void;
  /** Light by default; dark for translucent-on-black headers (PDF reader). */
  variant?: 'light' | 'dark';
  /** Override labels — defaults are "Full" and "Text". */
  fullLabel?: string;
  textLabel?: string;
};

export function ModeTogglePill({
  mode,
  onChange,
  variant = 'light',
  fullLabel = 'Full',
  textLabel = 'Text',
}: ModeTogglePillProps) {
  const isDark = variant === 'dark';
  return (
    <View style={[styles.pill, isDark ? styles.pillDark : styles.pillLight]}>
      <PillHalf
        active={mode === 'full'}
        label={fullLabel}
        onPress={() => onChange('full')}
        variant={variant}
      />
      <PillHalf
        active={mode === 'text'}
        label={textLabel}
        onPress={() => onChange('text')}
        variant={variant}
      />
    </View>
  );
}

function PillHalf({
  active,
  label,
  onPress,
  variant,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  variant: 'light' | 'dark';
}) {
  const isDark = variant === 'dark';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={6}
      // Press feedback — both halves dim slightly on tap so the user
      // gets immediate tactile confirmation. Active half also gets a
      // subtle shadow on iOS / elevation on Android in the styles
      // below, which the inactive half lacks.
      style={({ pressed }) => [
        styles.half,
        active &&
          (isDark ? styles.halfActiveDark : styles.halfActiveLight),
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.label,
          active
            ? isDark
              ? styles.labelActiveDark
              : styles.labelActiveLight
            : isDark
            ? styles.labelInactiveDark
            : styles.labelInactiveLight,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 13,
    padding: 2,
    gap: 0,
  },
  // Light variant — slightly darker pill bg than before so the active
  // half (cream/canvas) actually stands out. Previously the active was
  // *lighter* than the pill, which read as the wrong half being
  // selected.
  pillLight: {
    backgroundColor: tokens.colors.ink[200],
  },
  // Dark variant — translucent white so the pill nests into a dark
  // reader theme instead of glaring as a bright capsule. The active
  // half is a darker cream so it still pops against the surrounding
  // tint.
  pillDark: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  half: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 11,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Active half on light bg: clean white surface, soft shadow for lift.
  halfActiveLight: {
    backgroundColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  halfActiveDark: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '600',
  },
  labelActiveLight: {
    color: tokens.textColors.primary,
  },
  labelInactiveLight: {
    color: tokens.textColors.muted,
  },
  // Active label on dark variant — sits on the brighter inner
  // capsule, so a dark ink colour reads against it.
  labelActiveDark: {
    color: tokens.colors.ink[900],
  },
  labelInactiveDark: {
    color: 'rgba(255,255,255,0.6)',
  },
});
