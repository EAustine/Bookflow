/**
 * SettingsSection — a labelled group of rows. Figma's `sectionLabel`
 * plus `listGroup`.
 *
 * Extracted in M6. The same label-over-rounded-card was written three
 * times: `settingsSection` here, `sectionGroup` in `AccountScreen` and
 * `sectionBlock` in `SettingsScreen`. Only this one is used by the You
 * master, which M6 rebuilds, so only this one moved; the other two are
 * recorded.
 *
 * The frames inset the card by 16 at every size — 408 in the 440
 * master, 568 in the 600 Medium column, 528 in the 560 detail column —
 * so there is no size-class branch here. The container sets the width
 * and this fills it.
 */

import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '~/components';
import { tokens } from '~/design/tokens';

export type SettingsSectionProps = {
  label: string;
  children: ReactNode;
};

export function SettingsSection({ label, children }: SettingsSectionProps) {
  return (
    <View style={styles.section}>
      <Text variant="label-sm" color="subtle" style={styles.label}>
        {label}
      </Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/** The hairline between two rows in a group. */
export function SettingsDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  section: {
    marginBottom: tokens.space.xl,
  },
  label: {
    paddingHorizontal: tokens.space.lg,
    marginBottom: tokens.space.xs,
  },
  group: {
    marginHorizontal: tokens.space.lg,
    backgroundColor: tokens.bgColors.canvas,
    borderRadius: tokens.radii.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
    // Aligns the divider with the start of row content (icon-bg width 32 +
    // row gap), so the leading icon column reads as a continuous strip.
    marginLeft: tokens.space.lg + 32 + tokens.listRow.gap,
  },
});
