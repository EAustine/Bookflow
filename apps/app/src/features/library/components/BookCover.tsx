/**
 * BookCover — a book's cover art, or its initial on the book's colour.
 *
 * Moved out of `LibraryScreen` so the grid tile and the book pane can
 * use it without importing from a screen (which would put a cycle
 * through the feature barrel, the shape that crashed the M3 launch).
 *
 * The named sizes are the ones the phone layout uses. A grid tile does
 * not have a fixed size — its width falls out of the window width and
 * the column count — so it passes `width` instead and the height comes
 * from the 2:3 cover ratio the designs use throughout.
 */

import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Icon } from '~/components/Icon';
import { Text } from '~/components/Text';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/core/bookCovers';
import { useDownloadsStore } from '~/stores/downloadsStore';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';

export type BookCoverSize = 'sm' | 'hero' | 'result';

const COVER_DIMS = {
  sm:     { width: 40, height: 60, radius: tokens.radii.xs, fontSize: 16 },
  hero:   { width: 64, height: 96, radius: tokens.radii.sm, fontSize: 22 },
  result: { width: 36, height: 54, radius: tokens.radii.xs, fontSize: 14 },
} as const;

/** Cover aspect, used wherever a cover is sized by width alone. */
export const COVER_ASPECT = 3 / 2;

export type BookCoverProps = {
  book: Book;
  size?: BookCoverSize;
  /**
   * Explicit width, overriding `size`. Height follows `COVER_ASPECT`
   * and the initial scales with it, so a tile cover reads the same at
   * 153 as at 200.
   */
  width?: number;
};

export function BookCover({ book, size = 'sm', width }: BookCoverProps) {
  const named = COVER_DIMS[size];
  const dims =
    width === undefined
      ? named
      : {
          width,
          height: Math.round(width * COVER_ASPECT),
          radius: tokens.radii.sm,
          // Roughly the ratio the named sizes use, so the letter keeps
          // its weight on the cover at any tile width.
          fontSize: Math.round(width * 0.36),
        };

  const path = book.coverStoragePath ?? null;
  const isDownloaded = useDownloadsStore(
    (s) => s.downloads[book.id]?.status === 'complete',
  );
  // Lazy init from the cache so an already-resolved cover paints on the
  // first frame instead of flashing the initial.
  const [coverUrl, setCoverUrl] = useState<string | null>(() =>
    path ? peekCachedCoverUrl(path) : null,
  );

  useEffect(() => {
    if (!path) {
      setCoverUrl(null);
      return;
    }
    let cancelled = false;
    void resolveCoverUrl(path).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View
      style={[
        styles.cover,
        {
          width: dims.width,
          height: dims.height,
          backgroundColor: book.coverColor,
          borderRadius: dims.radius,
          overflow: 'hidden',
        },
      ]}
    >
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={{ width: dims.width, height: dims.height }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.coverInitial, { fontSize: dims.fontSize }]} color="inverse">
          {book.title.charAt(0)}
        </Text>
      )}
      {isDownloaded && (
        <View style={[styles.downloadedBadge, size === 'sm' && styles.downloadedBadgeSm]}>
          <Icon name="Download" size={size === 'sm' ? 7 : 8} color={tokens.colors.cream[50]} />
        </View>
      )}
    </View>
  );
}

/** The thin reading-progress bar that sits under a cover or a title. */
export function ProgressBar({ percent, height }: { percent: number; height: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, { width: `${clamped}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coverInitial: {
    fontFamily: tokens.fonts.display,
    color: tokens.textColors.inverse,
  },
  downloadedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    borderWidth: 2,
    borderColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedBadgeSm: {
    width: 15,
    height: 15,
    borderRadius: 8,
    top: -5,
    right: -5,
    borderWidth: 1.5,
  },
  progressTrack: {
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
});
