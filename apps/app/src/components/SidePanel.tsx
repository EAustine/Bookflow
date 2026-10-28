/**
 * SidePanel — the wide-screen presentation of the reader and AI tool
 * sheets. Figma `Side panel` `296:407`, `Pane header` `296:386`.
 *
 * §3 of docs/specs/responsive-handoff.md gives it two modes:
 *
 *   - **Slide-over** — 380 from the right, over a scrim. Medium.
 *   - **Docked** — 380, *pushes* the reading area. Expanded and Desktop.
 *
 * Only Slide-over is an overlay. A docked panel is a layout sibling: the
 * host screen has to give up 380 of its width for it, which no screen
 * does yet, so `Presenter` presents every wide class as a slide-over for
 * now and docking arrives with the reader. The mode exists here so that
 * is a change of caller, not a rewrite.
 */

import type { ReactNode } from 'react';
import {
  Modal as RNModal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Text } from './Text';
import { tokens } from '~/design/tokens';

export type SidePanelMode = 'slide-over' | 'docked';

export type SidePanelProps = {
  visible: boolean;
  mode?: SidePanelMode;
  onDismiss: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function SidePanel({
  visible,
  mode = 'slide-over',
  onDismiss,
  title,
  children,
  footer,
}: SidePanelProps) {
  const body = (
    <PanelBody title={title} footer={footer} onDismiss={onDismiss}>
      {children}
    </PanelBody>
  );

  // Docked: no modal, no scrim. It is a column the host screen lays out
  // beside its content, so it renders inline or not at all.
  if (mode === 'docked') return visible ? body : null;

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={onDismiss}
        accessibilityLabel="Dismiss"
      />
      <View style={styles.slideOverHost} pointerEvents="box-none">
        {body}
      </View>
    </RNModal>
  );
}

function PanelBody({
  title,
  children,
  footer,
  onDismiss,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.panel,
        { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
        >
          <Icon
            name="X"
            size={tokens.iconSize.md}
            color={tokens.textColors.muted}
          />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: tokens.bgColors.overlay,
    opacity: tokens.bottomSheet.backdropOpacity,
  },
  slideOverHost: {
    flex: 1,
    alignItems: 'flex-end',
  },
  panel: {
    width: tokens.layout.panel.side,
    height: '100%',
    backgroundColor: tokens.colors.cream[50],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: tokens.borderColors.subtle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space.md,
    paddingHorizontal: tokens.bottomSheet.paddingX,
    paddingBottom: tokens.space.md,
  },
  title: {
    flex: 1,
    fontFamily: tokens.fonts.display,
    fontSize: tokens.fontSizes.display.sm,
    color: tokens.colors.ink[900],
  },
  body: {
    paddingHorizontal: tokens.bottomSheet.paddingX,
    paddingBottom: tokens.space.lg,
  },
  footer: {
    paddingHorizontal: tokens.bottomSheet.paddingX,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.sm,
  },
});
