/**
 * TranslateChapterScreen — full-screen chapter translation result.
 *
 * Per /docs/specs/b4_02_qa_edge_states.html. Reads exactly like the Reader
 * (Literata, same line-height) so a translated chapter feels like the
 * original — not a glossary spit-out.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Lang = 'en' | 'twi';

export type TranslatedSection = {
  /** Pre-split paragraphs of translated body. */
  paragraphs: string[];
};

export type TranslateChapterScreenProps = {
  bookTitle: string;
  chapterLabel: string; // e.g. "Ch. 4"
  sourceLang?: Lang; // defaults to 'en'
  /** Sections in target language; original-language version implied cached. */
  sections: TranslatedSection[];
  initialLang?: Lang; // defaults to 'twi'
  onBack: () => void;
  onShare?: () => void;
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_SECTIONS: TranslatedSection[] = [
  {
    paragraphs: [
      'Saa ber a me kyerɛɛ hia oo, na mekaa din nnipa a wɔbaa Gatsby dan no wɔ saa mmerɛ no mu. Ɛyɛ bere aduru a ɛduru akyiri no, na ɛno bi a wɔtwerɛɛ ase "Amammuo no ɛbɛdi hia July 5, 1922 saa".',
      'Ɛno nti, wɔfiri East Egg bae, Chester Beckers ne Leeches, na onipa bi a wɔfrɛ no Bunsen — ɔbarima bi a me nim no Yale — ne Dokota Webster Civet, a owui asubɔnten mu afe a ato no summer Maine.',
      'Na Hornbeams ne Willie Voltaires, na abusua bi a wɔfrɛ wɔn Blackbuck a daa wɔkɔ kɔtena ɔfam no, wɔn ho frɛɛ wɔn na wɔhuruu wɔn hwene sɛ nnwan wɔ obiara a ɔbaa ho.',
    ],
  },
  {
    paragraphs: [
      'Section 2 placeholder — additional translated text would render here, with the same Literata typography and line-height as the original Reader.',
    ],
  },
  {
    paragraphs: [
      'Section 3 placeholder — final passage of the chapter, in the chosen target language.',
    ],
  },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export function TranslateChapterScreen({
  bookTitle = 'The Great Gatsby',
  chapterLabel = 'Ch. 4',
  sourceLang = 'en',
  sections = MOCK_SECTIONS,
  initialLang = 'twi',
  onBack,
  onShare,
}: Partial<TranslateChapterScreenProps> & Pick<TranslateChapterScreenProps, 'onBack'>) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [sectionIdx, setSectionIdx] = useState(0);

  const totalSections = sections.length;
  const current = sections[sectionIdx] ?? { paragraphs: [] };

  const sourceLabel = sourceLang === 'en' ? 'English' : 'Twi';
  const targetLabel = lang === 'en' ? 'English' : 'Twi';

  const goPrev = () => setSectionIdx((i) => Math.max(0, i - 1));
  const goNext = () => setSectionIdx((i) => Math.min(totalSections - 1, i + 1));

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={14} color={tokens.textColors.secondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Chapter translation</Text>
          <Text style={styles.headerSub}>
            {bookTitle} · {chapterLabel}
          </Text>
        </View>
        <Pressable
          onPress={onShare ?? (() => {})}
          style={styles.headerShare}
          hitSlop={8}
          accessibilityLabel="Share"
        >
          <Icon name="Upload" size={15} color={tokens.textColors.secondary} />
        </Pressable>
      </View>

      {/* Language toggle */}
      <View style={styles.langToggle}>
        <Pressable
          style={[styles.langPill, lang === 'en' ? styles.langPillActive : styles.langPillInactive]}
          onPress={() => setLang('en')}
        >
          <Icon
            name="Globe"
            size={12}
            color={lang === 'en' ? tokens.colors.forest[800] : tokens.textColors.muted}
            strokeWidth={1.5}
          />
          <Text
            style={[
              styles.langPillLabel,
              { color: lang === 'en' ? tokens.colors.forest[800] : tokens.textColors.muted },
            ]}
          >
            English
          </Text>
        </Pressable>
        <Text style={styles.langDivider}>↔</Text>
        <Pressable
          style={[styles.langPill, lang === 'twi' ? styles.langPillActive : styles.langPillInactive]}
          onPress={() => setLang('twi')}
        >
          <Icon
            name="Globe"
            size={12}
            color={lang === 'twi' ? tokens.colors.forest[800] : tokens.textColors.muted}
            strokeWidth={1.5}
          />
          <Text
            style={[
              styles.langPillLabel,
              { color: lang === 'twi' ? tokens.colors.forest[800] : tokens.textColors.muted },
            ]}
          >
            Twi
          </Text>
        </Pressable>
      </View>

      {/* Section nav */}
      <View style={styles.sectionNav}>
        <Text style={styles.sectionNavLabel}>
          Section {sectionIdx + 1} of {totalSections}
        </Text>
        <View style={styles.sectionNavBtns}>
          <Pressable
            style={[styles.sectionNavBtn, sectionIdx === 0 && styles.sectionNavBtnDisabled]}
            onPress={goPrev}
            disabled={sectionIdx === 0}
            hitSlop={6}
            accessibilityLabel="Previous section"
          >
            <Icon name="ArrowLeft" size={11} color={tokens.textColors.secondary} strokeWidth={2} />
          </Pressable>
          <Pressable
            style={[
              styles.sectionNavBtn,
              sectionIdx === totalSections - 1 && styles.sectionNavBtnDisabled,
            ]}
            onPress={goNext}
            disabled={sectionIdx === totalSections - 1}
            hitSlop={6}
            accessibilityLabel="Next section"
          >
            <Icon name="ArrowRight" size={11} color={tokens.textColors.secondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      {/* Body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sourceNote}>
          <Icon name="Globe" size={12} color={tokens.textColors.disabled} strokeWidth={1.5} />
          <Text style={styles.sourceNoteText}>
            Translated from {sourceLabel} · {targetLabel} version
          </Text>
        </View>

        {current.paragraphs.map((p, i) => (
          <Text key={i} style={styles.paragraph}>
            {p}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  headerBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
  },
  headerShare: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Language toggle
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  langPill: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1.5,
  },
  langPillActive: {
    backgroundColor: tokens.colors.forest[50],
    borderColor: tokens.colors.forest[800],
  },
  langPillInactive: {
    backgroundColor: tokens.bgColors.surface,
    borderColor: tokens.colors.ink[200],
  },
  langPillLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  langDivider: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
  },

  // Section navigation
  sectionNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: tokens.bgColors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  sectionNavLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  sectionNavBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  sectionNavBtn: {
    width: 26,
    height: 26,
    borderRadius: 6,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionNavBtnDisabled: { opacity: 0.4 },

  // Body
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  sourceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 8,
    marginBottom: 14,
  },
  sourceNoteText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  paragraph: {
    fontFamily: tokens.fonts.reading,
    fontSize: 15,
    lineHeight: 27,
    color: tokens.textColors.primary,
    marginBottom: 14,
  },
});
