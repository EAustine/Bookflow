import { useCallback, useMemo, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheet, ChapterSheet, type BottomSheetRef, Icon, Text } from '~/components';
import { AIToolsSheet, SummaryScreen, ChatScreen } from '~/screens/AIToolsScreen';
import { PracticeQuestionsScreen } from '~/screens/PracticeQuestionsScreen';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import {
  type ReaderFontFamily,
  type ReaderPreset,
  type ReaderTheme,
  useReaderStore,
} from '~/stores/readerStore';

// ─── Mock chapter content ─────────────────────────────────────────────────────

type ChapterMeta = { label: string; title: string; paragraphs: string[] };

const CHAPTER_CONTENT: Record<string, ChapterMeta> = {
  '1': {
    label: 'Chapter Four',
    title: 'On the road to West Egg',
    paragraphs: [
      'Once I wrote down on the empty spaces of a time-table the names of those who came to Gatsby\'s house that summer. It is an old time-table now, disintegrating at its folds, and headed "This schedule in effect July 5th, 1922." But I can still read the grey names, and they will give you a better impression than my generalities of those who accepted Gatsby\'s hospitality and paid him the subtle tribute of knowing nothing whatever about him.',
      'From East Egg, then, came the Chester Beckers and the Leeches, and a man named Bunsen, whom I knew at Yale, and Doctor Webster Civet, who was drowned last summer up in Maine. And the Hornbeams and the Willie Voltaires, and a whole clan named Blackbuck, who always gathered in a corner and flipped up their noses like goats at whosoever came near.',
      'From farther out on the Island came the Cheadles and the O. R. P. Schraeders, and the Stonewall Jackson Abrams of Georgia, and the Fishguards and the Ripley Snells. Snell was there three days before he went to the penitentiary, so drunk out on the gravel drive that Mrs. Ulysses Swett\'s automobile ran over his right hand.',
      'Also from New York were the Chromes and the Backhyssons and the Dennickers and Russel Betty and the Corrigans and the Kellehers and the Dewars and the Scullys and S. W. Belcher and the Smirkes and the young Quinns, divorced now, and Henry L. Palmetto, who killed himself by jumping in front of a subway train in Times Square.',
    ],
  },
};

const FALLBACK_CHAPTER: ChapterMeta = {
  label: 'Chapter One',
  title: 'The beginning',
  paragraphs: [
    'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair.',
    'We had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way — in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.',
    'There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.',
  ],
};

// ─── Theme palette ────────────────────────────────────────────────────────────

const THEME = {
  light: {
    bg: tokens.bgColors.canvas,
    surface: tokens.bgColors.surface,
    text: tokens.textColors.primary,
    muted: tokens.textColors.muted,
    subtle: tokens.textColors.subtle,
    border: tokens.borderColors.subtle,
    headerBg: tokens.bgColors.canvas,
    actionBg: tokens.bgColors.canvas,
  },
  sepia: {
    bg: tokens.colors.sepia.bg,
    surface: tokens.colors.sepia.surface,
    text: tokens.colors.sepia.text,
    muted: tokens.colors.sepia.muted,
    subtle: tokens.colors.sepia.subtle,
    border: tokens.colors.sepia.border,
    headerBg: tokens.colors.sepia.bg,
    actionBg: tokens.colors.sepia.bg,
  },
  dark: {
    bg: tokens.colors.ink[900],
    surface: tokens.colors.ink[700],
    text: tokens.colors.cream[50],
    muted: tokens.colors.ink[400],
    subtle: tokens.colors.ink[400],
    border: tokens.colors.ink[700],
    headerBg: tokens.colors.ink[900],
    actionBg: tokens.colors.ink[900],
  },
} as const;

// ─── Font families ────────────────────────────────────────────────────────────

const FONT_MAP: Record<ReaderFontFamily, string> = {
  serif: 'Literata_400Regular',
  sans: tokens.fonts.ui,
  lexend: 'Lexend_400Regular',
};

// ─── Props ────────────────────────────────────────────────────────────────────

export type ReaderScreenProps = {
  book: Book;
  onBack: () => void;
  onListen?: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ReaderScreen({ book, onBack, onListen }: ReaderScreenProps) {
  const { preset, fontSize, fontFamily, theme, setPreset, setFontSize, setFontFamily, setTheme, reset } =
    useReaderStore();

  const [tappedWord, setTappedWord] = useState<string | null>(null);
  const [aiMode, setAIMode] = useState<'summary' | 'chat' | 'practice' | null>(null);
  const typoSheetRef = useRef<BottomSheetRef>(null);
  const chapterSheetRef = useRef<BottomSheetRef>(null);
  const aiSheetRef = useRef<BottomSheetRef>(null);

  const palette = THEME[theme];
  const chapter = CHAPTER_CONTENT[book.id] ?? FALLBACK_CHAPTER;
  const readingFont = FONT_MAP[fontFamily];

  const chNum = book.currentChapter?.match(/\d+/)?.[0] ?? '1';
  const currentPage = Math.max(1, Math.floor((book.progressPercent / 100) * book.totalPages));
  const headerMeta = `Ch. ${chNum} · ${book.progressPercent}% · p. ${currentPage} of ${book.totalPages}`;

  const wordCount = useMemo(
    () => chapter.paragraphs.join(' ').split(/\s+/).length,
    [chapter],
  );
  const minsLeft = Math.max(1, Math.round(wordCount / 238));

  const handleWordPress = useCallback((word: string) => {
    const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (cleaned.length <= 1) return;
    setTappedWord((prev) => (prev === cleaned ? null : cleaned));
  }, []);

  const dismissPopover = useCallback(() => setTappedWord(null), []);

  if (aiMode === 'summary') {
    return <SummaryScreen book={book} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'chat') {
    return <ChatScreen book={book} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'practice') {
    return <PracticeQuestionsScreen book={book} onBack={() => setAIMode(null)} />;
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      {/* Header */}
      <ReaderHeader
        book={book}
        meta={headerMeta}
        palette={palette}
        onBack={onBack}
        onTypography={() => typoSheetRef.current?.present()}
        onChapters={() => chapterSheetRef.current?.present()}
      />

      {/* Reading area */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={dismissPopover}
      >
        <Text style={[styles.chapterLabel, { color: palette.subtle }]}>
          {chapter.label}
        </Text>
        <Text style={[styles.chapterTitle, { color: palette.text }]}>
          {chapter.title}
        </Text>
        {chapter.paragraphs.map((para, i) => (
          <TappableParagraph
            key={i}
            text={para}
            tappedWord={tappedWord}
            onWordPress={handleWordPress}
            style={{ fontFamily: readingFont, fontSize, color: palette.text }}
          />
        ))}
      </ScrollView>

      {/* Progress bar */}
      <View style={[styles.progressZone, { borderTopColor: palette.border, backgroundColor: palette.actionBg }]}>
        <View style={[styles.progressTrack, { backgroundColor: palette.surface }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${book.progressPercent}%` },
            ]}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.progressText, { color: palette.subtle }]}>
            p. {currentPage} of {book.totalPages}
          </Text>
          <Text style={[styles.progressText, { color: palette.subtle }]}>
            ~{minsLeft} min left in chapter
          </Text>
        </View>
      </View>

      {/* Action bar */}
      <ActionBar
        palette={palette}
        onListen={onListen}
        onAITools={() => aiSheetRef.current?.present()}
        onChapters={() => chapterSheetRef.current?.present()}
      />

      {/* Dismiss overlay + translate popover */}
      {tappedWord && (
        <>
          <Pressable
            style={styles.dismissOverlay}
            onPress={dismissPopover}
            accessibilityLabel="Dismiss"
          />
          <TranslatePopover word={tappedWord} onDismiss={dismissPopover} />
        </>
      )}

      {/* Chapter list sheet */}
      <ChapterSheet ref={chapterSheetRef} book={book} mode="reader" />

      {/* AI tools sheet */}
      <AIToolsSheet
        ref={aiSheetRef}
        book={book}
        onSummarize={() => setAIMode('summary')}
        onPractice={() => setAIMode('practice')}
        onAsk={() => setAIMode('chat')}
      />

      {/* Typography sheet */}
      <BottomSheet ref={typoSheetRef}>
        <TypographySheet
          preset={preset}
          fontSize={fontSize}
          fontFamily={fontFamily}
          theme={theme}
          onPreset={setPreset}
          onFontSize={setFontSize}
          onFontFamily={setFontFamily}
          onTheme={setTheme}
          onReset={reset}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Reader header ────────────────────────────────────────────────────────────

function ReaderHeader({
  book,
  meta,
  palette,
  onBack,
  onTypography,
  onChapters,
}: {
  book: Book;
  meta: string;
  palette: (typeof THEME)[ReaderTheme];
  onBack: () => void;
  onTypography: () => void;
  onChapters: () => void;
}) {
  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: palette.border, backgroundColor: palette.headerBg },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backBtn}
      >
        <Icon name="ArrowLeft" size={18} color={palette.text} />
      </Pressable>

      <View style={styles.headerCenter}>
        <Text style={[styles.headerBookTitle, { color: palette.text }]} numberOfLines={1}>
          {book.title}
        </Text>
        <Text style={[styles.headerMeta, { color: palette.subtle }]}>
          {meta}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Typography"
          onPress={onTypography}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Text style={[styles.aaLabel, { color: palette.text }]}>Aa</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chapters"
          onPress={onChapters}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="ListDetails" size={17} color={palette.text} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Tappable text ────────────────────────────────────────────────────────────

function TappableParagraph({
  text,
  tappedWord,
  onWordPress,
  style,
}: {
  text: string;
  tappedWord: string | null;
  onWordPress: (word: string) => void;
  style: { fontFamily: string; fontSize: number; color: string };
}) {
  const tl = tappedWord?.toLowerCase() ?? '';
  const parts = useMemo(() => text.split(/(\s+)/), [text]);

  return (
    <RNText
      style={[
        styles.paragraph,
        { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.fontSize * 1.78, color: style.color },
      ]}
    >
      {parts.map((token, i) => {
        if (/^\s+$/.test(token)) return token;
        const clean = token.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
        const isTapped = clean.length > 1 && clean === tl;
        return (
          <RNText
            key={i}
            onPress={() => onWordPress(token)}
            style={isTapped ? styles.wordTapped : undefined}
          >
            {token}
          </RNText>
        );
      })}
    </RNText>
  );
}

// ─── Action bar ───────────────────────────────────────────────────────────────

function ActionBar({
  palette,
  onListen,
  onAITools,
  onChapters,
}: {
  palette: (typeof THEME)[ReaderTheme];
  onListen?: () => void;
  onAITools?: () => void;
  onChapters?: () => void;
}) {
  const ACTIONS = [
    { icon: 'Headphones' as const,  label: 'Listen',   primary: true,  onPress: onListen },
    { icon: 'Wand' as const,        label: 'AI tools', primary: false, onPress: onAITools },
    { icon: 'ListDetails' as const, label: 'Chapters', primary: false, onPress: onChapters },
    { icon: 'Search' as const,      label: 'Search',   primary: false, onPress: undefined },
  ];

  return (
    <View style={[styles.actionBar, { borderTopColor: palette.border, backgroundColor: palette.actionBg }]}>
      {ACTIONS.map(({ icon, label, primary, onPress }) => (
        <Pressable
          key={label}
          accessibilityRole="button"
          onPress={onPress ?? (() => {})}
          style={styles.actionItem}
        >
          <View
            style={[
              styles.actionIcon,
              primary ? styles.actionIconPrimary : { backgroundColor: palette.surface },
            ]}
          >
            <Icon
              name={icon}
              size={18}
              color={primary ? tokens.bgColors.canvas : palette.text}
            />
          </View>
          <Text style={[styles.actionLabel, { color: palette.muted }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Translate popover ────────────────────────────────────────────────────────

function TranslatePopover({
  word,
  onDismiss,
}: {
  word: string;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.popoverOverlay} pointerEvents="box-none">
      <View style={styles.popover}>
        <Text style={styles.popoverWord}>{word}</Text>
        <Text style={styles.popoverPhonetic}>/ˌpen.ɪˈten.ʃər.i/</Text>
        <View style={styles.popoverDivider} />
        <View style={styles.popoverRow}>
          <Text style={styles.popoverLang}>EN</Text>
          <Text style={styles.popoverDef}>
            A prison for people convicted of serious crimes; a place of punishment and reform.
          </Text>
        </View>
        <View style={styles.popoverRow}>
          <Text style={[styles.popoverLang, { color: tokens.colors.amber[500] }]}>TWI</Text>
          <Text style={styles.popoverTranslation}>
            Afiase — efie a wɔhyɛ nnebɔneyɛfo wɔ mu
          </Text>
        </View>
        <View style={styles.popoverActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play pronunciation"
            onPress={() => {}}
            style={styles.popoverBtnAudio}
          >
            <Icon name="Headphones" size={12} color={tokens.colors.cream[50]} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => {}}
            style={styles.popoverBtnSave}
          >
            <Icon name="Notebook" size={11} color={tokens.colors.cream[50]} />
            <Text style={styles.popoverBtnText}>Save word</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.popoverBtnDismiss}
          >
            <Text style={styles.popoverDismissText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Typography sheet ─────────────────────────────────────────────────────────

const PRESETS: { key: ReaderPreset; label: string; previewSize: number; lineHeight: number }[] = [
  { key: 'standard',    label: 'Standard',        previewSize: 16, lineHeight: 1.5 },
  { key: 'comfortable', label: 'Comfortable',     previewSize: 18, lineHeight: 1.8 },
  { key: 'max',         label: 'Max readability', previewSize: 20, lineHeight: 2.0 },
];

const FONT_OPTIONS: { key: ReaderFontFamily; label: string }[] = [
  { key: 'serif',  label: 'Serif'   },
  { key: 'sans',   label: 'Sans'    },
  { key: 'lexend', label: 'Lexend'  },
];

const THEME_OPTIONS: { key: ReaderTheme; label: string; bg: string; dot: string; dotBorder?: string; textColor: string }[] = [
  { key: 'light', label: 'Light', bg: tokens.bgColors.canvas,     dot: tokens.colors.cream[200], dotBorder: tokens.colors.ink[200], textColor: tokens.textColors.secondary },
  { key: 'sepia', label: 'Sepia', bg: '#F3ECD9',                  dot: '#C4A882',                textColor: '#5C4A30'              },
  { key: 'dark',  label: 'Dark',  bg: tokens.colors.ink[900],     dot: tokens.colors.ink[700],   textColor: tokens.colors.cream[50] },
];

const FONT_SIZE_MIN = 16;
const FONT_SIZE_MAX = 28;
const THUMB_SIZE = 18;

function TypographySheet({
  preset,
  fontSize,
  fontFamily,
  theme,
  onPreset,
  onFontSize,
  onFontFamily,
  onTheme,
  onReset,
}: {
  preset: ReaderPreset;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  theme: ReaderTheme;
  onPreset: (p: ReaderPreset) => void;
  onFontSize: (n: number) => void;
  onFontFamily: (f: ReaderFontFamily) => void;
  onTheme: (t: ReaderTheme) => void;
  onReset: () => void;
}) {
  return (
    <View>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle}>Reading options</Text>
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={styles.sheetReset}>Reset</Text>
        </Pressable>
      </View>

      {/* Presets */}
      <Text style={styles.sheetSectionLabel}>Presets</Text>
      <View style={styles.presetsRow}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            onPress={() => onPreset(p.key)}
            style={[styles.presetCard, preset === p.key && styles.presetCardActive]}
          >
            <Text
              style={[
                styles.presetPreview,
                {
                  fontSize: p.previewSize,
                  lineHeight: p.previewSize * p.lineHeight,
                  fontFamily: p.key === 'max' ? FONT_MAP.lexend : FONT_MAP.serif,
                },
              ]}
            >
              Aa
            </Text>
            <Text style={[styles.presetLabel, preset === p.key && styles.presetLabelActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sheetDivider} />

      {/* Text size */}
      <Text style={styles.sheetSectionLabel}>Text size</Text>
      <SizeSlider
        value={fontSize}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={1}
        onChange={onFontSize}
      />

      <View style={styles.sheetDivider} />

      {/* Font */}
      <Text style={styles.sheetSectionLabel}>Font</Text>
      <View style={styles.fontOptions}>
        {FONT_OPTIONS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => onFontFamily(f.key)}
            style={[styles.fontOption, fontFamily === f.key && styles.fontOptionActive]}
          >
            <Text
              style={[
                styles.fontOptionText,
                { fontFamily: FONT_MAP[f.key] },
                fontFamily === f.key && styles.fontOptionTextActive,
              ]}
            >
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sheetDivider} />

      {/* Theme */}
      <Text style={styles.sheetSectionLabel}>Theme</Text>
      <View style={styles.themeOptions}>
        {THEME_OPTIONS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => onTheme(t.key)}
            style={[
              styles.themeOption,
              { backgroundColor: t.bg },
              theme === t.key && styles.themeOptionActive,
            ]}
          >
            <View
              style={[
                styles.themeDot,
                { backgroundColor: t.dot },
                t.dotBorder ? { borderWidth: 1, borderColor: t.dotBorder } : undefined,
              ]}
            />
            <Text style={[styles.themeOptionText, { color: t.textColor }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── Font size slider ─────────────────────────────────────────────────────────

function SizeSlider({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const fillRatio = (value - min) / (max - min);
  const thumbLeft = trackWidth > 0 ? fillRatio * trackWidth - THUMB_SIZE / 2 : 0;
  const fillWidth = trackWidth > 0 ? fillRatio * trackWidth : 0;

  const updateFromX = (x: number) => {
    if (!trackWidth) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    const raw = min + ratio * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(Math.max(min, Math.min(max, stepped)));
  };

  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderASmall}>A</Text>
      <View
        style={styles.sliderTrack}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => updateFromX(e.nativeEvent.locationX)}
        onResponderMove={(e: GestureResponderEvent) => updateFromX(e.nativeEvent.locationX)}
      >
        <View style={[styles.sliderFill, { width: fillWidth }]} />
        <View style={[styles.sliderThumb, { left: thumbLeft }]} />
      </View>
      <Text style={styles.sliderALarge}>A</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: tokens.space.xl,
    paddingBottom: tokens.space.xl,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: tokens.space.sm,
  },
  headerBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 1,
  },
  headerMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 2,
    flexShrink: 0,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radii.sm,
  },
  aaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
  },

  // Reading text
  chapterLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: tokens.space.md,
  },
  chapterTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 26,
    letterSpacing: -0.2,
    marginBottom: tokens.space.lg,
  },
  paragraph: {
    marginBottom: 18,
  },
  wordTapped: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 3,
    color: tokens.colors.ink[900],
  },
  dismissOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },

  // Progress zone
  progressZone: {
    paddingHorizontal: 22,
    paddingTop: tokens.space.sm,
    paddingBottom: 6,
    borderTopWidth: 0.5,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: tokens.space.xl,
    paddingHorizontal: tokens.space.lg,
    borderTopWidth: 0.5,
  },
  actionItem: {
    alignItems: 'center',
    gap: 5,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconPrimary: {
    backgroundColor: tokens.colors.forest[800],
  },
  actionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
  },

  // Translate popover
  popoverOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 148,
    paddingHorizontal: tokens.space.lg,
    zIndex: 20,
  },
  popover: {
    backgroundColor: tokens.colors.ink[900],
    borderRadius: tokens.radii['2xl'],
    padding: tokens.space.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
  },
  popoverWord: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.colors.cream[50],
    marginBottom: 2,
  },
  popoverPhonetic: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    fontStyle: 'italic',
    color: tokens.colors.ink[300],
    marginBottom: tokens.space.sm,
  },
  popoverDivider: {
    height: 0.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginBottom: tokens.space.sm,
  },
  popoverRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
    marginBottom: 6,
  },
  popoverLang: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    width: 28,
    paddingTop: 1,
    flexShrink: 0,
  },
  popoverDef: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[200],
    lineHeight: 18,
  },
  popoverTranslation: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.amber[200],
    lineHeight: 18,
  },
  popoverActions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
    marginTop: 10,
  },
  popoverBtnAudio: {
    width: 30,
    height: 30,
    borderRadius: tokens.radii.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  popoverBtnSave: {
    flex: 1,
    height: 30,
    borderRadius: tokens.radii.sm,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  popoverBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  popoverBtnDismiss: {
    height: 30,
    borderRadius: tokens.radii.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  popoverDismissText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[300],
  },

  // Typography sheet
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.md,
    paddingTop: tokens.space.xs,
  },
  sheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  sheetReset: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.accent,
  },
  sheetSectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: 10,
  },
  sheetDivider: {
    height: 0.5,
    backgroundColor: tokens.borderColors.subtle,
    marginVertical: tokens.space.md,
  },

  // Presets
  presetsRow: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  presetCard: {
    flex: 1,
    borderRadius: tokens.radii.lg,
    paddingVertical: 10,
    paddingHorizontal: tokens.space.sm,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    gap: 5,
    minHeight: 72,
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.canvas,
  },
  presetCardActive: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  presetPreview: {
    color: tokens.textColors.secondary,
  },
  presetLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
  presetLabelActive: {
    color: tokens.colors.forest[800],
  },

  // Slider
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sliderASmall: {
    fontFamily: 'Literata_400Regular',
    fontSize: 13,
    color: tokens.textColors.subtle,
    flexShrink: 0,
  },
  sliderALarge: {
    fontFamily: 'Literata_400Regular',
    fontSize: 20,
    color: tokens.textColors.secondary,
    flexShrink: 0,
  },
  sliderTrack: {
    flex: 1,
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    position: 'relative',
    justifyContent: 'center',
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  sliderThumb: {
    position: 'absolute',
    top: '50%',
    marginTop: -(THUMB_SIZE / 2),
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: tokens.colors.forest[800],
    borderWidth: 2,
    borderColor: tokens.bgColors.canvas,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },

  // Font options
  fontOptions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  fontOption: {
    flex: 1,
    height: 40,
    borderRadius: tokens.radii.md,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.canvas,
  },
  fontOptionActive: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[50],
  },
  fontOptionText: {
    fontSize: 13,
    color: tokens.textColors.secondary,
  },
  fontOptionTextActive: {
    color: tokens.colors.forest[800],
  },

  // Theme options
  themeOptions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  themeOption: {
    flex: 1,
    height: 40,
    borderRadius: tokens.radii.md,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.subtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  themeOptionActive: {
    borderColor: tokens.colors.forest[800],
  },
  themeOptionText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
  },
  themeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
