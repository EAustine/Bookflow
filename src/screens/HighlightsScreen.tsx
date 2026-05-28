/**
 * HighlightsScreen — per-book list of saved words and sentences.
 *
 * Surfaces everything the user has tapped "Save word" or "Save" on while
 * reading. Two filter tabs (All / Words / Sentences) and grouped by
 * page so a learner can study new vocabulary alongside the passage
 * it came from. Tapping a row jumps the reader to that page; swiping
 * (or tapping the trash icon) removes the highlight.
 *
 * Pure list view — composition (not navigation) is up to the parent. The
 * parent passes `onClose` to dismiss and `onJumpToPage` to wire the
 * reader's page setter.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';
import {
  deleteHighlight,
  type Highlight,
  useBookHighlights,
} from '~/lib/highlights';
import type { Book } from '~/types/book';

export type HighlightsScreenProps = {
  book: Book;
  onClose: () => void;
  /**
   * Optional callback to jump to a page when a highlight is tapped.
   * The reader wires this; called from the library it can be omitted
   * and we just collapse the list back to the library on tap.
   */
  onJumpToPage?: (pageIndex: number) => void;
};

type Filter = 'all' | 'word' | 'sentence';

export function HighlightsScreen({
  book,
  onClose,
  onJumpToPage,
}: HighlightsScreenProps) {
  // Route Android hardware-back to the in-screen close affordance
  // so testers land back on the reader instead of falling through
  // to the reader's own back handler (which goes to Library).
  useBackHandler(() => {
    onClose();
    return true;
  });
  const { highlights, loading, removeOptimistic, refetch } = useBookHighlights(book.id);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return highlights;
    return highlights.filter((h) => h.kind === filter);
  }, [highlights, filter]);

  // Group by page index. Numeric ascending so the reader-experience
  // ordering matches the book; within a page we keep the
  // newest-first order from the hook so recent saves bubble up.
  const grouped = useMemo(() => {
    const map = new Map<number, Highlight[]>();
    for (const h of filtered) {
      const idx = h.pageIndex ?? -1;
      if (!map.has(idx)) map.set(idx, []);
      map.get(idx)!.push(h);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  const counts = useMemo(
    () => ({
      all: highlights.length,
      word: highlights.filter((h) => h.kind === 'word').length,
      sentence: highlights.filter((h) => h.kind === 'sentence').length,
    }),
    [highlights],
  );

  const handleDelete = useCallback(
    async (h: Highlight) => {
      removeOptimistic(h.id);
      const ok = await deleteHighlight(h.id);
      if (!ok) {
        // Refetch to reconcile if the server delete failed; user sees
        // the row come back rather than a silent inconsistency.
        void refetch();
      }
    },
    [removeOptimistic, refetch],
  );

  const handleRowPress = useCallback(
    (h: Highlight) => {
      if (onJumpToPage && h.pageIndex !== null) {
        onJumpToPage(h.pageIndex);
        onClose();
      }
    },
    [onJumpToPage, onClose],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onClose}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Highlights
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        <FilterTab
          label="All"
          count={counts.all}
          active={filter === 'all'}
          onPress={() => setFilter('all')}
        />
        <FilterTab
          label="Words"
          count={counts.word}
          active={filter === 'word'}
          onPress={() => setFilter('word')}
        />
        <FilterTab
          label="Sentences"
          count={counts.sentence}
          active={filter === 'sentence'}
          onPress={() => setFilter('sentence')}
        />
      </View>

      {loading ? (
        <View style={styles.loadingZone}>
          <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} totalCount={counts.all} />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {grouped.map(([chapterIdx, items]) => (
            <View key={chapterIdx} style={styles.group}>
              <Text style={styles.groupLabel}>
                {chapterIdx >= 0 ? `Page ${chapterIdx + 1}` : 'Other'}
              </Text>
              {items.map((h) => (
                <HighlightRow
                  key={h.id}
                  highlight={h}
                  onPress={() => handleRowPress(h)}
                  onDelete={() => handleDelete(h)}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FilterTab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>
        {count}
      </Text>
    </Pressable>
  );
}

function HighlightRow({
  highlight,
  onPress,
  onDelete,
}: {
  highlight: Highlight;
  onPress: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        <View
          style={[
            styles.kindDot,
            highlight.kind === 'word'
              ? styles.kindDotWord
              : styles.kindDotSentence,
          ]}
        />
        <View style={styles.rowText}>
          <Text
            style={[
              styles.rowMainText,
              highlight.kind === 'word' && styles.rowMainTextWord,
            ]}
            numberOfLines={highlight.kind === 'word' ? 1 : 3}
          >
            {highlight.kind === 'sentence' ? `“${highlight.text}”` : highlight.text}
          </Text>
          {highlight.kind === 'sentence' ? (
            <Text style={styles.rowSubtext}>
              Sentence · {formatRelativeShort(highlight.createdAt)}
            </Text>
          ) : (
            <Text style={styles.rowSubtext}>
              Word · {formatRelativeShort(highlight.createdAt)}
            </Text>
          )}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove highlight"
        onPress={onDelete}
        hitSlop={8}
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
      >
        <Icon name="Trash" size={14} color={tokens.colors.ink[400]} strokeWidth={1.75} />
      </Pressable>
    </View>
  );
}

function EmptyState({ filter, totalCount }: { filter: Filter; totalCount: number }) {
  const sub =
    totalCount === 0
      ? 'Tap a word for the dictionary, or long-press a sentence — saved items appear here.'
      : filter === 'word'
      ? "You haven't saved any words for this book yet."
      : "You haven't saved any sentences for this book yet.";
  return (
    <View style={styles.emptyZone}>
      <View style={styles.emptyIcon}>
        <Icon
          name="Notebook"
          size={28}
          color={tokens.colors.ink[400]}
          strokeWidth={1.5}
        />
      </View>
      <Text style={styles.emptyTitle}>
        {totalCount === 0 ? 'No highlights yet' : 'Nothing here'}
      </Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

function formatRelativeShort(date: Date): string {
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSubtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  headerSpacer: {
    width: 36,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
  },
  tabActive: {
    backgroundColor: tokens.colors.forest[800],
  },
  tabLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  tabLabelActive: {
    color: tokens.colors.cream[50],
  },
  tabCount: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  tabCountActive: {
    color: tokens.colors.cream[50],
    opacity: 0.8,
  },
  loadingZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: 40,
  },
  group: {
    marginBottom: tokens.space.lg,
  },
  groupLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: tokens.space.sm,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.space.sm,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.md,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  kindDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
    flexShrink: 0,
  },
  kindDotWord: {
    backgroundColor: tokens.colors.amber[200],
  },
  kindDotSentence: {
    backgroundColor: tokens.colors.forest[800],
  },
  rowText: {
    flex: 1,
  },
  rowMainText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.textColors.primary,
  },
  rowMainTextWord: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    fontSize: 15,
  },
  rowSubtext: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    marginTop: 4,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  emptyZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.xl,
    paddingTop: 80,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.md,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
});
