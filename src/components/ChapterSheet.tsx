import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Tidy a page-title string for display. EPUB tables of contents often
 * carry a numeric prefix that the navigator already shows as the row
 * number (e.g. "1. Chapter 1" rendered alongside the "1" badge reads
 * as "1. 1. Chapter 1"). Strip:
 *   - leading whitespace
 *   - leading "1.", "01.", "1 " patterns (ASCII digits + dot or space)
 *   - leading "Chapter N: " when the rest is more descriptive
 *
 * Returns trimmed string. An empty input returns ''.
 */
function cleanPageTitle(raw: string | null | undefined): string {
  if (!raw) return '';
  let t = raw.trim();
  // Strip leading "12." or "12 "
  t = t.replace(/^\d+[.\s]\s*/, '');
  // Collapse repeating whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

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
  /**
   * When provided, the sheet renders these real pages (from Supabase).
   * `onSelectChapter` then receives the 0-based `page_index`. When
   * omitted (legacy callers like ListenScreen), the sheet generates a
   * mock list and emits 1-based numbers as before. Field name is still
   * `chapter_index` on this prop for back-compat with consumers; Step 4
   * will rename it to `page_index` end-to-end.
   */
  chapters?: Array<{
    id: string;
    page_index: number;
    pdf_page_number: number | null;
    title: string | null;
    word_count: number | null;
  }>;
  /** 0-based active page when `chapters` is provided. */
  currentChapterIndex?: number;
  onSelectChapter?: (num: number) => void;
};

const SNAP_POINTS = ['75%'];

// ─── Component ────────────────────────────────────────────────────────────────

export const ChapterSheet = forwardRef<BottomSheetRef, ChapterSheetProps>(
  function ChapterSheet(
    {
      book,
      mode,
      totalSecs = 0,
      scrubPos = 0,
      chapters: realChapters,
      currentChapterIndex,
      onSelectChapter,
    },
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

    // Detect chapter starts in the real-pages list. A "chapter" is a
    // page with a non-empty title — process-book sets this on the
    // first page of each detected chapter heading (PDF + OCR) or
    // each labeled spine item (EPUB TOC). When there's at least one,
    // we expose a toggle between the full page list and a
    // chapters-only view; when there are none, the toggle stays
    // hidden and the sheet behaves as before.
    const titledChapters = useMemo(
      () =>
        (realChapters ?? []).filter(
          (c) => c.title != null && c.title.trim().length > 0,
        ),
      [realChapters],
    );
    const hasChapters = titledChapters.length > 0;
    // Default to chapters-only when chapters exist — it's almost
    // always what the user wants when opening the sheet. They can
    // flip to "All pages" if they need fine-grained navigation.
    const [filter, setFilter] = useState<'chapters' | 'pages'>('chapters');
    // If the user picked 'chapters' but the book doesn't have any
    // detected, silently fall through to 'pages' so the sheet
    // doesn't render an empty list. The toggle stays hidden in that
    // case (see the header below).
    const effectiveFilter: 'chapters' | 'pages' = hasChapters
      ? filter
      : 'pages';

    // Two paths:
    //   1. Real page data passed in (Reader, post-upload books) — use the
    //      0-based page_index from the DB and titles where available.
    //   2. Legacy/mock fallback — generate 9 placeholder chapter rows from
    //      `GATSBY_TITLES` when no real list is available. ListenScreen
    //      still hits this until its data is rewired to the page model.
    let chapters: ChapterItem[];
    let total: number;

    if (realChapters && realChapters.length > 0) {
      const displayed =
        effectiveFilter === 'chapters' ? titledChapters : realChapters;
      total = displayed.length;
      const activeIdx = currentChapterIndex ?? 0;
      // In chapters-only mode "active" is the chapter whose page
      // range contains the active page index. We compute that by
      // walking the chapter starts and finding the latest one whose
      // page_index is ≤ activeIdx.
      let activeChapterPageIndex: number | null = null;
      if (effectiveFilter === 'chapters') {
        for (const c of titledChapters) {
          if (c.page_index <= activeIdx) activeChapterPageIndex = c.page_index;
          else break;
        }
      }
      chapters = displayed.map((c) => {
        const idx = c.page_index;
        const num = idx + 1;
        const title = cleanPageTitle(c.title) || `Page ${num}`;
        const isActive =
          effectiveFilter === 'chapters'
            ? idx === activeChapterPageIndex
            : idx === activeIdx;
        const isFinished =
          effectiveFilter === 'chapters'
            ? activeChapterPageIndex !== null && idx < activeChapterPageIndex
            : idx < activeIdx;
        if (isActive) {
          return {
            num,
            title,
            state: 'active',
            progress: book.progressPercent / 100,
            elapsedSecs: Math.round(scrubPos * totalSecs),
            totalSecs,
          };
        }
        if (isFinished) {
          return { num, title, state: 'finished', progress: 1 };
        }
        return { num, title, state: 'unread', progress: 0 };
      });
    } else {
      total = 9;
      const currentNum = parseInt(
        book.currentChapter?.match(/\d+/)?.[0] ?? '1',
        10,
      );
      chapters = Array.from({ length: total }, (_, i) => {
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
    }

    const usingRealChapters = !!(realChapters && realChapters.length > 0);
    const renderItem = useCallback(
      ({ item }: { item: ChapterItem }) => (
        <ChapterRow
          chapter={item}
          mode={mode}
          onPress={() => {
            // Real-data callers expect 0-based chapter_index; legacy
            // (mock) callers expect 1-based num. Translate at the boundary.
            onSelectChapter?.(usingRealChapters ? item.num - 1 : item.num);
            modalRef.current?.dismiss();
          }}
        />
      ),
      [mode, onSelectChapter, usingRealChapters],
    );

    // Sheet title — reflects the current view. Real-pages path can
    // be "Chapters" or "Pages" depending on the filter; mock-fallback
    // path always says "Chapters" because GATSBY_TITLES are chapters.
    const usingRealList = !!(realChapters && realChapters.length > 0);
    const showAsChapters =
      usingRealList ? effectiveFilter === 'chapters' : true;
    const titleLabel = showAsChapters ? 'Chapters' : 'Pages';
    const unitLabel = showAsChapters
      ? total === 1
        ? 'chapter'
        : 'chapters'
      : total === 1
        ? 'page'
        : 'pages';

    const header = (
      <View style={styles.sheetHeader}>
        <View style={styles.sheetHeaderTopRow}>
          <View style={styles.sheetHeaderTextCol}>
            <Text style={styles.sheetTitle}>{titleLabel}</Text>
            <Text style={styles.sheetBookName} numberOfLines={1}>
              {book.title} · {total} {unitLabel}
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
        {usingRealList && hasChapters && (
          <View
            style={styles.filterRow}
            accessibilityRole="tablist"
            accessibilityLabel="View as"
          >
            <FilterPill
              label="Chapters"
              active={filter === 'chapters'}
              onPress={() => setFilter('chapters')}
            />
            <FilterPill
              label="All pages"
              active={filter === 'pages'}
              onPress={() => setFilter('pages')}
            />
          </View>
        )}
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

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        active && styles.filterPillActive,
        pressed && !active && { opacity: 0.7 },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[styles.filterPillLabel, active && styles.filterPillLabelActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

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
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.colors.ink[200],
    gap: 12,
  },
  sheetHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetHeaderTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.ink[100],
  },
  filterPillActive: {
    backgroundColor: tokens.colors.forest[800],
    borderColor: tokens.colors.forest[800],
  },
  filterPillLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  filterPillLabelActive: {
    color: tokens.colors.cream[50],
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
