/**
 * DiscoverResultList — search results and category listings.
 *
 * Compact keeps the single column with hairline dividers it has always
 * had. Above it the frames lay out **exactly two** columns —
 * `Discover / Search / Results / *` and `Discover / Category / List / *`
 * measure 330, 510 and 548 against inner widths of 684, 1044 and 1120,
 * which is `(inner − columnGap) / 2` in each case.
 *
 * Two, not a ceiling like the Library grid's four: these are list rows
 * with a 72-wide cover, not cover tiles, and a third column would make
 * each one too narrow for a two-line title beside its tags.
 *
 * A wrapping flex row rather than a `FlatList`, for the reason
 * `BookGrid` gives in its own header: a vertical list nested in a
 * vertical scroller cost earlier milestones.
 *
 * Extracted in M5b, from markup that was written out twice.
 */

import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { tileWidth } from '@bookflow/shared';
import { useSizeClass } from '~/hooks/useSizeClass';
import { tokens } from '~/design/tokens';
import type { DiscoverBook } from '../types';
import { DiscoverBookRow } from './DiscoverBookRow';

export type DiscoverResultListProps = {
  books: DiscoverBook[];
  libraryIds: Set<string>;
  pendingIds: Set<string>;
  onBook: (book: DiscoverBook) => void;
  onAdd: (book: DiscoverBook) => void;
  onRemove?: (book: DiscoverBook) => void;
};

export function DiscoverResultList({
  books,
  libraryIds,
  pendingIds,
  onBook,
  onAdd,
  onRemove,
}: DiscoverResultListProps) {
  const { sizeClass, isWide } = useSizeClass();
  const { width } = useWindowDimensions();

  const gap = tokens.layout.columnGap;
  const gutter = isWide
    ? tokens.layout.gutter[sizeClass]
    : tokens.layout.discover.gutterCompact;

  /**
   * The usable width: the window, less the rail the shell draws beside
   * it, less this screen's gutters. The rail is not ours to measure,
   * so it comes from the token the shell renders it at — and which one
   * depends on the size class, since Desktop's rail is 240 where the
   * others are 72.
   */
  const railWidth = !isWide
    ? 0
    : sizeClass === 'desktop'
      ? tokens.layout.rail.expanded
      : tokens.layout.rail.collapsed;
  const available = Math.max(0, width - railWidth - gutter * 2);
  const rowWidth = isWide
    ? tileWidth(available, gap, tokens.layout.discover.resultColumns)
    : undefined;

  return (
    <View
      style={[
        styles.list,
        { paddingHorizontal: gutter },
        isWide && { flexDirection: 'row', flexWrap: 'wrap', gap },
      ]}
    >
      {books.map((book, i) => (
        <View key={book.id} style={isWide ? undefined : styles.compactItem}>
          {/* Dividers belong to the single column. In the grid the
              24 gap already separates the rows, and a hairline across
              two columns would read as a table rule. */}
          {!isWide && i > 0 && <View style={styles.divider} />}
          <DiscoverBookRow
            book={book}
            inLibrary={libraryIds.has(book.id)}
            pending={pendingIds.has(book.id)}
            width={rowWidth}
            onPress={() => onBook(book)}
            onAdd={onAdd}
            onRemove={onRemove}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: tokens.space.lg },
  compactItem: { width: '100%' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
    marginVertical: tokens.space.lg,
  },
});
