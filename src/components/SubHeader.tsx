/**
 * SubHeader — the single header for every sub-page under a tab.
 *
 * Left-aligned title with a circular back button. Three patterns used
 * to coexist on one journey: `AccountScreen.SubHeader` and
 * `SettingsScreen.SubHeader` (left-aligned, hard-coded titles, 30px
 * back button) and `YouDrillScreens.DrillHeader` (centred, 17px title,
 * 36px back button with a 36px spacer to balance it). A user going
 * You → Settings → Reading display crossed all of them and watched the
 * title slide from left to centre. This is the one that stays. (F-30.)
 *
 * The Android hardware-back handler lives here rather than in each
 * screen, so every sub-page gets it by mounting the header. The
 * handlers stack LIFO, which is what makes nesting work: a drill-in
 * opened from Settings registers above Settings' own, so hardware-back
 * returns to Settings rather than skipping past it to the You tab.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';

export type SubHeaderProps = {
  title: string;
  onBack: () => void;
};

export function SubHeader({ title, onBack }: SubHeaderProps) {
  useBackHandler(() => {
    onBack();
    return true;
  });

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    color: tokens.textColors.primary,
    flex: 1,
  },
});
