/**
 * TranslateWordPopover — tap-to-translate popover.
 *
 * Per /docs/specs/b4_01_reader_microinteractions.html. Floats above the tapped
 * word with caret pointing down at it. Dark surface (ink-900) for max contrast
 * against the cream reader background.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type TranslateWordPopoverProps = {
  word: string;
  phonetic?: string;
  definition: string;
  translation: string;
  fromLang?: string; // e.g. "EN"
  toLang?: string; // e.g. "TWI"
  /** Horizontal anchor offset for the caret (px from popover left). */
  caretOffset?: number;
  onPlayAudio?: () => void;
  onSave?: () => void;
  onDismiss: () => void;
};

export function TranslateWordPopover({
  word,
  phonetic,
  definition,
  translation,
  fromLang = 'EN',
  toLang = 'TWI',
  caretOffset = 62,
  onPlayAudio,
  onSave,
  onDismiss,
}: TranslateWordPopoverProps) {
  return (
    <View style={styles.popover} pointerEvents="box-none">
      {/* Header: language pair + close */}
      <View style={styles.header}>
        <View style={styles.langPair}>
          <Text style={styles.langFrom}>{fromLang}</Text>
          <Text style={styles.langArrow}>→</Text>
          <Text style={styles.langTo}>{toLang}</Text>
        </View>
        <Pressable onPress={onDismiss} style={styles.closeBtn} hitSlop={8} accessibilityLabel="Close">
          <Icon name="X" size={9} color={tokens.colors.ink[400]} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* Word + phonetic */}
      <View style={styles.wordRow}>
        <Text style={styles.word}>{word}</Text>
        {phonetic && <Text style={styles.phonetic}>{phonetic}</Text>}
      </View>

      {/* Definition */}
      <Text style={styles.definition}>{definition}</Text>

      {/* Translation */}
      <View style={styles.translationRow}>
        <Text style={styles.translationLabel}>{toLang}</Text>
        <Text style={styles.translation}>{translation}</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnAudio, pressed && { opacity: 0.85 }]}
          onPress={onPlayAudio ?? (() => {})}
          accessibilityRole="button"
        >
          <Icon name="Music" size={11} color={tokens.colors.cream[50]} strokeWidth={1.5} />
          <Text style={styles.btnAudioLabel}>Play</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnSave, pressed && { opacity: 0.85 }]}
          onPress={onSave ?? (() => {})}
          accessibilityRole="button"
        >
          <Text style={styles.btnSaveLabel}>Save word</Text>
        </Pressable>
      </View>

      {/* Down-pointing caret */}
      <View style={[styles.caret, { left: caretOffset }]} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const POPOVER_BG = tokens.colors.ink[900];

const styles = StyleSheet.create({
  popover: {
    backgroundColor: POPOVER_BG,
    borderRadius: 14,
    overflow: 'visible',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  langPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langFrom: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
  },
  langArrow: {
    fontSize: 10,
    color: tokens.colors.ink[500],
  },
  langTo: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.colors.amber[500],
  },
  closeBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Word
  wordRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  word: {
    fontFamily: tokens.fonts.reading,
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: -0.22,
    color: '#fff',
    marginBottom: 3,
  },
  phonetic: {
    fontFamily: tokens.fonts.reading,
    fontSize: 11,
    fontStyle: 'italic',
    color: tokens.colors.ink[400],
    marginBottom: 6,
  },

  // Definition
  definition: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[300],
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },

  // Translation
  translationRow: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  translationLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.06,
    textTransform: 'uppercase',
    color: tokens.colors.ink[500],
    marginBottom: 4,
  },
  translation: {
    fontFamily: tokens.fonts.reading,
    fontSize: 16,
    color: tokens.colors.amber[500],
    lineHeight: 21,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  btn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  btnAudio: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  btnAudioLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: '#fff',
  },
  btnSave: {
    backgroundColor: tokens.colors.forest[800],
    marginLeft: 'auto',
  },
  btnSaveLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Caret pointing down at the tapped word
  caret: {
    position: 'absolute',
    bottom: -7,
    width: 14,
    height: 7,
    backgroundColor: POPOVER_BG,
    // Triangle approximation via transform (RN doesn't support clip-path).
    // We keep this as a small filled rect; real implementation uses an SVG.
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    transform: [{ scaleX: 0.6 }],
  },
});
