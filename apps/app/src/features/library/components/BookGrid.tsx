/**
 * BookGrid — the tablet-portrait cover grid (§4, Medium).
 *
 * A wrapping row of `BookGridTile`, not a FlatList. The grid sits
 * inside the Library's existing ScrollView, and nesting a vertical list
 * inside a vertical scroller is the arrangement that cost the reader
 * several milestones: one of the two takes each gesture and the other
 * stands still. A library is tens of books, not thousands, so there is
 * nothing to virtualise.
 *
 * The column arithmetic lives in `@bookflow/shared` so the brief's "four
 * columns of 153 at 820" is a test rather than a hope.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { gridColumns, tileWidth } from '@bookflow/shared';
import { Text } from '~/components/Text';
import type { Book } from '~/types/book';
import { tokens } from '~/design/tokens';
import { BookGridTile } from './BookGridTile';

/** §4 asks for four columns; see `gridColumns` for why it is a ceiling. */
const GRID = { maxColumns: 4, minTile: 132 };

export type BookGridProps = {
  books: Book[];
  /** Width the grid has to fill, gutters already removed. */
  availableWidth: number;
  now: Date;
  onBookPress: (book: Book) => void;
  onRemove?: (book: Book) => void;
  onLongPress?: (book: Book, node: View | null) => void;
};

export function BookGrid({
  books,
  availableWidth,
  now,
  onBookPress,
  onRemove,
  onLongPress,
}: BookGridProps) {
  const gap = tokens.layout.columnGap;
  const width = useMemo(() => {
    const columns = gridColumns(availableWidth, gap, GRID);
    // Floor, so rounding can only ever leave a sliver of slack at the
    // end of a row rather than overflow it onto the next one.
    return Math.floor(tileWidth(availableWidth, gap, columns));
  }, [availableWidth, gap]);

  if (books.length === 0) {
    // The list had no zero-results state — a filter matching nothing
    // rendered an empty bordered box. In a grid that reads as a loading
    // bug rather than as an answer, so it says so.
    return (
      <View style={styles.empty}>
        <Text variant="body-sm" color="muted">
          No books match this filter.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.grid, { gap }]}>
      {books.map((book) => (
        <BookGridTile
          key={book.id}
          book={book}
          width={width}
          now={now}
          onPress={onBookPress}
          onRemove={onRemove}
          onLongPress={onLongPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // flex-start, so a short last row keeps its tiles at column width.
    // `space-between` would stretch the gaps instead, and a final row of
    // two books would sit at opposite ends of the screen.
    justifyContent: 'flex-start',
  },
  empty: {
    paddingVertical: tokens.space['3xl'],
    alignItems: 'center',
  },
});
