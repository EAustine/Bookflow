/**
 * CoverBox — a Discover book's cover, with the coloured fallback.
 *
 * The real cover image when the catalogue gave us one, falling back to
 * the deterministic colour plus the title. The `<Image>` can still
 * fail after that decision — an expired or 404 URL — so an `onError`
 * flips it back rather than leaving a blank rectangle.
 *
 * Extracted from `DiscoverScreen` in M5b: every card in the feature
 * draws one, so it could not stay module-local once the cards moved
 * out.
 */

import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text } from '~/components';
import type { DiscoverBook } from '../types';

export type CoverBoxProps = {
  book: DiscoverBook;
  /** The cover's box. Callers size it; this adds the fill and clip. */
  style: StyleProp<ViewStyle>;
  fallbackTextStyle: StyleProp<TextStyle>;
};

export function CoverBox({ book, style, fallbackTextStyle }: CoverBoxProps) {
  const [errored, setErrored] = useState(false);
  const showImage = !!book.coverUrl && !errored;
  return (
    <View style={[style, { backgroundColor: book.coverColor, overflow: 'hidden' }]}>
      {showImage ? (
        <Image
          source={{ uri: book.coverUrl! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <Text style={fallbackTextStyle} numberOfLines={3}>
          {book.coverLabel ?? book.title}
        </Text>
      )}
    </View>
  );
}
