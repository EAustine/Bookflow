/**
 * BookGridTile — one book in the tablet-portrait cover grid.
 *
 * Figma `Book grid tile` `324:975`. §4 of the responsive brief: Medium
 * shows a 4-column grid instead of the phone's list, a tap opens the
 * reader and a long press opens the book actions menu.
 *
 * The five states are the ones `bookState()` returns. Processing and
 * Failed behave exactly as they do in the list row — a processing book
 * cannot be opened, and a failed one routes to remove — because a tile
 * is a different presentation of the same row, not a different
 * affordance.
 */

import { memo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '~/components/Icon';
import { Text } from '~/components/Text';
import { useDownloadsStore } from '~/stores/downloadsStore';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';
import { BookCover, ProgressBar } from './BookCover';
import { bookState, bookStatusLine } from './bookStatus';

export type BookGridTileProps = {
  book: Book;
  /** Tile width, which is also the cover width. From `BookGrid`. */
  width: number;
  /** `now` is passed in so the tile stays pure and `memo` can hold. */
  now: Date;
  onPress: (book: Book) => void;
  onRemove?: (book: Book) => void;
  /**
   * The second argument is this tile's own view, so the wide-screen
   * context menu anchors to the tile that was pressed.
   */
  onLongPress?: (book: Book, node: View | null) => void;
};

export const BookGridTile = memo(function BookGridTile({
  book,
  width,
  now,
  onPress,
  onRemove,
  onLongPress,
}: BookGridTileProps) {
  const tileRef = useRef<View | null>(null);
  const state = bookState(book);
  const isProcessing = state === 'processing';
  const isFailed = state === 'failed';
  const download = useDownloadsStore((s) => s.downloads[book.id]);
  const isDownloadingAudio = download?.status === 'downloading';
  const dlPct =
    download && download.totalPages > 0
      ? Math.round((download.completedPages / download.totalPages) * 100)
      : 0;

  const handlePress = () => {
    if (isProcessing) return;
    if (isFailed && onRemove) {
      onRemove(book);
      return;
    }
    onPress(book);
  };

  return (
    <Pressable
      ref={tileRef}
      accessibilityRole="button"
      accessibilityLabel={book.title}
      onPress={handlePress}
      onLongPress={onLongPress ? () => onLongPress(book, tileRef.current) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        { width },
        styles.tile,
        pressed && !isProcessing && styles.tilePressed,
        isProcessing && styles.tileProcessing,
      ]}
    >
      <View style={styles.coverWrap}>
        <BookCover book={book} width={width} />
        {isFailed && (
          // A scrim rather than a replaced cover, so the book is still
          // recognisable while it says it needs attention.
          <View style={styles.failedScrim}>
            <Icon name="AlertCircle" size={24} color={tokens.colors.error} />
          </View>
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {book.title}
      </Text>
      <Text variant="body-xs" color="muted" numberOfLines={1}>
        {book.author}
      </Text>

      {!isProcessing && !isFailed && state !== 'not-started' && (
        <View style={styles.progressWrap}>
          <ProgressBar percent={book.progressPercent} height={2} />
        </View>
      )}

      {isProcessing ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={tokens.textColors.subtle} />
          <Text variant="body-xs" color="subtle" numberOfLines={1}>
            Processing…
          </Text>
        </View>
      ) : isFailed ? (
        <Text variant="body-xs" color="error" numberOfLines={2}>
          Upload failed · tap to remove
        </Text>
      ) : isDownloadingAudio ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={tokens.colors.forest[600]} />
          <Text variant="body-xs" color="subtle" numberOfLines={1}>
            {`Downloading audio… ${dlPct}%`}
          </Text>
        </View>
      ) : (
        <Text
          variant="body-xs"
          color={state === 'not-started' ? 'disabled' : 'subtle'}
          numberOfLines={1}
        >
          {bookStatusLine(book, now)}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: {
    gap: 2,
  },
  tilePressed: {
    opacity: 0.8,
  },
  tileProcessing: {
    opacity: 0.7,
  },
  coverWrap: {
    marginBottom: tokens.space.sm,
  },
  failedScrim: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.overlay.onLight.scrim,
    borderRadius: tokens.radii.sm,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.ui.sm,
    lineHeight: 18,
    color: tokens.textColors.primary,
  },
  progressWrap: {
    paddingTop: 4,
    paddingBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.xs,
  },
});
