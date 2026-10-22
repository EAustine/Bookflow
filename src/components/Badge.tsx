/**
 * Badge — a small, non-interactive label chip.
 *
 * Every chip in the app that is "a word in a tinted pill" lives here.
 * They were all screen-local StyleSheet entries, which is how five
 * near-identical pills ended up with four different corner radii and
 * nothing stopping a sixth.
 *
 * Kinds:
 *   free       forest-50 fill, forest-800 Medium. "This costs nothing",
 *              so it carries the brand colour rather than a neutral.
 *   tag        cream-100 fill, neutral ink. A topic, not a status.
 *   plan       forest-700 fill, forest-100 label. The plan name on the
 *              free plan card's header.
 *   active     amber fill and hairline border with a leading dot. The
 *              live-subscription marker on the Pro card.
 *   unlimited  forest-50 fill, forest-200 border, leading infinity
 *              glyph. A meter with no cap.
 *   source     a 26-high pill on cream-100 with a hairline border and
 *              a leading book glyph. The traceability chip under an AI
 *              summary, an AI chat answer, or a practice question.
 *              Source traceability is a marketed promise, not
 *              decoration, so all three use one chip. Three different
 *              ones used to ship — see F-44.
 *
 * `tag` has two sizes because the app uses two: the detail view's
 * roomier chips, and the denser ones on category rows, which are also a
 * step lighter in type size and ink so a row of five does not out-shout
 * the title above it.
 *
 * `active`, `unlimited` and `source` carry their own leading element. It
 * is part of the kind rather than a prop — an "Active" chip without its
 * dot, or a source chip without its book, is not the same chip.
 *
 * Only `source` sets `alignSelf`, because only it sits in a column and
 * would otherwise stretch. Setting it on every kind would top-align the
 * plan badge, whose header centres its children.
 */
import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type BadgeKind = 'free' | 'tag' | 'plan' | 'active' | 'unlimited' | 'source';
export type BadgeSize = 'default' | 'compact';

export type BadgeProps = {
  label: string;
  kind?: BadgeKind;
  /** Only meaningful for `kind="tag"`. */
  size?: BadgeSize;
};

export function Badge({ label, kind = 'tag', size = 'default' }: BadgeProps) {
  const compact = kind === 'tag' && size === 'compact';
  const containerStyle = compact
    ? styles.tagCompact
    : styles[kind as Exclude<BadgeKind, never>];
  const labelStyle = compact ? styles.tagCompactText : LABEL_STYLE[kind];

  return (
    <View style={containerStyle}>
      {kind === 'active' && <View style={styles.activeDot} />}
      {kind === 'unlimited' && <Text style={styles.unlimitedGlyph}>∞</Text>}
      {kind === 'source' && (
        <Icon name="Book" size={10} color={tokens.textColors.muted} />
      )}
      <Text style={labelStyle}>{label}</Text>
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

  plan: {
    backgroundColor: tokens.colors.forest[700],
    borderRadius: tokens.radii.sm,
    paddingHorizontal: tokens.space.md,
    paddingVertical: 3,
  },
  planText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    lineHeight: 16,
    color: tokens.colors.forest[100],
  },

  active: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: tokens.overlay.amber.fill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.overlay.amber.border,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.amber[500],
  },
  activeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.4,
    color: tokens.colors.amber[500],
  },

  unlimited: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.colors.forest[50],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.forest[200],
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  unlimitedGlyph: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.colors.forest[800],
  },
  unlimitedText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },

  source: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    // Only this kind hugs: under a practice question it sits in a
    // column and would otherwise stretch to the full card width.
    alignSelf: 'flex-start',
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: tokens.borderWidth.hairline,
    borderColor: tokens.borderColors.subtle,
  },
  sourceText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.textColors.secondary,
  },
});

const LABEL_STYLE: Record<BadgeKind, object> = {
  free: styles.freeText,
  tag: styles.tagText,
  plan: styles.planText,
  active: styles.activeText,
  unlimited: styles.unlimitedText,
  source: styles.sourceText,
};
