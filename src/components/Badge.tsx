/**
 * Badge — a small, non-interactive label chip.
 *
 * Built from the book-detail chips that were screen-local StyleSheet
 * entries in `DiscoverScreen`: the "Free" badge and the topic tags.
 * They nearly but did not exactly match each other, and nothing stopped
 * the next screen inventing a third. (F-24.)
 *
 * Kinds:
 *   free → forest-50 fill, forest-800 Medium label. Says "this costs
 *          nothing", so it carries the brand colour rather than a
 *          neutral.
 *   tag  → cream-100 fill, neutral ink label. A topic, not a status.
 *
 * `tag` has two sizes because the app genuinely uses two: the detail
 * view's roomier chips, and the denser ones on category rows, which are
 * also a step lighter in both type size and ink so a row of five does
 * not out-shout the title above it.
 *
 * ── Not yet folded in ────────────────────────────────────────────────
 * Figma's `Badge` atom (123:30) carries four more kinds, built from
 * `YouScreen.planBadge`, `YouScreen.activeBadge`,
 * `PracticeQuestionsScreen.sourceChip` and `.currentBadge`. Those are
 * still screen-local. F-24 scoped this to the two book-detail chips;
 * migrating the rest is a follow-up, and until it happens the Figma
 * component has more kinds than this one.
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type BadgeKind = 'free' | 'tag';
export type BadgeSize = 'default' | 'compact';

export type BadgeProps = {
  label: string;
  kind?: BadgeKind;
  /** Only meaningful for `kind="tag"`. */
  size?: BadgeSize;
};

export function Badge({ label, kind = 'tag', size = 'default' }: BadgeProps) {
  const compact = kind === 'tag' && size === 'compact';
  return (
    <View
      style={[
        kind === 'free' ? styles.free : compact ? styles.tagCompact : styles.tag,
      ]}
    >
      <Text
        style={
          kind === 'free'
            ? styles.freeText
            : compact
              ? styles.tagCompactText
              : styles.tagText
        }
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  free: {
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  tag: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[700],
  },
  tagCompact: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagCompactText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[500],
  },
});
