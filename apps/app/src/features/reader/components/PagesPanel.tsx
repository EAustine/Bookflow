/**
 * PagesPanel — the reader's page list. Figma `308:11864`, reached by
 * tapping the book title in the reader header.
 *
 * It is a list of **pages**, not chapters. That matters: the schema
 * migrated chapters into pages, and `ListenNowPlayingScreen` dropped
 * its chapters pill on the grounds that "pages are the navigation
 * unit (not chapters)". Chapter titles appear here only as section
 * headings, and only for books that have them — a book without them
 * still has pages, so this panel never needs an empty state.
 *
 * Deliberately dumb: it takes a prepared list and renders it. The
 * chapter derivation lives in `ReaderScreen`, where it already runs
 * for the in-chapter search scope, so there is one definition of what
 * a chapter is rather than two.
 */

import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '~/components/Text';
import { tokens } from '~/design/tokens';

export type PageRowItem = {
  pageIndex: number;
  /** Printed label, already through `pageDisplayShort`. */
  label: string;
  /** Chapter heading to print above this row, when it starts one. */
  heading: string | null;
};

export type PagesPanelProps = {
  rows: PageRowItem[];
  currentPageIndex: number;
  onJumpToPage: (pageIndex: number) => void;
};

/**
 * A page's state, read off the reading position rather than stored.
 *
 * In a linear book the position *is* the status: everything behind
 * you has been read, everything ahead has not. We do not track
 * progress within a page, so there is no partial state to show — and
 * inventing a percentage for a page nobody measured would be the kind
 * of dishonest progress the product rules out.
 */
function statusFor(
  pageIndex: number,
  current: number,
): 'finished' | 'now' | 'not-started' {
  if (pageIndex === current) return 'now';
  return pageIndex < current ? 'finished' : 'not-started';
}

export function PagesPanel({
  rows,
  currentPageIndex,
  onJumpToPage,
}: PagesPanelProps) {
  return (
    <View style={styles.list}>
      {rows.map((row) => (
        <View key={row.pageIndex}>
          {row.heading && (
            <Text style={styles.heading} numberOfLines={2}>
              {row.heading}
            </Text>
          )}
          <PageRow
            row={row}
            status={statusFor(row.pageIndex, currentPageIndex)}
            onPress={onJumpToPage}
          />
        </View>
      ))}
    </View>
  );
}

const PageRow = memo(function PageRow({
  row,
  status,
  onPress,
}: {
  row: PageRowItem;
  status: ReturnType<typeof statusFor>;
  onPress: (pageIndex: number) => void;
}) {
  const isNow = status === 'now';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isNow }}
      // Hard rule 6: the whole row is the target.
      onPress={() => onPress(row.pageIndex)}
      style={({ pressed }) => [
        styles.row,
        isNow && styles.rowNow,
        pressed && !isNow && { backgroundColor: tokens.bgColors.surface },
      ]}
    >
      <Text
        style={[
          styles.label,
          status === 'not-started' && styles.labelPending,
          isNow && styles.labelNow,
        ]}
        numberOfLines={1}
      >
        {row.label}
      </Text>
      {isNow ? (
        <View style={styles.nowTag}>
          <Text style={styles.nowTagText}>Now</Text>
        </View>
      ) : (
        <Text style={styles.status}>
          {status === 'finished' ? 'Finished' : 'Not started'}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  list: {
    paddingBottom: tokens.space.lg,
  },
  heading: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.xxs,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space.md,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radii.md,
  },
  rowNow: {
    backgroundColor: tokens.bgColors.accentMuted,
  },
  label: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.md,
    color: tokens.textColors.primary,
  },
  labelPending: {
    color: tokens.textColors.muted,
  },
  labelNow: {
    fontFamily: tokens.fonts.uiMedium,
  },
  status: {
    fontFamily: tokens.fonts.ui,
    fontSize: tokens.fontSizes.ui.xs,
    color: tokens.textColors.disabled,
  },
  nowTag: {
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 2,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.bgColors.accent,
  },
  nowTagText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: tokens.fontSizes.ui.xxs,
    color: tokens.textColors.inverse,
  },
});
