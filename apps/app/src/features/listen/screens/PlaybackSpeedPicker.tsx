/**
 * PlaybackSpeedPicker — the body of the playback-speed control, in two
 * densities.
 *
 * Figma `Panel / Playback speed (compact)` `372:448` for the popover
 * and `Sheet / Playback speed` for the phone. Both are one row per
 * speed — the speed, then its name in muted text, with the selected
 * row tinted and checked. The phone additionally keeps the description
 * of the selected speed and the time estimate; the popover drops both,
 * which is the whole difference and the reason this is a flag rather
 * than two components.
 *
 * It is a plain body, not a container. `Presenter kind="menu"` wraps it
 * in a bottom sheet on Compact and a 340 popover above, so this file
 * never knows which one it is in.
 *
 * Replaces the 8-cell grid that shipped here and was never wired to
 * anything — only its `Speed` type was ever imported, and that type
 * belongs to `@bookflow/shared` anyway.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { SPEED_CATALOG, type Speed } from '@bookflow/shared/src';

export type { Speed };

export type PlaybackSpeedPickerProps = {
  speed: Speed;
  onChange: (next: Speed) => void;
  /** One line per speed and nothing else. The popover presentation. */
  compact?: boolean;
  /** Remaining minutes of the current page at 1×. Full density only. */
  pageRemainingMinAt1x?: number;
  /** What the estimate is about, e.g. "Page 4". Full density only. */
  pageLabel?: string;
};

export function PlaybackSpeedPicker({
  speed,
  onChange,
  compact = false,
  pageRemainingMinAt1x,
  pageLabel = 'this page',
}: PlaybackSpeedPickerProps) {
  const current = SPEED_CATALOG.find((s) => s.value === speed) ?? SPEED_CATALOG[2]!;

  return (
    <View>
      <View style={styles.list}>
        {SPEED_CATALOG.map((s) => {
          const active = s.value === speed;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              // Hard rule 6: the whole row is the target.
              onPress={() => onChange(s.value)}
              style={({ pressed }) => [
                styles.row,
                active && styles.rowActive,
                pressed && !active && { backgroundColor: tokens.bgColors.surface },
              ]}
            >
              <Text style={[styles.value, active && styles.valueActive]}>
                {s.display}
              </Text>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
                {s.label}
              </Text>
              {active && (
                <Icon name="Check" size={18} color={tokens.textColors.accent} />
              )}
            </Pressable>
          );
        })}
      </View>

      {!compact && (
        <>
          <View style={styles.desc}>
            <Icon name="Info" size={14} color={tokens.colors.forest[800]} />
            <Text style={styles.descText}>{current.description}</Text>
          </View>
          {pageRemainingMinAt1x !== undefined && (
            <Text style={styles.estimate}>
              {pageLabel} will finish in{' '}
              <Text style={styles.estimateBold}>
                {formatEstimate(pageRemainingMinAt1x / speed)}
              </Text>{' '}
              at this speed
            </Text>
          )}
        </>
      )}
    </View>
  );
}

/** Minutes as a rough "~4 min 30 sec", or just seconds under a minute. */
function formatEstimate(minutes: number): string {
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  return whole >= 1
    ? `~${whole} min ${seconds.toString().padStart(2, '0')} sec`
    : `~${seconds} sec`;
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: tokens.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    height: 40,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radii.md,
  },
  rowActive: {
    backgroundColor: tokens.bgColors.accentMuted,
  },
  value: {
    // Fixed so the names line up in a column rather than ragging off
    // the width of "0.75×" versus "2×".
    width: 48,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.md,
    color: tokens.textColors.primary,
  },
  valueActive: {
    color: tokens.textColors.accent,
  },
  label: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.sm,
    color: tokens.textColors.muted,
  },
  labelActive: {
    color: tokens.textColors.accent,
  },

  desc: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.space.md,
    marginTop: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: tokens.radii.lg,
  },
  descText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xs,
    lineHeight: 17,
    color: tokens.colors.forest[800],
  },
  estimate: {
    textAlign: 'center',
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxs,
    color: tokens.textColors.subtle,
    paddingTop: tokens.space.md,
  },
  estimateBold: {
    fontFamily: tokens.fonts.uiMedium,
    color: tokens.textColors.secondary,
  },
});
