/**
 * RailCard — one book in a horizontal Discover shelf.
 *
 * 108 wide at every size: the rails scroll sideways rather than
 * reflowing, so the card keeps its width and more of them come into
 * view on a wider screen.
 *
 * Extracted from `DiscoverScreen` in M5b. Used by the home's six
 * shelves and, since M5a, by the book detail's "More like this".
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { DiscoverBook } from '../types';
import { CoverBox } from './CoverBox';

export type RailCardProps = {
  book: DiscoverBook;
  inLibrary: boolean;
  onPress: () => void;
};

export function RailCard({ book, inLibrary, onPress }: RailCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.coverWrap}>
        <CoverBox
          book={book}
          style={styles.cover}
          fallbackTextStyle={styles.coverText}
        />
        {inLibrary && (
          <View style={styles.addedBadge}>
            <Icon name="Check" size={9} color={tokens.colors.cream[50]} />
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
      <Text style={styles.meta} numberOfLines={1}>{book.author}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 108, gap: 7 },
  coverWrap: { position: 'relative' },
  cover: {
    width: 108,
    height: 158,
    borderRadius: 7,
    padding: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  coverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7,
    lineHeight: 9,
    color: tokens.colors.cream[50],
  },
  addedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 12,
    lineHeight: 15.6,
    color: tokens.colors.ink[900],
  },
  meta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
});
