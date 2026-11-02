/**
 * AddPill — Discover's add / in-library control. Figma `Add pill`.
 *
 * **Not a `Button`, deliberately.** M5b set out to move this onto the
 * canonical component, on the reading that a hand-rolled 28pt control
 * was drift against the system's compact 32. The frames say otherwise:
 * `Add pill` is a component in its own right, used at 28 on the
 * Featured card and in every result row, and on the Featured card it
 * is amber on forest — a treatment `Button` has no variant for. Forcing
 * `Button` there rendered a forest primary on a forest-800 card and the
 * control disappeared.
 *
 * So the pill stays, and what was actually wrong is recorded instead:
 * the design system has no on-dark button, and `Add pill` is not in it.
 *
 * The one piece of that change worth keeping is the spinner — the
 * pending state uses `Spinner`, which exists precisely because
 * `ActivityIndicator` is the wrong ring, stroke and rate.
 */

import { Pressable, StyleSheet, type GestureResponderEvent } from 'react-native';
import { FocusRing, Icon, Spinner, Text } from '~/components';
import { useInteractive } from '~/hooks/useInteractive';
import { tokens } from '~/design/tokens';

export type AddPillProps = {
  inLibrary: boolean;
  pending: boolean;
  /** The surface it sits on. `accent` is the dark Featured card. */
  tone?: 'default' | 'accent';
  /** Shown when not in the library. "Add" in rows, "Add to library" on the card. */
  addLabel?: string;
  accessibilityLabel?: string;
  onPress: (e: GestureResponderEvent) => void;
  /** Without one, the in-library state is a badge rather than a control. */
  removable?: boolean;
};

export function AddPill({
  inLibrary,
  pending,
  tone = 'default',
  addLabel = 'Add',
  accessibilityLabel,
  onPress,
  removable = false,
}: AddPillProps) {
  const accent = tone === 'accent';
  const background = inLibrary
    ? accent
      ? tokens.colors.forest[100]
      : tokens.colors.forest[50]
    : accent
      ? tokens.colors.amber[500]
      : tokens.colors.forest[800];
  const content = inLibrary
    ? tokens.colors.forest[800]
    : accent
      ? tokens.colors.forest[900]
      : tokens.colors.cream[50];

  const disabled = pending || (inLibrary && !removable);

  /**
   * §6, added in the R-M10 sign-off pass. The pill is a button by every
   * definition §10 uses and it was missed twice: it is not in the build
   * log's Phase 7 table of components that gained an Interaction
   * property, and R-M9 wired the row around it rather than the control
   * inside it. Tabbing a Discover result row stopped here second and
   * showed nothing.
   *
   * Hover is the filled-control rule rather than the row fill: this has
   * no surface to tint, and on the Featured card it is amber, a ramp
   * with no darker step to move to.
   */
  const { interactiveProps, hovered, ringVisible } = useInteractive();

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        if (!disabled) onPress(e);
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      {...interactiveProps}
      style={[
        styles.pill,
        { backgroundColor: background },
        hovered && !disabled && { opacity: tokens.hover.filledOpacity },
        pending && styles.pending,
      ]}
    >
      {pending ? (
        <Spinner size={12} color={content} />
      ) : (
        <Icon name={inLibrary ? 'Check' : 'Plus'} size={10} color={content} />
      )}
      <Text style={[styles.label, { color: content }]} numberOfLines={1}>
        {inLibrary ? 'In library' : pending ? 'Adding…' : addLabel}
      </Text>
      {/* Outset, like `Button` — a filled control cannot show an inset
          ring in its own fill colour. The pill's 14 plus the outset. */}
      <FocusRing
        visible={ringVisible}
        shape="card"
        radius={PILL_RADIUS + tokens.focusRing.card.outset}
      />
    </Pressable>
  );
}

/** The pill's corner. Named so the focus ring can be derived from it. */
const PILL_RADIUS = 14;

const styles = StyleSheet.create({
  pill: {
    // `flex-start` pins the pill to its content width — without it the
    // Pressable stretches to fill the parent column on iOS, making the
    // whole row look like one button.
    alignSelf: 'flex-start',
    height: 28,
    paddingHorizontal: 12,
    borderRadius: PILL_RADIUS,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pending: { opacity: 0.7 },
  label: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
  },
});
