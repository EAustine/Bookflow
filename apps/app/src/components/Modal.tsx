/**
 * Modal — the wide-screen presentation of a confirm sheet or a
 * full-screen task. Figma `Modal` `296:443`.
 *
 * §3 of docs/specs/responsive-handoff.md: a centred card over a dimmed
 * screen, at one of three widths — Confirm 440 for destructive
 * confirmations, Large 640 for a task like buying credits, and Alert 400
 * for the web dialog that stands in for an iOS alert on desktop.
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

export type ModalSize = 'alert' | 'confirm' | 'large';

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
};

export function Modal({
  visible,
  size = 'confirm',
  onDismiss,
  title,
  children,
  footer,
  dismissOnScrimPress = true,
}: ModalProps) {
  const { height: winH, width: winW } = useWindowDimensions();
  const { sizeClass } = useSizeClass();
  const gutter = tokens.layout.gutter[sizeClass];

  // Never wider than the window allows. A 640 Large modal on an 820
  // tablet in portrait still has to leave its gutters.
  const width = Math.min(tokens.layout.modal[size], winW - gutter * 2);

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
        <View style={[styles.card, { width, maxHeight: winH - gutter * 2 }]}>
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
