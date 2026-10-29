/**
 * DiscoverBookRow — one book in a search result or category list.
 *
 * Cover, title, author, two subject tags and the add control. Figma
 * `Discover book row`, 104 tall at every size; above Compact the
 * frames lay two of these per line, so the row takes a width rather
 * than filling.
 *
 * Extracted in M5b. These thirty lines were written out twice —
 * verbatim, in `SearchResults` and in `CategoryView` — which is also
 * why the two surfaces had drifted on whether removal was wired.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { DiscoverBook } from '../types';
import { AddPill } from './AddPill';
import { CoverBox } from './CoverBox';

export type DiscoverBookRowProps = {
  book: DiscoverBook;
  inLibrary: boolean;
  pending: boolean;
  onPress: () => void;
  onAdd: (book: DiscoverBook) => void;
  /**
   * When present and the book is in the library, the pill becomes a
   * "Remove from library" affordance. The caller confirms.
   */
  onRemove?: (book: DiscoverBook) => void;
  /** Fixed width in the wide grid; full width in the Compact list. */
  width?: number;
};

export function DiscoverBookRow({
  book,
  inLibrary,
  pending,
  onPress,
  onAdd,
  onRemove,
  width,
}: DiscoverBookRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, width === undefined ? styles.cardFull : { width }]}
    >
      <CoverBox
        style={styles.cover}
        book={book}
        fallbackTextStyle={styles.coverText}
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.author}
        </Text>
        <View style={styles.tags}>
          {book.tags.slice(0, 2).map((tag) => (
            <Badge key={tag} kind="tag" size="compact" label={tag} />
          ))}
        </View>
        <View style={styles.action}>
          <AddPill
            inLibrary={inLibrary}
            pending={pending}
            removable={!!onRemove}
            accessibilityLabel={
              inLibrary
                ? onRemove
                  ? `Remove ${book.title} from library`
                  : 'In library'
                : `Add ${book.title} to library`
            }
            onPress={() => {
              if (inLibrary) onRemove?.(book);
              else onAdd(book);
            }}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 14,
  },
  cardFull: { width: '100%' },
  cover: {
    width: 72,
    height: 104,
    borderRadius: 6,
    padding: 7,
    justifyContent: 'flex-end',
    flexShrink: 0,
    overflow: 'hidden',
  },
  coverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 6.5,
    color: tokens.colors.cream[50],
    lineHeight: 8.5,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    lineHeight: 17.5,
    color: tokens.colors.ink[900],
  },
  author: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  /** `flex-start` so the button takes its content width, not the row's. */
  action: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
});
