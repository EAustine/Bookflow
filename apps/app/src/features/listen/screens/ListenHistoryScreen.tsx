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

import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, RecentListenRow, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useBooks } from '~/hooks/useBooks';
import { useAudioSession } from '../index';
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
              <RecentListenRow
                size="regular"
                title={item.title}
                meta={formatMeta(item)}
                initials={(item.title || '??').slice(0, 2).toUpperCase()}
                coverStoragePath={item.coverStoragePath ?? null}
                coverColor={item.coverColor ?? tokens.colors.amber[500]}
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

  // One trailing chip used for all three states (playing / paused /
  // not-started). 32×32 circle matches the size and positioning of
  // the play button on inactive rows so the column doesn't jog
  // when you scroll past the active book.
});
