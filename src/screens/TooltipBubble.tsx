/**
 * TooltipBubble — reusable contextual tooltip for first-run feature hints.
 *
 * Per /docs/specs/b5_01_you_tab_system_flows.html. A small dark bubble with
 * an amber "New" eyebrow, headline, body, and Got it / Dismiss actions.
 * The caret can point down/up/right depending on where the tooltip is
 * anchored relative to the highlighted UI element.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type TooltipCaret = 'down' | 'up' | 'right' | 'none';

export type TooltipBubbleProps = {
  /** Small "New" / category eyebrow next to the amber dot. */
  eyebrow?: string;
  title: string;
  body: string;
  caret?: TooltipCaret;
  /** Horizontal offset for down/up carets (px from bubble left). */
  caretOffset?: number;
  /** Vertical offset for the right caret (px from bubble top). */
  caretVerticalOffset?: number;
  primaryLabel?: string;
  onPrimary?: () => void;
  onDismiss: () => void;
};

const BUBBLE_BG = tokens.colors.ink[900];

export function TooltipBubble({
  eyebrow = 'New',
  title,
  body,
  caret = 'down',
  caretOffset = 24,
  caretVerticalOffset = 24,
  primaryLabel = 'Got it',
  onPrimary,
  onDismiss,
}: TooltipBubbleProps) {
  return (
    <View style={styles.bubble}>
      {/* Eyebrow */}
      <View style={styles.eyebrowRow}>
        <View style={styles.dot} />
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Pressable
          onPress={onDismiss}
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityLabel="Dismiss"
        >
          <Icon name="X" size={9} color={tokens.colors.ink[400]} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Title */}
      <Text style={styles.title}>{title}</Text>
      {/* Body */}
      <Text style={styles.body}>{body}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={onPrimary ?? onDismiss}
          style={({ pressed }) => [styles.gotItBtn, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Text style={styles.gotItLabel}>{primaryLabel}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} hitSlop={6} accessibilityRole="button">
          <Text style={styles.dismissLabel}>Dismiss</Text>
        </Pressable>
      </View>

      {/* Caret */}
      {caret === 'down' && (
        <View style={[styles.caretDown, { left: caretOffset }]} />
      )}
      {caret === 'up' && (
        <View style={[styles.caretUp, { left: caretOffset }]} />
      )}
      {caret === 'right' && (
        <View style={[styles.caretRight, { top: caretVerticalOffset }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: BUBBLE_BG,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    maxWidth: 280,
  },

  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.colors.amber[500],
  },
  eyebrow: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.colors.amber[500],
  },
  closeBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: '#fff',
    marginBottom: 4,
  },
  body: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[300],
    lineHeight: 17,
    marginBottom: 10,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gotItBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 7,
    backgroundColor: tokens.colors.amber[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  gotItLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[900],
  },
  dismissLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.ink[400],
  },

  // Carets — small filled rects with a scale to approximate triangles.
  caretDown: {
    position: 'absolute',
    bottom: -7,
    width: 14,
    height: 7,
    backgroundColor: BUBBLE_BG,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    transform: [{ scaleX: 0.6 }],
  },
  caretUp: {
    position: 'absolute',
    top: -7,
    width: 14,
    height: 7,
    backgroundColor: BUBBLE_BG,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    transform: [{ scaleX: 0.6 }],
  },
  caretRight: {
    position: 'absolute',
    right: -7,
    width: 7,
    height: 14,
    backgroundColor: BUBBLE_BG,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    transform: [{ scaleY: 0.6 }],
  },
});
