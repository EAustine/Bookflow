/**
 * Modal — the wide-screen presentation of a confirm sheet or a
 * full-screen task. Figma `Modal` `296:443`.
 *
 * §3 of docs/specs/responsive-handoff.md: a centred card over a dimmed
 * screen, at one of four widths — Confirm 440 for destructive
 * confirmations, Large 640 for a task like buying credits, Alert 400
 * for the web dialog that stands in for an iOS alert on desktop, and
 * Lane 480 for the upload dialogs, which reuse `layout/lane/width`
 * rather than introduce a second 480.
 *
 * Named after the Figma component. React Native's own `Modal` is
 * imported here as `RNModal`; this wraps it rather than competing with
 * it.
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
import { useSizeClass } from '~/hooks/useSizeClass';
import { tokens } from '~/design/tokens';

export type ModalSize = 'alert' | 'confirm' | 'large' | 'lane';

export type ModalProps = {
  visible: boolean;
  size?: ModalSize;
  onDismiss: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Whether pressing the scrim closes it. Off for a task in progress —
   * an upload should not be dismissed by a stray tap.
   */
  dismissOnScrimPress?: boolean;
  /**
   * Hand the card's whole interior to `children`: no title row, no
   * scroll view, no horizontal padding.
   *
   * For hosting a screen that was built to fill a window and already
   * brings its own padding and its own scrolling — the upload flow's
   * two. The build log asks for "the same Processing screen instance as
   * mobile", and that is only literally true if the frame around it
   * adds nothing: `ProcessingScreen`'s failed branch *is* a ScrollView,
   * which would otherwise nest inside this one.
   */
  bare?: boolean;
};

/** Lane reuses `layout/lane/width`; the rest are the modal's own. */
function widthFor(size: ModalSize): number {
  return size === 'lane'
    ? tokens.layout.lane.width
    : tokens.layout.modal[size];
}

export function Modal({
  visible,
  size = 'confirm',
  onDismiss,
  title,
  children,
  footer,
  dismissOnScrimPress = true,
  bare = false,
}: ModalProps) {
  const { height: winH, width: winW } = useWindowDimensions();
  const { sizeClass } = useSizeClass();
  const gutter = tokens.layout.gutter[sizeClass];

  // Never wider than the window allows. A 640 Large modal on an 820
  // tablet in portrait still has to leave its gutters.
  const width = Math.min(widthFor(size), winW - gutter * 2);

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={dismissOnScrimPress ? onDismiss : undefined}
        accessibilityLabel={dismissOnScrimPress ? 'Dismiss' : undefined}
      />
      <View style={styles.centre} pointerEvents="box-none">
        <View
          style={[
            styles.card,
            bare && styles.cardBare,
            { width, maxHeight: winH - gutter * 2 },
          ]}
        >
          {bare ? (
            children
          ) : (
            <>
              {title && <Text style={styles.title}>{title}</Text>}
              <ScrollView
                bounces={false}
                contentContainerStyle={styles.body}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
              {footer && <View style={styles.footer}>{footer}</View>}
            </>
          )}
        </View>
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
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: tokens.colors.cream[50],
    borderRadius: tokens.radii.xl,
    paddingTop: tokens.space.xl,
    paddingBottom: tokens.space.lg,
    paddingHorizontal: tokens.bottomSheet.paddingX,
    ...tokens.elevation[4],
  },
  cardBare: {
    // The hosted screen owns the interior, including its own padding.
    // Zeroed key by key, not with a `padding: 0` shorthand: React
    // Native resolves the specific properties over the shorthand
    // whichever order the styles are flattened in, so the card's
    // paddingTop would have survived.
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    // Keeps the hosted screen inside the card's rounded corners, which
    // it knows nothing about.
    overflow: 'hidden',
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
