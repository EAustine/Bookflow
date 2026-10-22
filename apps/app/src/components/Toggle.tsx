import { Pressable, StyleSheet, View } from 'react-native';
import { tokens } from '~/design/tokens';

/**
 * The switch. One implementation for every surface that needs one.
 *
 * Geometry is fixed by the list-row spec
 * (`docs/specs/bookflow_list_row_system.html` → "Toggle (36×22,
 * forest-800 when on)"). Before this component existed the app shipped
 * three separate toggles — ListRow's at 36×22 and two copies at 44×26
 * in SettingsScreen and YouDrillScreens — which put two different
 * switch sizes one tap apart on the You tab.
 *
 * Two modes:
 *   - `onChange` omitted → a display-only switch. ListRow uses this
 *     because the whole row is the tap target (hard rule 6), so the
 *     switch itself must not swallow the press.
 *   - `onChange` passed → the switch is its own Pressable, for rows
 *     that aren't built on ListRow.
 */

export type ToggleProps = {
  value: boolean;
  /**
   * Omit for a display-only switch whose parent owns the tap. Pass a
   * handler to make the switch itself pressable.
   */
  onChange?: (value: boolean) => void;
  /**
   * Present but not actionable — e.g. the notification rows while the
   * OS permission is denied. Dims to 50% and forces the off track so
   * the control doesn't imply a setting that can't take effect.
   */
  dimmed?: boolean;
};

export function Toggle({ value, onChange, dimmed = false }: ToggleProps) {
  const trackColor =
    dimmed || !value ? tokens.colors.ink[300] : tokens.colors.forest[800];

  const body = (
    <View
      style={[
        styles.track,
        { backgroundColor: trackColor },
        dimmed && styles.dimmed,
      ]}
    >
      <View
        style={[styles.thumb, { transform: [{ translateX: value ? 14 : 0 }] }]}
      />
    </View>
  );

  if (!onChange) return body;

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: dimmed }}
      disabled={dimmed}
      // The switch is small; widen the touch area without changing layout.
      hitSlop={8}
      onPress={() => onChange(!value)}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 36,
    height: 22,
    borderRadius: tokens.radii.full,
    padding: 2,
    justifyContent: 'center',
    flexShrink: 0,
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.colors.cream[50],
    // Keeps the cream thumb legible against the light ink-300 off
    // track. Carried over from the SettingsScreen toggle, which added
    // it for exactly that reason.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  dimmed: { opacity: 0.5 },
});
