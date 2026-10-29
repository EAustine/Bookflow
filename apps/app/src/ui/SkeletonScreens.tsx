import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { gridColumns, tileWidth } from '@bookflow/shared';
import { Icon, Skeleton, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useSizeClass } from '~/hooks/useSizeClass';

// ─── Library loading skeleton ─────────────────────────────────────────────────

/**
 * The skeleton of whichever Library the screen is about to become.
 *
 * It used to be one full-width list at every size, returned *above*
 * the screen's own `compact / medium / wide` ladder — so at Medium it
 * drew rows where a cover grid was coming, and above Medium it drew a
 * single bleed column where a 440 master and a book pane were coming.
 * §4 asks a skeleton to match its layout, so it branches here on the
 * same classes the real screen does (M8).
 *
 * The call sites did not move: it reads the size class itself.
 */
export function LibrarySkeleton({ tabBar }: { tabBar?: ReactNode }) {
  const { sizeClass, isWide } = useSizeClass();
  if (isWide) {
    return sizeClass === 'medium' ? <LibraryGridSkeleton /> : <LibraryPaneSkeletonLayout />;
  }
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.libHeader}>
        <Skeleton width={90} height={28} borderRadius={6} />
        <View style={styles.libHeaderActions}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
        </View>
      </View>

      {/* Reading stats card — the real Compact screen shows one between
          the header and Continue, and this had always skipped it. */}
      {/* Wrapped: `width: '100%'` and `marginHorizontal` on one node
          makes the block as wide as the parent and *then* shifts it,
          so it overhung the right edge by 40. */}
      <View style={styles.libStats}>
        <Skeleton width="100%" height={113} borderRadius={tokens.radii['2xl']} />
      </View>

      {/* "Continue reading" section label */}
      <Skeleton width={110} height={10} borderRadius={99} style={styles.libSectionLabel} />

      {/* Continue card */}
      <View style={styles.libContinueCard}>
        <Skeleton width={56} height={82} borderRadius={6} />
        <View style={styles.libContinueInfo}>
          <Skeleton width="80%" height={14} borderRadius={99} />
          <Skeleton width="55%" height={11} borderRadius={99} />
          <Skeleton width="65%" height={10} borderRadius={99} />
          <Skeleton width="100%" height={3} borderRadius={2} />
          <View style={styles.libContinueBtns}>
            <Skeleton width={72} height={30} borderRadius={6} />
            <Skeleton width={56} height={30} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* "All books" section header */}
      <View style={styles.libListLabel}>
        <Skeleton width={80} height={13} borderRadius={99} />
        <Skeleton width={50} height={11} borderRadius={99} />
      </View>

      {/* Book rows */}
      <View style={styles.libBooks}>
        {BOOK_ROW_WIDTHS.map((widths, i) => (
          <View
            key={i}
            style={[styles.libBookRow, i < BOOK_ROW_WIDTHS.length - 1 && styles.libBookRowBorder]}
          >
            <Skeleton width={36} height={54} borderRadius={4} />
            <View style={styles.libBookInfo}>
              <Skeleton width={widths.title} height={13} borderRadius={99} />
              <Skeleton width={widths.author} height={10} borderRadius={99} />
              {widths.progress && (
                <Skeleton width="100%" height={2} borderRadius={1} />
              )}
            </View>
          </View>
        ))}
      </View>
      {/* Without this the bottom nav vanished for the length of the
          load. `TabBar` self-hides above Compact, so the caller can
          pass the same one it always renders. */}
      {tabBar}
    </SafeAreaView>
  );
}

const BOOK_ROW_WIDTHS = [
  { title: '75%' as const, author: '45%' as const, progress: true },
  { title: '65%' as const, author: '50%' as const, progress: true },
  { title: '80%' as const, author: '38%' as const, progress: false },
];

/**
 * Medium — the 4-column cover grid, not a list. The frame draws a
 * 194-tall hero block, the "All books" bar, then the tiles.
 */
function LibraryGridSkeleton() {
  const { sizeClass } = useSizeClass();
  const { width } = useWindowDimensions();
  const gutter = tokens.layout.gutter[sizeClass];
  const gap = tokens.layout.columnGap;
  // Same expression `BookGrid` uses: the window less the rail the
  // shell draws beside us, less this screen's gutters.
  const available = Math.max(0, width - tokens.layout.rail.collapsed - gutter * 2);
  const columns = gridColumns(available, gap, { maxColumns: 4, minTile: 132 });
  const tile = Math.floor(tileWidth(available, gap, columns));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: gutter }}>
        <View style={styles.libHeaderWide}>
          <Skeleton width={90} height={28} borderRadius={6} />
          <View style={styles.libHeaderActions}>
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={36} height={36} borderRadius={18} />
            <Skeleton width={36} height={36} borderRadius={18} />
          </View>
        </View>
        {/* The hero card, which is what Medium shows in place of the
            phone's stats + continue pair. */}
        <Skeleton width="100%" height={194} borderRadius={tokens.radii['2xl']} />
        <Skeleton width={120} height={14} borderRadius={99} style={styles.libGridLabel} />
        <View style={[styles.libGrid, { gap }]}>
          {Array.from({ length: columns * 2 }, (_, i) => (
            <View key={i} style={{ width: tile }}>
              <Skeleton width={tile} height={Math.round(tile * 1.5)} borderRadius={8} />
              <Skeleton width={120} height={14} borderRadius={99} style={styles.libTileTitle} />
              <Skeleton width={80} height={12} borderRadius={99} style={styles.libTileAuthor} />
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

/**
 * Expanded and Desktop — the 440 master beside the book pane, both
 * showing skeletons. The pane is a skeleton rather than its "Pick a
 * book" empty state: nothing has failed to be selected, the library
 * simply has not arrived.
 */
function LibraryPaneSkeletonLayout() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.libSplit}>
        <View style={styles.libMaster}>
          <View style={styles.libHeaderWide}>
            <Skeleton width={90} height={28} borderRadius={6} />
            <View style={styles.libHeaderActions}>
              <Skeleton width={36} height={36} borderRadius={18} />
              <Skeleton width={36} height={36} borderRadius={18} />
              <Skeleton width={36} height={36} borderRadius={18} />
            </View>
          </View>
          <Skeleton width="100%" height={113} borderRadius={tokens.radii['2xl']} />
          <Skeleton width={100} height={14} borderRadius={99} style={styles.libGridLabel} />
          {/* 76 is the real `Book list item`'s height. */}
          {Array.from({ length: 6 }, (_, i) => (
            <View key={i} style={styles.libWideRow}>
              <Skeleton width={40} height={60} borderRadius={4} />
              <View style={styles.libWideRowLines}>
                <Skeleton width={150} height={14} borderRadius={99} />
                <Skeleton width={100} height={10} borderRadius={99} />
                <Skeleton width={120} height={10} borderRadius={99} />
              </View>
            </View>
          ))}
        </View>
        <LibraryPaneSkeleton />
      </View>
    </SafeAreaView>
  );
}

/** The detail pane's own skeleton. Figma `Library / Loading / Skeleton`. */
function LibraryPaneSkeleton() {
  return (
    <View style={styles.libPane}>
      <View style={styles.libPaneTop}>
        <Skeleton width={240} height={360} borderRadius={10} />
        <View style={styles.libPaneLines}>
          <Skeleton width={80} height={12} borderRadius={99} />
          <Skeleton width={280} height={32} borderRadius={6} style={styles.libPaneTitle} />
          <Skeleton width={140} height={16} borderRadius={99} style={styles.libPaneAuthor} />
          <Skeleton width={220} height={12} borderRadius={99} style={styles.libPaneMeta} />
          <View style={styles.libPaneBtns}>
            <Skeleton width={160} height={44} borderRadius={10} />
            <Skeleton width={110} height={44} borderRadius={10} />
          </View>
        </View>
      </View>
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton
          key={i}
          width="100%"
          height={56}
          borderRadius={12}
          style={styles.libPaneRow}
        />
      ))}
    </View>
  );
}

// ─── Reader loading skeleton ──────────────────────────────────────────────────

export function ReaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.readerSafe} edges={['top', 'left', 'right', 'bottom']}>
      {/*
        Header. The back button is real — it was not. `onBack` was
        destructured and never used, and this drew a bare 32×32
        `Skeleton` inside a plain `View`, so a cold reader open left no
        way out until the pages arrived (M8).
      */}
      <View style={styles.readerHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          hitSlop={8}
          style={({ pressed }) => [styles.readerBackBtn, pressed && { opacity: 0.7 }]}
        >
          <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
        </Pressable>
        <View style={styles.readerTitleBlock}>
          <Skeleton width={130} height={13} borderRadius={99} />
          <Skeleton width={90} height={10} borderRadius={99} style={{ marginTop: 5 }} />
        </View>
        <View style={styles.readerHeaderActions}>
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={28} height={28} borderRadius={6} />
        </View>
      </View>

      {/* Chapter label + title */}
      <View style={styles.readerBody}>
        <Skeleton width={80} height={10} borderRadius={99} style={styles.readerChapterLabel} />
        <Skeleton width={220} height={22} borderRadius={6} style={styles.readerChapterTitle} />

        {/* Paragraphs — varied widths for realism */}
        {PARA_LINES.map((para, pi) => (
          <View key={pi} style={styles.readerPara}>
            {para.map((w, li) => (
              <Skeleton key={li} width={w as `${number}%`} height={14} borderRadius={4} />
            ))}
          </View>
        ))}
      </View>

      {/* Action bar — mirrors the real text-mode ReaderScreen ActionBar
       * exactly: 5 items (Listen / AI tools / Search / Highlights /
       * Reading options), 44×44 circular icon backgrounds, label
       * underneath. Listen is rendered "live" because the user can tap
       * it immediately even while the page is loading; the other four
       * tabs are skeleton placeholders sized roughly to their final
       * label widths so the transition into the loaded state doesn't
       * jolt their position. Keep this list in sync with the ACTIONS
       * array in ReaderScreen.tsx → ActionBar. */}
      <View style={styles.readerActionBar}>
        <View style={styles.readerActionItem}>
          <View style={styles.readerListenBtn}>
            <Icon name="Headphones" size={18} color={tokens.colors.cream[50]} />
          </View>
          <Text style={styles.readerActionLabel}>Listen</Text>
        </View>
        {[
          { key: 'AI tools', labelWidth: 42 },
          { key: 'Search', labelWidth: 36 },
          { key: 'Highlights', labelWidth: 52 },
          { key: 'Reading options', labelWidth: 80 },
        ].map(({ key, labelWidth }) => (
          <View key={key} style={styles.readerActionItem}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <Skeleton width={labelWidth} height={9} borderRadius={99} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const PARA_LINES: string[][] = [
  ['100%', '100%', '88%', '100%', '72%'],
  ['100%', '94%', '100%', '80%'],
  ['100%', '100%', '60%'],
  ['100%', '90%'],
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Library
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  libStats: { marginHorizontal: 20, marginBottom: 18 },
  libHeaderWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 16,
  },
  libGridLabel: { marginTop: 20, marginBottom: 16 },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  libTileTitle: { marginTop: 10 },
  libTileAuthor: { marginTop: 8 },
  libSplit: { flex: 1, flexDirection: 'row' },
  /** The same 440 the real master uses, at its own 20 inset. */
  libMaster: {
    width: tokens.layout.pane.master,
    paddingHorizontal: 20,
  },
  libWideRow: {
    height: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
  },
  libWideRowLines: { gap: 8 },
  /** The hairline is the detail's, as in `LibraryBookPane`. */
  libPane: {
    flex: 1,
    paddingHorizontal: 40,
    paddingTop: 56,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.borderColors.subtle,
  },
  libPaneTop: { flexDirection: 'row', gap: 32 },
  libPaneLines: { flex: 1 },
  libPaneTitle: { marginTop: 14 },
  libPaneAuthor: { marginTop: 14 },
  libPaneMeta: { marginTop: 14 },
  libPaneBtns: { flexDirection: 'row', gap: 12, marginTop: 26 },
  libPaneRow: { marginTop: 32 },
  readerBackBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  libHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  libHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  libSectionLabel: {
    marginHorizontal: 20,
    marginBottom: 10,
    marginTop: 4,
  },
  libContinueCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 22,
  },
  libContinueInfo: {
    flex: 1,
    paddingTop: 4,
    gap: 8,
  },
  libContinueBtns: {
    flexDirection: 'row',
    gap: 7,
  },
  libListLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  libBooks: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },
  libBookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
    minHeight: 70,
  },
  libBookRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  libBookInfo: {
    flex: 1,
    gap: 7,
  },

  // Reader
  readerSafe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  readerHeaderBtn: {
    flexShrink: 0,
  },
  readerTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  readerHeaderActions: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  readerBody: {
    flex: 1,
    // The real reader caps its column at `reading.measure`; without it
    // the skeleton's paragraphs ran the full 1440 and snapped to 680
    // the moment text landed.
    width: '100%',
    maxWidth: tokens.layout.reading.measure,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 22,
    overflow: 'hidden',
  },
  readerChapterLabel: {
    marginBottom: 12,
  },
  readerChapterTitle: {
    marginBottom: 20,
  },
  readerPara: {
    gap: 9,
    marginBottom: 18,
  },
  readerProgress: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    flexShrink: 0,
  },
  readerProgressBar: {
    marginBottom: 5,
  },
  readerProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readerActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    flexShrink: 0,
  },
  readerActionItem: {
    alignItems: 'center',
  },
  readerListenBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerActionLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.muted,
    marginTop: 5,
  },
});
