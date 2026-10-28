/**
 * Popover — the wide-screen presentation of a menu, options or picker
 * sheet. Figma `Popover` `296:434`.
 *
 * §3 of docs/specs/responsive-handoff.md: anchored to its trigger, 340
 * wide, with an arrow — except when the anchor sits within 24 of the
 * window edge, where it right-aligns to the gutter and drops the arrow
 * rather than letting the card hang off the screen.
 *
 * Positioned from `measureInWindow` coordinates, which is why it renders
 * inside an RN `Modal`: a `position: 'absolute'` View in React Native is
 * positioned against its direct parent, not the window, so an in-place
 * overlay would be confined to whatever container the call site happened
 * to declare it in. The modal gives it the window as its box, so the
 * anchor maths means the same thing from every call site.
 */

import type { ReactNode } from 'react';
import {
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Text } from './Text';
import { placePopover, type AnchorRect } from '@bookflow/shared';
import { useSizeClass } from '~/hooks/useSizeClass';
import { tokens } from '~/design/tokens';

export type { AnchorRect };

export type PopoverProps = {
  visible: boolean;
  /** Null falls back to a centred card — better than an off-screen one. */
  anchor: AnchorRect | null;
  onDismiss: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

const ARROW = 10;

export function Popover({
  visible,
  anchor,
  onDismiss,
  title,
  children,
  footer,
}: PopoverProps) {
  const { width: winW, height: winH } = useWindowDimensions();
  const { sizeClass } = useSizeClass();
  const gutter = tokens.layout.gutter[sizeClass];
  const width = tokens.layout.popover.width;

  // The arithmetic lives in @bookflow/shared so the edge rules are
  // unit-tested: the near-edge fallback cannot be reached by tapping,
  // because no trigger in the app sits within 24 of the window edge yet.
  const placement = placePopover(anchor, winW, winH, {
    width,
    gutter,
    arrow: ARROW,
    arrowInset: tokens.space.md,
  });

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={onDismiss}
        accessibilityLabel="Dismiss"
      />
      <View
        style={[
          styles.card,
          { width, left: placement.left },
          placement.from === 'top'
            ? { top: placement.offset, maxHeight: placement.maxHeight }
            : { bottom: placement.offset, maxHeight: placement.maxHeight },
        ]}
        // box-none so the card's own children stay tappable while the
        // scrim underneath keeps receiving the dismiss press.
        pointerEvents="box-none"
      >
        {placement.arrowLeft !== null && (
          <View
            style={[
              styles.arrow,
              { left: placement.arrowLeft },
              placement.from === 'top' ? styles.arrowUp : styles.arrowDown,
            ]}
          />
        )}
        {title && <Text style={styles.title}>{title}</Text>}
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer && <View style={styles.footer}>{footer}</View>}
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgColors.overlay,
    opacity: tokens.bottomSheet.backdropOpacity,
  },
  card: {
    position: 'absolute',
    backgroundColor: tokens.colors.cream[50],
    borderRadius: tokens.radii.xl,
    paddingTop: tokens.space.ml,
    paddingBottom: tokens.space.md,
    paddingHorizontal: tokens.bottomSheet.paddingX,
    ...tokens.elevation[3],
  },
  arrow: {
    position: 'absolute',
    width: ARROW,
    height: ARROW,
    backgroundColor: tokens.colors.cream[50],
    transform: [{ rotate: '45deg' }],
  },
  arrowUp: {
    top: -ARROW / 2,
  },
  arrowDown: {
    bottom: -ARROW / 2,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    color: tokens.colors.ink[900],
    paddingBottom: tokens.space.md,
  },
  body: {
    paddingBottom: tokens.space.xs,
  },
  footer: {
    paddingTop: tokens.space.lg,
    gap: tokens.space.sm,
  },
});
