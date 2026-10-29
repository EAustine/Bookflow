/**
 * FeaturedCard — "Featured this week" on Discover. Figma `Featured
 * card` with its Size property: Compact (phone), Medium (tablet
 * portrait) and Wide (tablet landscape and desktop).
 *
 * Compact is the card that shipped: a 90-wide cover column beside the
 * text. Medium and Wide replace it with the Reading nook illustration
 * anchored to the right edge, with the book's real cover standing on
 * the stack inside the drawing — so the cover is still the book's own,
 * it just lives in the artwork rather than beside it.
 *
 * Extracted from `DiscoverScreen` in M5b.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '~/components';
import {
  READING_NOOK_COVER_SLOT as SLOT,
  ReadingNookIllustration,
} from '~/components/illustrations/ReadingNookIllustration';
import { tokens } from '~/design/tokens';
import type { DiscoverBook } from '../types';
import { AddPill } from './AddPill';
import { CoverBox } from './CoverBox';

export type FeaturedCardSize = 'compact' | 'medium' | 'wide';

export type FeaturedCardProps = {
  book: DiscoverBook;
  inLibrary: boolean;
  pending: boolean;
  size?: FeaturedCardSize;
  onPress: () => void;
  onAdd: () => void;
};

export function FeaturedCard({
  book,
  inLibrary,
  pending,
  size = 'compact',
  onPress,
  onAdd,
}: FeaturedCardProps) {
  const art =
    size === 'medium'
      ? tokens.layout.discover.featured.artMedium
      : tokens.layout.discover.featured.artWide;

  const addButton = (
    <AddPill
      inLibrary={inLibrary}
      pending={pending}
      tone="accent"
      addLabel="Add to library"
      accessibilityLabel={`Add ${book.title} to library`}
      onPress={onAdd}
    />
  );

  // ── Compact: the phone card, unchanged ──────────────────────────────
  if (size === 'compact') {
    return (
      <Pressable onPress={onPress} style={styles.compactCard}>
        <CoverBox
          book={book}
          style={styles.compactCover}
          fallbackTextStyle={styles.compactCoverText}
        />
        <View style={styles.compactInfo}>
          <Text style={styles.eyebrow}>✦ Editor&apos;s pick</Text>
          <Text style={styles.compactTitle} numberOfLines={2}>{book.title}</Text>
          <Text style={styles.compactAuthor} numberOfLines={1}>{book.author}</Text>
          <Text style={styles.compactBlurb} numberOfLines={3}>{book.about}</Text>
          <View style={styles.action}>{addButton}</View>
        </View>
      </Pressable>
    );
  }

  // ── Medium and Wide: text left, illustration anchored right ─────────
  //
  // The art is absolutely positioned rather than a flex sibling so the
  // Medium drawing can overhang the card's right edge and clip, which
  // is what the frame shows at 0.86 scale.
  const textInset = size === 'wide' ? tokens.spacing[9] : tokens.space['2xl'];
  return (
    <Pressable onPress={onPress} style={styles.wideCard}>
      <View style={styles.art} pointerEvents="none">
        <ReadingNookIllustration
          width={art.width}
          height={art.height}
          variant={size === 'wide' ? 'wide' : 'medium'}
        />
        <BookCover book={book} scale={art.width / SLOT.viewBox.width} />
      </View>

      <View
        style={[
          styles.wideInfo,
          {
            padding: textInset,
            // The text never runs under the art: Wide gives the
            // illustration its own 440, Medium keeps 300 clear and
            // lets the drawing sit behind the gap.
            paddingRight:
              size === 'wide'
                ? art.width + textInset
                : tokens.layout.discover.featured.mediumTextGutter,
          },
        ]}
      >
        <Text style={styles.eyebrow}>✦ Editor&apos;s pick</Text>
        <Text style={styles.wideTitle} numberOfLines={1}>{book.title}</Text>
        <Text style={styles.wideAuthor} numberOfLines={1}>{book.author}</Text>
        <Text style={styles.wideBlurb} numberOfLines={2}>{book.about}</Text>
        <View style={styles.action}>{addButton}</View>
      </View>
    </Pressable>
  );
}

/**
 * The real cover, laid over the illustration in the slot the drawing
 * leaves for it. Positions come from the SVG's own comment via
 * `READING_NOOK_COVER_SLOT`, scaled by how big the art is rendered, so
 * the cover cannot drift away from the stack it stands on.
 */
function BookCover({ book, scale }: { book: DiscoverBook; scale: number }) {
  const box = {
    position: 'absolute' as const,
    left: SLOT.x * scale,
    top: SLOT.y * scale,
    width: SLOT.width * scale,
    height: SLOT.height * scale,
    borderRadius: SLOT.radius * scale,
  };
  return (
    <>
      <View
        style={[
          box,
          {
            left: (SLOT.x + SLOT.shadowOffset) * scale,
            top: (SLOT.y + SLOT.shadowOffset) * scale,
            backgroundColor: tokens.colors.forest[900],
            transform: [{ rotate: `${SLOT.rotation}deg` }],
          },
        ]}
      />
      <CoverBox
        book={book}
        style={[
          box,
          {
            borderWidth: 3,
            borderColor: tokens.colors.forest[900],
            padding: 6 * scale,
            justifyContent: 'flex-end',
            transform: [{ rotate: `${SLOT.rotation}deg` }],
          },
        ]}
        fallbackTextStyle={styles.slotCoverText}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // ── Shared ──────────────────────────────────────────────────────────
  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.forest[200],
  },
  action: { alignSelf: 'flex-start', marginTop: 10 },
  slotCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 8,
    lineHeight: 11,
    color: tokens.colors.cream[50],
  },

  // ── Compact ─────────────────────────────────────────────────────────
  compactCard: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  compactCover: {
    width: 90,
    flexShrink: 0,
    minHeight: 130,
    padding: 10,
    justifyContent: 'flex-end',
  },
  compactCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 8,
    lineHeight: 11,
    color: tokens.colors.forest[200],
  },
  compactInfo: { flex: 1, padding: 14, paddingLeft: 12 },
  compactTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    lineHeight: 18,
    color: tokens.colors.cream[50],
    marginTop: 6,
  },
  compactAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    marginTop: 4,
  },
  compactBlurb: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    lineHeight: 16.5,
    color: tokens.colors.forest[200],
    opacity: 0.85,
    marginTop: 8,
  },

  // ── Medium and Wide ─────────────────────────────────────────────────
  wideCard: {
    height: tokens.layout.discover.featured.height,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: tokens.layout.discover.featured.radius,
    overflow: 'hidden',
  },
  /** Bottom-right anchored, so Medium's smaller drawing sits low. */
  art: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  wideInfo: { flex: 1, justifyContent: 'center' },
  wideTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: tokens.colors.cream[50],
    marginTop: 6,
  },
  wideAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.forest[200],
    marginTop: 6,
  },
  wideBlurb: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.forest[200],
    /** The frames cap the blurb short of the column. */
    maxWidth: 520,
    marginTop: 10,
  },
});
