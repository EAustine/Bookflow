/**
 * PlaybackSpeedSheet — 8-speed grid for the listen player.
 *
 * Per /docs/specs/b4_01_reader_microinteractions.html. Tapping a cell applies
 * the speed immediately (no confirm). The estimate beneath the grid recomputes
 * from `chapterRemainingMinAt1x / speed`.
 */

import { forwardRef, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Speed catalog ────────────────────────────────────────────────────────────

export type Speed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2 | 3;

type SpeedDef = {
  value: Speed;
  display: string;
  label: string;
  description: string;
};

const SPEEDS: SpeedDef[] = [
  { value: 0.5,  display: '0.5×',  label: 'Slow',       description: 'Half speed — useful for unfamiliar accents or dense passages.' },
  { value: 0.75, display: '0.75×', label: 'Leisurely',  description: 'A relaxed pace, slower than natural speech.' },
  { value: 1,    display: '1×',    label: 'Normal',     description: 'Natural narration speed — exactly how the audio was recorded.' },
  { value: 1.25, display: '1.25×', label: 'Brisk',      description: '1.25× — slightly faster than natural speech. Most people find this easy to follow while listening.' },
  { value: 1.5,  display: '1.5×',  label: 'Fast',       description: '1.5× — noticeably faster. Comprehension stays high once your ear adjusts.' },
  { value: 1.75, display: '1.75×', label: 'Quick',      description: 'Fast pace — best for re-listening or when content is familiar.' },
  { value: 2,    display: '2×',    label: 'Rapid',      description: 'Twice natural speed. Great for review; harder for first listens.' },
  { value: 3,    display: '3×',    label: 'Sprint',     description: 'Triple speed. Demanding to follow — use for skimming familiar material.' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export type PlaybackSpeedSheetProps = {
  speed: Speed;
  /** Remaining minutes of the current chapter at 1× speed. */
  chapterRemainingMinAt1x: number;
  chapterLabel?: string; // e.g. "Chapter 4"
  onChange: (s: Speed) => void;
  onDismiss?: () => void;
};

// ─── Sheet ────────────────────────────────────────────────────────────────────

export const PlaybackSpeedSheet = forwardRef<BottomSheetModal, PlaybackSpeedSheetProps>(
  function PlaybackSpeedSheet(
    { speed, chapterRemainingMinAt1x, chapterLabel = 'this chapter', onChange, onDismiss },
    ref,
  ) {
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={tokens.bottomSheet.backdropOpacity}
          pressBehavior="close"
        />
      ),
      [],
    );

    const current = SPEEDS.find((s) => s.value === speed) ?? SPEEDS[2]!;
    const adjusted = chapterRemainingMinAt1x / speed;
    const minutes = Math.floor(adjusted);
    const seconds = Math.round((adjusted - minutes) * 60);
    const estimate = minutes >= 1 ? `~${minutes} min ${seconds.toString().padStart(2, '0')} sec` : `~${seconds} sec`;

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.bg}
        handleIndicatorStyle={styles.handle}
        onDismiss={onDismiss}
      >
        <BottomSheetView style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Playback speed</Text>
            <Pressable
              onPress={onDismiss ?? (() => {})}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityLabel="Close"
            >
              <Icon name="X" size={12} color={tokens.textColors.muted} strokeWidth={2.5} />
            </Pressable>
          </View>

          {/* 2×4 grid */}
          <View style={styles.grid}>
            {SPEEDS.map((s) => {
              const active = s.value === speed;
              return (
                <Pressable
                  key={s.value}
                  style={[styles.cell, active && styles.cellActive]}
                  onPress={() => onChange(s.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.cellValue, active && styles.cellValueActive]}>
                    {s.display}
                  </Text>
                  <Text style={[styles.cellLabel, active && styles.cellLabelActive]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Description */}
          <View style={styles.desc}>
            <Icon name="Info" size={14} color={tokens.colors.forest[800]} strokeWidth={1.5} />
            <Text style={styles.descText}>{current.description}</Text>
          </View>

          {/* Time estimate */}
          <Text style={styles.estimate}>
            {chapterLabel} will finish in <Text style={styles.estimateBold}>{estimate}</Text> at this speed
          </Text>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  content: {
    paddingBottom: 22,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2x4 grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 8,
  },
  cell: {
    width: '23%', // 4 per row with gap
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tokens.colors.ink[200],
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  cellActive: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  cellValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 18,
  },
  cellValueActive: { color: tokens.colors.forest[800] },
  cellLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.05,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
  },
  cellLabelActive: { color: tokens.colors.forest[700] },

  // Description
  desc: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 9,
  },
  descText: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.forest[800],
    lineHeight: 17,
  },

  // Estimate
  estimate: {
    textAlign: 'center',
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  estimateBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
});
