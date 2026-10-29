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
  /** One node beside the close X, for a screen that had a header action. */
  headerAction?: ReactNode;
  /**
   * Shows a back chevron before the title.
   *
   * For a panel with a root: the reader's AI tools list opens each
   * tool *inside* the panel, and the hosted screen's own back button
   * is suppressed along with its header, so without this there is no
   * way back to the list — only a close.
   */
  onBack?: () => void;
  /**
   * Hand the body to `children` without a ScrollView.
   *
   * For content that must own its own scrolling: a chat transcript
   * that pins a composer below it and scrolls to the bottom cannot
   * live inside a content container. Same meaning as `Modal`'s
   * `bare`, so the two containers stay learnable together.
   */
  bare?: boolean;
};

export function SidePanel({
  visible,
  mode = 'slide-over',
  onDismiss,
  title,
  children,
  footer,
  headerAction,
  onBack,
  bare = false,
}: SidePanelProps) {
  const body = (
    <PanelBody
      title={title}
      footer={footer}
      headerAction={headerAction}
      onBack={onBack}
      bare={bare}
      onDismiss={onDismiss}
    >
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
  headerAction,
  onBack,
  bare,
  onDismiss,
}: {
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerAction?: ReactNode;
  onBack?: () => void;
  bare?: boolean;
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
        {onBack && (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
          >
            <Icon
              name="ArrowLeft"
              size={tokens.iconSize.sm}
              color={tokens.textColors.secondary}
            />
          </Pressable>
        )}
        <Text style={styles.title} numberOfLines={1}>
          {title ?? ''}
        </Text>
        {headerAction}
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
      {bare ? (
        // `flex: 1` so the child fills the panel the way it filled a
        // screen. The scrolled path deliberately has none: a flexed
        // child of a content container collapses to nothing.
        <View style={styles.bareBody}>{children}</View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )}
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
  // The hosted screen owns its whole interior, including its own
  // horizontal padding — same contract as `Modal`'s `bare`.
  bareBody: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: tokens.bottomSheet.paddingX,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    gap: tokens.space.sm,
  },
});
