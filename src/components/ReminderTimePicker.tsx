/**
 * ReminderTimePicker — bottom-sheet body for choosing the daily
 * reading-reminder time. Used by both the Settings screen and the
 * You → Notifications screen so the two surfaces stay identical.
 *
 * Control design — steppers + quick-pick chips, NO scrollable:
 *   This picker lives inside a `@gorhom/bottom-sheet` with
 *   `enableDynamicSizing`. Nested scrollables fight that setup —
 *   a plain RN ScrollView never wins the sheet's pan-gesture
 *   arbitration (doesn't scroll), and gorhom's BottomSheetScrollView
 *   can't be measured by dynamic sizing (collapses the sheet) and
 *   trips a reanimated "scrollTo uninitialized ref" warning. So we
 *   avoid scrolling entirely:
 *     - AM/PM segmented control
 *     - Hour + Minute steppers (−/+), wrapping, for exact control
 *     - Quick-pick minute chips (:00 :15 :30 :45) for the common
 *       cases in one tap — five buttons that fit a row without
 *       scrolling
 *   This still lets the user land on ANY minute (steppers are
 *   1-minute granular) while being completely robust inside the
 *   sheet.
 *
 * The component owns a draft of the selection so taps don't fire a
 * store write per change; the parent commits on "Set time" via
 * `onConfirm(hour24, minute)` and dismisses the sheet.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
// Import directly from the sibling module, NOT the `~/components`
// barrel — this file is itself re-exported from that barrel, so
// importing the barrel here creates a circular dependency that can
// leave `Text` undefined at module-eval time and crash the first
// render. Every other component in this directory imports its
// siblings directly for the same reason.
import { Text } from './Text';
import { Icon } from './Icon';
import { tokens } from '~/design/tokens';
import { formatReminderTime } from '~/lib/notifications';

export type ReminderTimePickerProps = {
  /** Current reminder hour (0-23). */
  hour: number;
  /** Current reminder minute (0-59). */
  minute: number;
  /** Commit handler — receives the chosen 24-hour time. The parent
   * persists it (e.g. to readerStore) and dismisses the sheet. */
  onConfirm: (hour: number, minute: number) => void;
};

const QUICK_MINUTES = [0, 15, 30, 45];

/** 24-hour → { hour12 (1-12), period }. */
function to12(hour24: number): { hour12: number; period: 'AM' | 'PM' } {
  const period: 'AM' | 'PM' = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 || 12;
  return { hour12, period };
}

/** { hour12 (1-12), period } → 24-hour. */
function to24(hour12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

export function ReminderTimePicker({
  hour,
  minute,
  onConfirm,
}: ReminderTimePickerProps) {
  const initial = to12(hour);
  const [hour12, setHour12] = useState(initial.hour12);
  const [min, setMin] = useState(minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(initial.period);

  const previewHour24 = to24(hour12, period);

  // Wrapping steppers — hour 1..12, minute 0..59.
  const incHour = () => setHour12((h) => (h === 12 ? 1 : h + 1));
  const decHour = () => setHour12((h) => (h === 1 ? 12 : h - 1));
  const incMin = () => setMin((m) => (m + 1) % 60);
  const decMin = () => setMin((m) => (m + 59) % 60);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Reminder time</Text>
        <Text style={styles.preview}>
          {formatReminderTime(previewHour24, min)}
        </Text>
      </View>

      {/* AM / PM segmented control */}
      <View style={styles.segment}>
        {(['AM', 'PM'] as const).map((p) => {
          const active = period === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              onPress={() => setPeriod(p)}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  active && styles.segmentLabelActive,
                ]}
              >
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Hour + minute steppers */}
      <View style={styles.steppers}>
        <Stepper
          label="Hour"
          value={String(hour12)}
          onDecrement={decHour}
          onIncrement={incHour}
        />
        <Stepper
          label="Minute"
          value={String(min).padStart(2, '0')}
          onDecrement={decMin}
          onIncrement={incMin}
        />
      </View>

      {/* Quick-pick minutes — common cases in one tap */}
      <View style={styles.quickRow}>
        {QUICK_MINUTES.map((qm) => {
          const active = min === qm;
          return (
            <Pressable
              key={qm}
              accessibilityRole="button"
              onPress={() => setMin(qm)}
              style={({ pressed }) => [
                styles.quickChip,
                active && styles.quickChipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  styles.quickChipLabel,
                  active && styles.quickChipLabelActive,
                ]}
              >
                :{String(qm).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => onConfirm(to24(hour12, period), min)}
        style={({ pressed }) => [
          styles.confirmBtn,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.confirmLabel}>Set time</Text>
      </Pressable>
    </View>
  );
}

function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
}: {
  label: string;
  value: string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={onDecrement}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
        >
          <Icon name="ChevronLeft" size={18} color={tokens.colors.forest[800]} />
        </Pressable>
        <View style={styles.stepValueBox}>
          <Text style={styles.stepValue}>{value}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={onIncrement}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
        >
          <Icon name="ChevronRight" size={18} color={tokens.colors.forest[800]} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: tokens.space.md,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  preview: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 10,
    padding: 3,
    marginBottom: tokens.space.lg,
  },
  segmentBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  segmentLabelActive: {
    color: tokens.colors.forest[800],
  },
  steppers: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: tokens.space.lg,
  },
  stepper: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 40,
    height: 52,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValueBox: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 26,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  stepLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: tokens.space.lg,
  },
  quickChip: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
  },
  quickChipActive: {
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[800],
  },
  quickChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  quickChipLabelActive: {
    color: tokens.colors.forest[800],
  },
  confirmBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
