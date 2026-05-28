/**
 * ListenHistoryScreen — full list reached via "See all" on the Listen
 * tab's recently-listened section. Lists every book the user has in
 * their library, sorted by `last_read_at` desc so the most-recently
 * engaged book is on top. Tapping a row hands the book off to the
 * audio session; the parent dismisses this screen and routes back to
 * the now-playing card.
 *
 * Why we don't query `reading_sessions` directly: that table has rows
 * per session, requires aggregation to "books last engaged with", and
 * would miss books the user has only opened in the reader. The current
 * `useBooks` hook already returns the user's books with `lastReadAt`
 * which is updated on both reader and player engagement — perfect
 * proxy for "recently listened" until we wire a dedicated query.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EqBars, Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useBooks } from '~/hooks/useBooks';
import { useAudioSession } from '~/lib/audioSession';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/lib/bookCovers';
import { useBackHandler } from '~/lib/useBackHandler';
import type { Book } from '~/types/book';

export type ListenHistoryScreenProps = {
  /** Tap a row to start (or resume) audio for that book. */
  onPlay: (book: Book) => void;
  /** Header back button. Caller decides where to go (typically Listen tab). */
  onBack: () => void;
  /** Highlight the row whose book is currently in the audio session. */
  activeBookId?: string | null;
};

export function ListenHistoryScreen({
  onPlay,
  onBack,
  activeBookId,
}: ListenHistoryScreenProps) {
  // Hardware back returns to the Listen tab via `onBack` instead
  // of letting the gesture bubble up to the root "Press back again
  // to exit" handler. Without this the user landed on the Android
  // app launcher when they expected to land on the Listen home —
  // a one-line wiring miss when the screen was first added.
  useBackHandler(() => {
    onBack();
    return true;
  });

  const { books, isLoading } = useBooks();
  // We need `isPlaying` so the active row can distinguish "paused
  // session" (show pause affordance) from "playing now" (show
  // animated EQ bars). The audio session is already mounted at the
  // app level so this is just a context read — no new playback
  // cost.
  const audio = useAudioSession();

  // Sort by lastReadAt desc — books with no reading history fall to the
  // bottom in addedAt-desc order so the screen still has structure
  // before the user has started listening.
  const sorted = [...books].sort((a, b) => {
    const aT = a.lastReadAt?.getTime() ?? -1;
    const bT = b.lastReadAt?.getTime() ?? -1;
    if (aT !== bT) return bT - aT;
    return b.addedAt.getTime() - a.addedAt.getTime();
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={styles.backBtn}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
        </Pressable>
        <Text style={styles.headerTitle}>Recently listened</Text>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.loadingZone}>
          <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.emptyZone}>
          <Icon
            name="Headphones"
            size={28}
            color={tokens.colors.forest[800]}
            strokeWidth={1.5}
          />
          <Text style={styles.emptyTitle}>No listening history yet</Text>
          <Text style={styles.emptySub}>
            Tap a book from your Library and hit Listen — it&apos;ll show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const isActive = item.id === activeBookId;
            return (
              <Row
                book={item}
                isActive={isActive}
                // Only the active row tracks playback state. For
                // every other row the play button is just a play
                // affordance; isPlaying has no meaning.
                isPlaying={isActive && audio.isPlaying}
                onPress={() => onPlay(item)}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Row({
  book,
  isActive,
  isPlaying,
  onPress,
}: {
  book: Book;
  isActive: boolean;
  /** True only when this is the active row AND audio is currently
   *  playing. Drives the choice of trailing indicator (animated EQ
   *  bars vs. pause icon vs. play icon). */
  isPlaying: boolean;
  onPress: () => void;
}) {
  const meta = formatMeta(book);
  const initials = (book.title || '??').slice(0, 2).toUpperCase();

  // Cover image. Loads via the shared bookCovers cache so a cover
  // already seen on Library / Now Playing paints instantly here.
  // Falls back to the colored initials chip when there's no cover
  // path or the signed URL fetch returns null.
  const coverPath = book.coverStoragePath ?? null;
  const [coverUrl, setCoverUrl] = useState<string | null>(() =>
    coverPath ? peekCachedCoverUrl(coverPath) : null,
  );
  useEffect(() => {
    if (!coverPath) {
      setCoverUrl(null);
      return;
    }
    let cancelled = false;
    void resolveCoverUrl(coverPath).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [coverPath]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isActive && styles.rowActive,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
      accessibilityRole="button"
    >
      <View
        style={[
          styles.cover,
          {
            // The colored fill shows through any margin around the
            // image, and is the full cover when no image is loaded.
            backgroundColor: book.coverColor ?? tokens.colors.amber[500],
          },
        ]}
      >
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <Text style={styles.coverText}>{initials}</Text>
        )}
      </View>
      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[styles.title, isActive && { color: tokens.colors.forest[800] }]}
        >
          {book.title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.meta, isActive && { color: tokens.colors.forest[700] }]}
        >
          {meta}
        </Text>
      </View>
      {/* Trailing indicator. Three states, all in the same 32×32
       *  circle so they line up vertically with the play buttons on
       *  inactive rows — no horizontal drift between active/inactive.
       *    1. active + playing  → animated EQ bars (audio is audible)
       *    2. active + paused   → Pause icon (this is the session,
       *                            tap to resume via the now-playing
       *                            card)
       *    3. inactive          → Play icon (start a new session) */}
      <View style={[styles.trailing, isActive && styles.trailingActive]}>
        {isActive && isPlaying ? (
          <EqBars
            playing
            height={14}
            color={tokens.colors.forest[800]}
          />
        ) : isActive ? (
          <Icon
            name="Pause"
            size={12}
            color={tokens.colors.forest[800]}
            strokeWidth={0}
          />
        ) : (
          <Icon
            name="Play"
            size={12}
            color={tokens.textColors.secondary}
            strokeWidth={0}
          />
        )}
      </View>
    </Pressable>
  );
}

function formatMeta(book: Book): string {
  if (book.progressPercent === 100) return 'Finished';
  if (book.progressPercent === 0) return 'Not started';
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  return pageNum
    ? `Page ${pageNum} · ${book.progressPercent}% done`
    : `${book.progressPercent}% done`;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: -0.2,
  },

  loadingZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginTop: 6,
  },
  emptySub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },

  list: {
    paddingVertical: 8,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
    marginLeft: 18 + 44 + 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  rowActive: {
    backgroundColor: tokens.colors.forest[50],
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    width: 44,
    height: 44,
  },
  coverText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    letterSpacing: 0.04,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  meta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 2,
  },

  // One trailing chip used for all three states (playing / paused /
  // not-started). 32×32 circle matches the size and positioning of
  // the play button on inactive rows so the column doesn't jog
  // when you scroll past the active book.
  trailing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
  },
  trailingActive: {
    backgroundColor: tokens.colors.forest[50],
  },
});
