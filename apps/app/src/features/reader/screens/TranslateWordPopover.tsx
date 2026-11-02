/**
 * TranslateWordPopover — the content of the reader's tap-to-translate
 * pop-over. `AI tools / Translate / Word popover / *` (`314:14135`).
 *
 * ## Why this file was dead, and is not any more
 *
 * It was written from `b4_01_reader_microinteractions.html`, exported
 * from the feature barrel, and had **no call sites**: the live pop-over
 * was a separate `TranslatePopover` inside `ReaderScreen` showing a
 * dictionary definition and nothing else. Two components for one
 * surface, and the one on screen was not the one in the file.
 *
 * R-M3c anchored the live one over the tapped word, which is what §4
 * asks for, and left the content alone because a translation is a data
 * change rather than a layout one. This is that follow-up: the frame's
 * content, driven by the translation service, with `ReaderScreen` now
 * reduced to fetching and placing it.
 *
 * ## What the frame draws
 *
 * 260 wide, dark, with five stacked blocks: the language pair and a
 * close button, the word and its phonetic, the definition, the
 * translation under its own language label, and Play / Save. The
 * component in Figma carries **no caret** — the earlier version here
 * drew one, from the older spec, and it is gone.
 *
 * Two states the frame does not draw but the app needs: the lookup and
 * the translation each arrive on their own, so each line says it is
 * working rather than leaving a gap that shifts when it fills, and
 * Save becomes Saved once the word is in the notebook.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

export type TranslateWordPopoverProps = {
  word: string;
  phonetic?: string;
  /** Null while the dictionary is still answering. */
  definition: string | null;
  /** Null while the translation is still answering. */
  translation: string | null;
  /** Shown in the header and above the translation, e.g. "TWI". */
  toLang: string;
  fromLang?: string;
  /** The word is already in the notebook. */
  saved: boolean;
  onPlayAudio: () => void;
  onSave: () => void;
  onDismiss: () => void;
};

export function TranslateWordPopover({
  word,
  phonetic,
  definition,
  translation,
  toLang,
  fromLang = 'EN',
  saved,
  onPlayAudio,
  onSave,
  onDismiss,
}: TranslateWordPopoverProps) {
  return (
    <View style={styles.popover}>
      <View style={styles.header}>
        <View style={styles.langPair}>
          <Text style={styles.langFrom}>{fromLang}</Text>
          <Text style={styles.langArrow}>→</Text>
          <Text style={styles.langTo}>{toLang}</Text>
        </View>
        <Pressable
          onPress={onDismiss}
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="X" size={9} color={tokens.colors.ink[400]} />
        </Pressable>
      </View>

      <View style={styles.wordRow}>
        <Text style={styles.word} numberOfLines={2}>
          {word}
        </Text>
        {phonetic ? <Text style={styles.phonetic}>{phonetic}</Text> : null}
      </View>

      <Text style={styles.definition}>
        {definition ?? 'Looking up…'}
      </Text>

      <View style={styles.translationRow}>
        <Text style={styles.translationLabel}>{toLang}</Text>
        <Text style={styles.translation}>
          {translation ?? 'Translating…'}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={onPlayAudio}
          accessibilityRole="button"
          accessibilityLabel="Play pronunciation"
        >
          <Icon name="Music" size={14} color={tokens.colors.cream[50]} />
          <Text style={styles.btnLabel}>Play</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.btnPressed,
            saved && styles.btnSaved,
          ]}
          onPress={onSave}
          disabled={saved}
          accessibilityRole="button"
        >
          <Icon
            name={saved ? 'Check' : 'Notebook'}
            size={14}
            color={tokens.colors.cream[50]}
          />
          <Text style={styles.btnLabel}>{saved ? 'Saved' : 'Save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  popover: {
    backgroundColor: tokens.colors.ink[900],
    borderRadius: 14,
    paddingBottom: 12,
    ...tokens.elevation[4],
  },

  header: {
    height: 36,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  langPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langFrom: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  langArrow: {
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  langTo: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.amber[500],
  },
  closeBtn: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  wordRow: {
    paddingHorizontal: 14,
    gap: 2,
  },
  word: {
    fontFamily: tokens.fonts.display,
    fontSize: 24,
    lineHeight: 30,
    color: tokens.colors.cream[50],
  },
  phonetic: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[400],
  },

  definition: {
    paddingHorizontal: 14,
    paddingTop: 10,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.ink[200],
  },

  translationRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 4,
  },
  translationLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.5,
    color: tokens.colors.ink[400],
  },
  translation: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 16,
    lineHeight: 21,
    color: tokens.colors.amber[500],
  },

  actions: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 7,
  },
  btn: {
    flex: 1,
    height: 30,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: tokens.colors.ink[700],
  },
  btnPressed: {
    opacity: tokens.hover.filledOpacity,
  },
  btnSaved: {
    backgroundColor: tokens.colors.forest[700],
  },
  btnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.cream[50],
  },
});
