/**
 * RailMiniPlayer — the Desktop mini player, docked in the side rail.
 *
 * Figma `Rail mini player` `295:98`: 208 × 138, with the cover and
 * title stacked over a 2px progress line and a centred page-prev /
 * play / page-next row. 208 is just the 240 rail minus its 16 padding
 * either side, so the card takes the width it is given rather than
 * carrying a number of its own.
 *
 * Desktop only. The build log keeps Expanded on the bar along the
 * bottom of the content, and the rail is only `expanded` — wide enough
 * for this — on Desktop.
 *
 * **It reads the audio session itself, on purpose.** The shell
 * subscribes to `useAudioStable()`, which deliberately leaves out
 * `positionSeconds`, `isPlaying` and friends so the whole stage does
 * not re-render three or four times a second. Anything that wants the
 * live position has to be a leaf that subscribes for itself — the same
 * shape `MiniPlayer` and `ListenHomeWithLiveAudio` already use.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useAudioSession } from '../api/audioSession';

export type RailMiniPlayerProps = {
  /** Open the foreground player. The card body is the target. */
  onExpand: () => void;
};

export function RailMiniPlayer({ onExpand }: RailMiniPlayerProps) {
  const audio = useAudioSession();

  const book = audio.book;
  if (!book) return null;

  const scrubPos =
    audio.durationSeconds > 0
      ? Math.max(0, Math.min(1, audio.positionSeconds / audio.durationSeconds))
      : 0;

  // Page prev / next, clamped — the same reading of the outer two
  // transport buttons the now-playing card uses. `PlayerSkip*` is the
  // page affordance in this app, not a 15-second seek.
  const goPrev = () => {
    const prev = Math.max(0, audio.pageIndex - 1);
    if (prev !== audio.pageIndex) audio.setPageIndex(prev);
  };
  const goNext = () => {
    const total = Math.max(1, book.totalPages || 1);
    const next = Math.min(total - 1, audio.pageIndex + 1);
    if (next !== audio.pageIndex) audio.setPageIndex(next);
  };

  return (
    <Pressable
      style={styles.card}
      onPress={onExpand}
      accessibilityRole="button"
      accessibilityLabel="Expand player"
    >
      <View style={styles.top}>
        <View style={styles.cover}>
          <Text style={styles.coverText} numberOfLines={4}>
            {book.title}
          </Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {book.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            Page {audio.pageIndex + 1}
          </Text>
        </View>
      </View>

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${scrubPos * 100}%` as `${number}%` },
          ]}
        />
      </View>

      <View style={styles.controls}>
        <Control label="Previous page" icon="PlayerSkipBack" onPress={goPrev} />
        <Pressable
          style={styles.playBtn}
          onPress={(e) => {
            // The card body expands; the controls must not.
            e.stopPropagation();
            if (audio.isPlaying) audio.pause();
            else audio.play();
          }}
          accessibilityRole="button"
          accessibilityLabel={audio.isPlaying ? 'Pause' : 'Play'}
        >
          <Icon
            name={audio.isPlaying ? 'Pause' : 'Play'}
            size={16}
            color={tokens.colors.cream[50]}
            strokeWidth={0}
          />
        </Pressable>
        <Control label="Next page" icon="PlayerSkipForward" onPress={goNext} />
      </View>
    </Pressable>
  );
}

function Control({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: 'PlayerSkipBack' | 'PlayerSkipForward';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.btn}
      onPress={(e) => {
        e.stopPropagation();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Icon name={icon} size={18} color={tokens.overlay.onDark.alpha[75]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.radii.xl,
    padding: tokens.space.md,
    gap: tokens.space.md,
  },
  top: {
    flexDirection: 'row',
    gap: 10,
  },
  /**
   * There is no cover artwork anywhere in the player — the bar does
   * the same thing, painting the title small inside a forest square.
   * 36 × 52 is the frame's portrait ratio.
   */
  cover: {
    width: 36,
    height: 52,
    borderRadius: tokens.radii.xs,
    backgroundColor: tokens.colors.forest[700],
    padding: 3,
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
  coverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 5,
    lineHeight: 7,
    color: tokens.overlay.onDark.alpha[60],
  },
  info: { flex: 1, minWidth: 0, justifyContent: 'center' },
  title: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.xs,
    lineHeight: 16,
    color: tokens.colors.cream[50],
  },
  meta: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xxs,
    lineHeight: 14,
    color: tokens.overlay.onDark.alpha[60],
    marginTop: 2,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: tokens.overlay.onDark.track,
    overflow: 'hidden',
  },
  progressFill: {
    height: 2,
    borderRadius: 1,
    backgroundColor: tokens.colors.amber[500],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.lg,
  },
  btn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.overlay.onDark.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
