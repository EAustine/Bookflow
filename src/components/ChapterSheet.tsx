import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import type { BottomSheetRef } from './BottomSheet';

// ─── Mock chapter titles ──────────────────────────────────────────────────────

const GATSBY_TITLES: Record<number, string> = {
  1: 'In My Younger and More Vulnerable Years',
  2: 'The Valley of Ashes',
  3: "The Party at Gatsby's Mansion",
  4: 'On the Road to West Egg',
  5: 'Reuniting Across the Bay',
  6: 'The Truth About James Gatz',
  7: 'The Confrontation at the Plaza',
  8: 'The Death of Gatsby',
  9: 'After the Funeral',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type ChapterState = 'finished' | 'active' | 'unread';

type ChapterItem = {
  num: number;
  title: string;
  state: ChapterState;
  progress: number;
  elapsedSecs?: number;
  totalSecs?: number;
};

export type ChapterSheetProps = {
  book: Book;
  mode: 'reader' | 'listen';
  totalSecs?: number;
  scrubPos?: number;
  onSelectChapter?: (num: number) => void;
};

const SNAP_POINTS = ['75%'];

// ─── Component ────────────────────────────────────────────────────────────────

export const ChapterSheet = forwardRef<BottomSheetRef, ChapterSheetProps>(
  function ChapterSheet(
    { book, mode, totalSecs = 0, scrubPos = 0, onSelectChapter },
    ref,
  ) {
    const modalRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => modalRef.current?.present(),
        dismiss: () => modalRef.current?.dismiss(),
      }),
      [],
    );

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

    const total = book.totalChapters ?? 9;
    const currentNum = parseInt(
      book.currentChapter?.match(/\d+/)?.[0] ?? '1',
      10,
    );

    const chapters: ChapterItem[] = Array.from({ length: total }, (_, i) => {
      const num = i + 1;
      const title = GATSBY_TITLES[num] ?? `Chapter ${num}`;
      if (num < currentNum) {
        return { num, title, state: 'finished', progress: 1 };
      }
      if (num === currentNum) {
        return {
          num,
          title,
          state: 'active',
          progress: book.progressPercent / 100,
          elapsedSecs: Math.round(scrubPos * totalSecs),
          totalSecs,
        };
      }
      return { num, title, state: 'unread', progress: 0 };
    });

    const renderItem = useCallback(
      ({ item }: { item: ChapterItem }) => (
        <ChapterRow
          chapter={item}
          mode={mode}
          onPress={() => {
            onSelectChapter?.(item.num);
            modalRef.current?.dismiss();
          }}
        />
      ),
      [mode, onSelectChapter],
    );

    const header = (
      <View style={styles.sheetHeader}>
        <View>
          <Text style={styles.sheetTitle}>Chapters</Text>
          <Text style={styles.sheetBookName}>
            {book.title} · {total} chapters
          </Text>
        </View>
        <Pressable
          style={styles.closeBtn}
          onPress={() => modalRef.current?.dismiss()}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Icon name="X" size={14} color={tokens.textColors.muted} />
        </Pressable>
      </View>
    );

    return (
      <BottomSheetModal
        ref={modalRef}
        snapPoints={SNAP_POINTS}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        handleStyle={styles.handle}
      >
        <View style={styles.container}>
          {header}
          <BottomSheetFlatList
            data={chapters}
            keyExtractor={(item) => String(item.num)}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </View>
      </BottomSheetModal>
    );
  },
);

// ─── Chapter row ──────────────────────────────────────────────────────────────

function ChapterRow({
  chapter,
  mode,
  onPress,
}: {
  chapter: ChapterItem;
  mode: 'reader' | 'listen';
  onPress: () => void;
}) {
  const isActive = chapter.state === 'active';
  const isFinished = chapter.state === 'finished';
  const isUnread = chapter.state === 'unread';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isActive && styles.rowActive,
        pressed && { backgroundColor: tokens.bgColors.surface },
      ]}
      onPress={onPress}
    >
      {isActive && <View style={styles.rowAccent} />}

      <View
        style={[
          styles.badge,
          isActive && styles.badgeActive,
          isFinished && styles.badgeFinished,
        ]}
      >
        <Text
          style={[
            styles.badgeNum,
            isActive && styles.badgeNumActive,
            isFinished && styles.badgeNumFinished,
          ]}
        >
          {chapter.num}
        </Text>
      </View>

      <View style={styles.content}>
        <Text
          style={[
            styles.chapterTitle,
            isActive && styles.chapterTitleActive,
            isUnread && styles.chapterTitleUnread,
          ]}
          numberOfLines={1}
        >
          {chapter.title}
        </Text>
        <View style={styles.metaRow}>
          {!isUnread && (
            <View style={styles.miniTrack}>
              <View
                style={[
                  styles.miniFill,
                  isFinished && styles.miniFillFinished,
                  { width: chapter.progress * 48 },
                ]}
              />
            </View>
          )}
          {isActive && mode === 'listen' && chapter.elapsedSecs != null && chapter.totalSecs != null ? (
            <Text style={styles.metaTextActive}>
              {Math.round(chapter.progress * 100)}% · {fmt(chapter.elapsedSecs)} / {fmt(chapter.totalSecs)}
            </Text>
          ) : isActive ? (
            <Text style={styles.metaTextActive}>
              {Math.round(chapter.progress * 100)}%
            </Text>
          ) : isFinished ? (
            <Text style={styles.metaText}>Finished</Text>
          ) : (
            <Text style={styles.metaText}>Not started</Text>
          )}
        </View>
      </View>

      {isActive ? (
        <View style={styles.nowChip}>
          <Text style={styles.nowChipLabel}>Now</Text>
        </View>
      ) : isFinished ? (
        <Icon name="Check" size={16} color={tokens.colors.forest[200]} strokeWidth={2} />
      ) : (
        <Icon name="ChevronRight" size={14} color={tokens.colors.ink[200]} strokeWidth={1.5} />
      )}
    </Pressable>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  background: {
    backgroundColor: tokens.colors.cream[50],
    borderTopLeftRadius: tokens.bottomSheet.radius,
    borderTopRightRadius: tokens.bottomSheet.radius,
  },
  handle: {
    paddingTop: tokens.bottomSheet.handle.topMargin,
    paddingBottom: 4,
  },
  handleIndicator: {
    backgroundColor: tokens.colors.ink[300],
    width: tokens.bottomSheet.handle.width,
    height: tokens.bottomSheet.handle.height,
  },
  container: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
  },
  sheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  sheetBookName: {
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[100],
    position: 'relative',
  },
  rowActive: {
    backgroundColor: tokens.colors.forest[50],
  },
  rowAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  badgeActive: {
    backgroundColor: tokens.colors.forest[800],
  },
  badgeFinished: {
    backgroundColor: tokens.colors.forest[50],
  },
  badgeNum: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  badgeNumActive: {
    color: tokens.colors.cream[50],
  },
  badgeNumFinished: {
    color: tokens.colors.forest[800],
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  chapterTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 3,
  },
  chapterTitleActive: {
    color: tokens.colors.forest[800],
  },
  chapterTitleUnread: {
    color: tokens.colors.ink[400],
    fontWeight: '400',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniTrack: {
    width: 48,
    height: 2,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 1,
    overflow: 'hidden',
  },
  miniFill: {
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 1,
  },
  miniFillFinished: {
    backgroundColor: tokens.colors.forest[200],
  },
  metaText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
  metaTextActive: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.forest[700],
  },
  nowChip: {
    backgroundColor: tokens.colors.forest[100],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
});
