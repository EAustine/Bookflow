import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ActivityIndicator,
  FlatList,
  type FlatList as FlatListType,
  type GestureResponderEvent,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Switch,
  Text as RNText,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheet,
  ModeTogglePill,
  type BottomSheetRef,
  type ReaderMode,
  Icon,
  Text,
} from '~/components';
import { AIToolsSheet, SummaryScreen, ChatScreen } from '~/screens/AIToolsScreen';
import { ReaderSkeleton } from '~/screens/SkeletonScreens';
import { PracticeQuestionsScreen } from '~/screens/PracticeQuestionsScreen';
import { TranslateChapterScreen } from '~/screens/TranslateChapterScreen';
import { reprocessBook } from '~/lib/reprocessBook';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';
import type { Book } from '~/types/book';
import {
  persistReadingPosition,
  usePage,
  usePageList,
  type PageListItem,
  type PageRow,
} from '~/lib/useBookChapters';
import { lookupWord, type WordLookup } from '~/lib/dictionary';
import { supabase } from '~/lib/supabase';
import { useReadingSession } from '~/lib/readingSessions';
import { saveHighlight, usePageHighlights, type Highlight } from '~/lib/highlights';
import { HighlightsScreen } from '~/screens/HighlightsScreen';
import { BookSearchScreen } from '~/screens/BookSearchScreen';
import {
  TRANSLATION_LANGUAGE_LABELS,
  type ReaderFontFamily,
  type ReaderPreset,
  type ReaderTheme,
  useReaderStore,
} from '~/stores/readerStore';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import * as Speech from 'expo-speech';
import {
  translateSnippet,
  translateSnippetErrorMessage,
} from '~/lib/translateSnippet';

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
    primary: tokens.colors.forest[800],
    primaryIcon: tokens.colors.cream[50],
  },
  sepia: {
    // Warm parchment — pulled from tokens.colors.sepia.
    bg: tokens.colors.sepia.bg,
    surface: tokens.colors.sepia.surface,
    text: tokens.colors.sepia.text,
    muted: tokens.colors.sepia.muted,
    subtle: tokens.colors.sepia.subtle,
    border: tokens.colors.sepia.border,
    headerBg: tokens.colors.sepia.bg,
    actionBg: tokens.colors.sepia.bg,
    primary: tokens.colors.sepia.muted,
    primaryIcon: tokens.colors.sepia.bg,
  },
  dark: {
    // Forest-tinted near-black — pulled from tokens.colors.dark.
    bg: tokens.colors.dark.bg,
    surface: tokens.colors.dark.surface,
    text: tokens.colors.dark.text,
    muted: tokens.colors.dark.muted,
    subtle: tokens.colors.dark.subtle,
    border: tokens.colors.dark.border,
    headerBg: tokens.colors.dark.bg,
    actionBg: tokens.colors.dark.bg,
    primary: tokens.colors.dark.accent,
    primaryIcon: tokens.colors.dark.text,
  },
} as const;

// ─── Font families ────────────────────────────────────────────────────────────

const FONT_MAP: Record<ReaderFontFamily, string> = {
  serif: 'Literata_400Regular',
  sans: tokens.fonts.ui,
  lexend: 'Lexend_400Regular',
};

// ─── Per-page content derivation ─────────────────────────────────────────────

type DerivedChapter = {
  pageIndex: number;
  label: string;
  title: string;
  paragraphs: string[];
};

/**
 * Pure function: take a Supabase pages row and produce the rendered
 * `{ label, title, paragraphs }` shape the reader displays. Pulled out
 * of the screen body so the continuous-scroll renderer can map() over
 * every page in one pass without re-implementing the cleanup logic.
 *
 * The cleanup steps are unchanged from the previous single-page model:
 *   - Split on paragraph boundaries first (never collapsing them)
 *   - Per-paragraph: drop digit-only lines, collapse intra-line whitespace
 *   - Cap paragraph length at MAX_WORDS_PER_PARAGRAPH (220 words) to keep
 *     the per-paragraph nested Text-span count bounded — Android's text
 *     engine starts dropping frames around ~3000 spans in a single Text.
 */
function deriveChapter(dbPage: PageRow): DerivedChapter {
  const content = dbPage.content ?? '';
  const rawParagraphs = content
    .split(/\n{2,}/)
    .map((para) =>
      para
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !/^\d{1,4}$/.test(l))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  const MAX_WORDS_PER_PARAGRAPH = 220;
  const paragraphs: string[] = [];
  for (const p of rawParagraphs) {
    if (countWordsLocal(p) <= MAX_WORDS_PER_PARAGRAPH) {
      paragraphs.push(p);
      continue;
    }
    const sentences =
      p.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
        ?.map((s) => s.trim())
        .filter(Boolean) ?? [p];
    let buf: string[] = [];
    let bufWords = 0;
    for (const s of sentences) {
      const w = countWordsLocal(s);
      if (bufWords + w > MAX_WORDS_PER_PARAGRAPH && buf.length) {
        paragraphs.push(buf.join(' '));
        buf = [];
        bufWords = 0;
      }
      buf.push(s);
      bufWords += w;
    }
    if (buf.length) paragraphs.push(buf.join(' '));
  }

  const rawTitle = dbPage.title?.trim() ?? '';
  const num = dbPage.page_index + 1;
  let label: string;
  let title: string;
  if (/^front\s+matter$/i.test(rawTitle)) {
    label = 'Front matter';
    title = '';
  } else if (/^section\s+\d+/i.test(rawTitle)) {
    label = rawTitle;
    title = '';
  } else if (rawTitle) {
    label = `Chapter ${num}`;
    title = rawTitle;
  } else {
    // No title row — keep the page-divider above (`Page N of M`) as the
    // sole orientation cue. We deliberately don't synthesise "Chapter N"
    // headers per page now that pages are 200-word slices, not chapters
    // — that was misleading.
    label = '';
    title = '';
  }
  return {
    pageIndex: dbPage.page_index,
    label,
    title,
    paragraphs: paragraphs.length ? paragraphs : [content],
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type ReaderScreenProps = {
  book: Book;
  onBack: () => void;
  onListen?: () => void;
  /**
   * Override starting page index. Defaults to `book.last_read_page` for
   * the EPUB → text path. Used by `PdfReaderScreen` when it embeds this
   * component in "text mode" to start at the page that maps to the
   * user's current PDF page rather than whatever's persisted.
   */
  initialPageIndex?: number;
  /**
   * Called when the user taps the "Full" half of the mode toggle. The
   * library hosts the EPUB full-mode renderer (WebView with original
   * formatting / images / shapes); ReaderScreen just emits the request
   * and lets the parent swap to it. Omit on platforms where full mode
   * isn't applicable (the toggle is hidden in that case).
   */
  onRequestFullMode?: () => void;
};

/**
 * Flip to `true` to preview the reader text-loading skeleton.
 */
const MOCK_READER_LOADING = false;

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ReaderScreen({
  book,
  onBack,
  onListen,
  initialPageIndex,
  onRequestFullMode,
}: ReaderScreenProps) {
  // Hardware-back routes through the same callback the header chevron
  // uses so it lands the user back on Library (or whatever parent
  // owns this screen) instead of falling through to the root "Press
  // back again to exit" handler. AI tool / search / highlights
  // overlays inside the reader handle their own back via their own
  // `onClose` hooks above; this catches the top-level case.
  useBackHandler(() => {
    onBack();
    return true;
  });
  const insets = useSafeAreaInsets();
  const {
    preset, fontSize, fontFamily, theme, autoHide,
    setPreset, setFontSize, setFontFamily, setTheme, setAutoHide, reset,
  } = useReaderStore();

  // Reading position. Use the explicit override when provided (PDF text-
  // mode passes the chapter that corresponds to the user's current PDF
  // page), otherwise fall back to whatever Supabase persisted.
  const [pageIndex, setPageIndex] = useState<number>(
    Math.max(
      0,
      initialPageIndex ??
        (book as { last_read_page?: number }).last_read_page ??
        0,
    ),
  );
  // Continuous-scroll model with lazy section fetch.
  //
  // Old model fetched every page (including full content + html_content)
  // up-front via `useAllPagesContent`. For a 200-page book that's 200
  // rows × ~5KB ≈ 1MB of JSON, plus rendering 200 sections worth of
  // tappable-word spans on first commit. Android effectively never
  // committed the new tree → user stuck on skeleton.
  //
  // New model: pull only the lightweight page list (id, index, title,
  // word_count) — typically a few KB even for huge books — and let
  // FlatList virtualise the section list. Each visible section
  // lazily fetches its own row via `usePage`, so we only have ~3-5
  // pages of content in memory at any time.
  const {
    pages: pageList,
    loading: pageListLoading,
  } = usePageList(book.id);
  const notFound = !pageListLoading && pageList.length === 0;
  // The current "active" page row, used by AI-tools / highlights /
  // reading-session bookkeeping. Lazily fetched (single-row query) for
  // whatever the user is currently looking at; no impact on the FlatList.
  const { data: dbPage } = usePage(book.id, pageIndex);

  const [tappedWord, setTappedWord] = useState<string | null>(null);
  const [selectedSentence, setSelectedSentence] = useState<string | null>(null);
  const [aiMode, setAIMode] = useState<'summary' | 'chat' | 'practice' | 'translate' | null>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const typoSheetRef = useRef<BottomSheetRef>(null);
  // Chapter / page sheet was removed from the chrome — pages are
  // navigated by swipe and the page counter at top right; per the
  // chapters→pages refactor, chapters no longer have a list UI.
  const aiSheetRef = useRef<BottomSheetRef>(null);
  const sentenceSheetRef = useRef<BottomSheetModal>(null);

  // Auto-hide chrome. State, not ref: pointerEvents below reads
  // chromeVisible at render time; a ref would let it go stale after
  // an unrelated re-render captured the post-auto-hide value, which
  // then silently locked out the back button.
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showChrome = useCallback(() => {
    setChromeVisible(true);
    Animated.timing(chromeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (autoHide) {
      hideTimer.current = setTimeout(() => {
        setChromeVisible(false);
        Animated.timing(chromeOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
      }, 3000);
    }
  }, [autoHide, chromeOpacity]);

  useEffect(() => {
    if (!autoHide) {
      setChromeVisible(true);
      Animated.timing(chromeOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      showChrome();
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [autoHide, chromeOpacity, showChrome]);

  const palette = THEME[theme];
  const readingFont = FONT_MAP[fontFamily];

  // FlatList ref for programmatic scroll (search hit, highlight tap,
  // initial last-read jump). Typed loosely because the data shape is
  // local; we never read items from the ref, only call scrollToIndex.
  const listRef = useRef<FlatListType<PageListItem> | null>(null);

  // Within-page progress is no longer trivially derivable now that
  // each section lazy-loads. We approximate it from the FlatList's
  // viewable items: when the active section is fully visible at the
  // top, fraction is 0; as it scrolls off the top, fraction climbs
  // toward 1. Good enough to drive the "minutes left" hint and the
  // persisted resume position.
  const progressFractionRef = useRef(0);
  const getProgressFraction = useCallback(
    () => progressFractionRef.current,
    [],
  );

  // Open a reading-session row at mount / on chapter change; close it on
  // unmount / next change. Best-effort — failures are logged but never
  // surface to the user. Drives the future "Recently read" + streaks UI.
  useReadingSession({
    bookId: book.id,
    pageIndex,
    pageId: dbPage?.id ?? null,
    pageWordCount: dbPage?.word_count ?? null,
    getProgress: () => progressFractionRef.current,
  });

  // Saved highlights for the current chapter. The Set views (`savedWords`,
  // `savedSentences`) are O(1)-checked inside `TappableParagraph` so we
  // can decorate matches without a per-render scan.
  const {
    savedWords,
    savedSentences,
    addOptimistic: addHighlightOptimistic,
  } = usePageHighlights(book.id, pageIndex);

  const handleSaveWord = useCallback(
    async (rawWord: string) => {
      const cleaned = rawWord.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
      if (cleaned.length <= 1) return;
      const optimistic: Highlight = {
        id: `optimistic-${Date.now()}`,
        bookId: book.id,
        pageId: dbPage?.id ?? null,
        pageIndex,
        kind: 'word',
        text: cleaned,
        note: null,
        color: 'yellow',
        createdAt: new Date(),
      };
      addHighlightOptimistic(optimistic);
      await saveHighlight({
        bookId: book.id,
        pageId: dbPage?.id ?? null,
        pageIndex,
        kind: 'word',
        text: cleaned,
      });
    },
    [book.id, pageIndex, dbPage?.id, addHighlightOptimistic],
  );

  const handleSaveSentence = useCallback(
    async (sentence: string) => {
      const trimmed = sentence.trim();
      if (!trimmed) return;
      const optimistic: Highlight = {
        id: `optimistic-${Date.now()}`,
        bookId: book.id,
        pageId: dbPage?.id ?? null,
        pageIndex,
        kind: 'sentence',
        text: trimmed,
        note: null,
        color: 'yellow',
        createdAt: new Date(),
      };
      addHighlightOptimistic(optimistic);
      await saveHighlight({
        bookId: book.id,
        pageId: dbPage?.id ?? null,
        pageIndex,
        kind: 'sentence',
        text: trimmed,
      });
    },
    [book.id, pageIndex, dbPage?.id, addHighlightOptimistic],
  );

  // External jump (search hit, highlight tap, page picker). Updates
  // pageIndex and asks FlatList to scroll the matching section into
  // view. `scrollToIndex` may fail if the target is outside the
  // virtualisation window — `onScrollToIndexFailed` below catches
  // that and retries after a short delay.
  const jumpToPage = useCallback((idx: number) => {
    setPageIndex(idx);
    listRef.current?.scrollToIndex({ index: idx, animated: true });
  }, []);

  // Persist the page-change immediately so reopening lands on the
  // right page even if the user closes the reader before scrolling
  // mid-page. The throttled within-page persistence below covers
  // scroll-position updates.
  useEffect(() => {
    void persistReadingPosition({ bookId: book.id, pageIndex, position: 0 });
  }, [book.id, pageIndex]);

  // Throttled within-page scroll persistence. Updates `last_read_position`
  // (0..1 fraction through the visible page) every 1.5s of idle scroll.
  // Keyed off the position ref + a tick state so we re-run on actual
  // movement, not every render.
  const [scrollTick, setScrollTick] = useState(0);
  useEffect(() => {
    if (scrollTick === 0) return;
    const id = setTimeout(() => {
      void persistReadingPosition({
        bookId: book.id,
        pageIndex,
        position: getProgressFraction(),
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [book.id, pageIndex, scrollTick, getProgressFraction]);

  // Composite progress percent: pageIndex + within-page-scroll-fraction
  // over the book's total pages. Denominator falls back to 1 to avoid
  // divide-by-zero on a freshly-uploaded book whose total_pages hasn't
  // been written yet.
  const totalBookPages = book.totalPages > 0 ? book.totalPages : 1;
  const livePercent = Math.max(
    0,
    Math.min(
      100,
      Math.round(((pageIndex + getProgressFraction()) / totalBookPages) * 100),
    ),
  );
  const livePage = Math.max(1, Math.min(totalBookPages, pageIndex + 1));

  // Word count of the currently-visible page (single page now, not
  // chapter-wide). Used by anything reading "how big is this page" —
  // mostly the reading-session payload.
  const wordCount = dbPage?.word_count ?? 0;
  const minsLeft = Math.max(1, Math.round(wordCount / 238));

  const handleWordPress = useCallback((word: string) => {
    const cleaned = word.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
    if (cleaned.length <= 1) return;
    setTappedWord((prev) => (prev === cleaned ? null : cleaned));
  }, []);

  const handleSentenceLongPress = useCallback((sentence: string) => {
    setSelectedSentence(sentence);
    sentenceSheetRef.current?.present();
  }, []);

  const dismissPopover = useCallback(() => setTappedWord(null), []);

  // Reprocess flow — surfaces on the "No text available" empty
  // state so users whose book failed earlier (scanned PDF before
  // OCR shipped, etc) can retry without re-uploading. The state
  // lives at the component root rather than inside the conditional
  // branch so the hooks count stays stable across renders.
  const [reprocessing, setReprocessing] = useState(false);
  const handleReprocess = useCallback(async () => {
    if (reprocessing) return;
    setReprocessing(true);
    try {
      await reprocessBook(book.id);
      // The books-table realtime tick will refire useAllPagesContent
      // / usePageList; the reader will re-render out of `notFound`
      // when processing finishes. Close back so the user sees their
      // library row flip to "Processing…" → "Ready".
      onBack();
    } catch (err) {
      Alert.alert(
        "Couldn't restart processing",
        err instanceof Error ? err.message : 'Please try again in a moment.',
      );
    } finally {
      setReprocessing(false);
    }
  }, [book.id, onBack, reprocessing]);

  // Viewability config for FlatList — decide which section is "current"
  // based on which item has > 50% of its area visible. Stable refs so
  // FlatList doesn't error on prop change.
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  }).current;
  const onViewableItemsChanged = useRef(
    (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (info.viewableItems.length === 0) return;
      // Pick the topmost viewable item as the "current" page — this is
      // the one whose content the user is actively reading.
      const top = info.viewableItems.reduce((acc, vi) => {
        if (acc === null) return vi;
        const accIdx = acc.index ?? Number.POSITIVE_INFINITY;
        const viIdx = vi.index ?? Number.POSITIVE_INFINITY;
        return viIdx < accIdx ? vi : acc;
      }, null as ViewToken | null);
      const item = top?.item as PageListItem | undefined;
      if (item) setPageIndexFromScroll(item.page_index);
    },
  );
  // Stable setter — FlatList's onViewableItemsChanged callback is
  // fixed at first render (changing it throws), so we route the
  // pageIndex update through a ref-stable function.
  //
  // The ref update lives in a useEffect rather than at render time
  // (the previous render-time write triggers React's "side effect
  // in render" lint and breaks under concurrent rendering, which
  // may run components twice without committing).
  const setPageIndexFromScrollRef = useRef<(idx: number) => void>(() => {});
  useEffect(() => {
    setPageIndexFromScrollRef.current = (idx: number) => {
      if (idx !== pageIndex) setPageIndex(idx);
    };
  }, [pageIndex]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setPageIndexFromScroll = (idx: number) =>
    setPageIndexFromScrollRef.current(idx);

  if (MOCK_READER_LOADING) {
    return <ReaderSkeleton onBack={onBack} />;
  }

  // Show the skeleton while a real (uuid) book's chapter content is in
  // flight. Mock books skip the fetch entirely (notFound fires synchronously
  // via the hook), so they fall through to the fallback content.
  if (pageListLoading && !notFound) {
    return <ReaderSkeleton onBack={onBack} />;
  }

  // Real book but no extracted pages — usually a PDF where text
  // extraction failed (scanned image PDF, encrypted, etc) or an EPUB
  // whose processing didn't complete. We don't want to render a blank
  // canvas, so explain the situation and (for PDFs) point the user
  // back at Full mode where the original layout still works.
  if (notFound) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: palette.bg }]}
        edges={['top', 'left', 'right', 'bottom']}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Icon name="ArrowLeft" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.headerTitleLeft}>
            <Text
              style={[styles.headerBookTitle, { color: palette.text }]}
              numberOfLines={1}
            >
              {book.title}
            </Text>
          </View>
        </View>
        <View style={styles.notFoundWrap}>
          <Icon
            name="FileText"
            size={36}
            color={palette.subtle}
            strokeWidth={1.5}
          />
          <Text style={[styles.notFoundTitle, { color: palette.text }]}>
            No text available
          </Text>
          <Text style={[styles.notFoundBody, { color: palette.muted }]}>
            We couldn{`’`}t extract readable text from this book — the
            file is likely a scanned image or its processing didn{`’`}t
            finish. You can retry now — scanned PDFs use OCR on this
            pass{onRequestFullMode
              ? ', or switch to Full mode to read the original layout.'
              : '.'}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry processing"
            onPress={() => void handleReprocess()}
            disabled={reprocessing}
            style={({ pressed }) => [
              styles.notFoundCta,
              { backgroundColor: palette.primary },
              (pressed || reprocessing) && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.notFoundCtaLabel, { color: palette.primaryIcon }]}>
              {reprocessing ? 'Restarting…' : 'Retry processing'}
            </Text>
          </Pressable>
          {onRequestFullMode && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Switch to full mode"
              onPress={onRequestFullMode}
              style={({ pressed }) => [
                styles.notFoundSecondaryCta,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.notFoundSecondaryLabel, { color: palette.muted }]}>
                Switch to Full mode
              </Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  if (aiMode === 'summary') {
    return (
      <SummaryScreen
        book={book}
        pageIndex={pageIndex}
        onBack={() => setAIMode(null)}
      />
    );
  }
  if (aiMode === 'chat') {
    return <ChatScreen book={book} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'practice') {
    return (
      <PracticeQuestionsScreen
        book={book}
        pageIndex={pageIndex}
        onBack={() => setAIMode(null)}
      />
    );
  }
  if (aiMode === 'translate') {
    return (
      <TranslateChapterScreen
        book={book}
        pageIndex={pageIndex}
        onBack={() => setAIMode(null)}
      />
    );
  }
  if (showHighlights) {
    return (
      <HighlightsScreen
        book={book}
        onClose={() => setShowHighlights(false)}
        onJumpToPage={(idx) => {
          jumpToPage(idx);
          setShowHighlights(false);
        }}
      />
    );
  }
  if (showSearch) {
    return (
      <BookSearchScreen
        book={book}
        onClose={() => setShowSearch(false)}
        onJumpToPage={(idx) => {
          jumpToPage(idx);
          setShowSearch(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.bg }]}
      edges={['left', 'right']}
    >
      {/* Header — fades with auto-hide. paddingTop is the system status
          bar inset; without it the back button collides with the iPhone
          notch/Dynamic Island. We use useSafeAreaInsets directly rather
          than relying on SafeAreaView's edges prop because it composes
          predictably with the action-bar bottom inset and works with
          absolute-positioned chrome elsewhere in the file. */}
      <Animated.View
        style={[{ opacity: chromeOpacity, paddingTop: insets.top }]}
      >
        <ReaderHeader
          book={book}
          palette={palette}
          theme={theme}
          mode="text"
          onBack={onBack}
          onModeChange={(m) => {
            // Already in text mode; the only useful change is to "full".
            // We delegate to the parent (LibraryScreen) which knows how
            // to swap to the EPUB-full WebView renderer. If no handler
            // is wired (e.g. embedded as text-mode-of-PDF), we no-op so
            // the user doesn't get a dead button.
            if (m === 'full' && onRequestFullMode) onRequestFullMode();
          }}
          pointerEvents={autoHide && !chromeVisible ? 'none' : 'auto'}
        />
      </Animated.View>

      {/* Virtualised continuous-scroll reading area. FlatList renders
          only ~3-5 sections at a time and lazy-fetches each page's
          content when it enters the window — keeps memory bounded
          even on 500-page books. Visual page-break dividers separate
          sections so the user still feels page boundaries. */}
      <View style={styles.pagerWrap}>
        <FlatList<PageListItem>
          ref={listRef}
          data={pageList}
          keyExtractor={(item) => String(item.page_index)}
          renderItem={({ item, index }) => (
            <PageSection
              bookId={book.id}
              pageIndex={item.page_index}
              isFirst={index === 0}
              totalBookPages={totalBookPages}
              palette={palette}
              readingFont={readingFont}
              fontSize={fontSize}
              tappedWord={tappedWord}
              selectedSentence={selectedSentence}
              onWordPress={handleWordPress}
              onSentenceLongPress={handleSentenceLongPress}
            />
          )}
          // Virtualisation tuning: render 5 sections initially (was 3)
          // so the initial-scroll target and its immediate neighbours
          // are mounted on the first frame. Expand by 2 per batch as
          // user scrolls. Window of 5 keeps ~5 viewports' worth in
          // DOM at any time.
          initialNumToRender={5}
          maxToRenderPerBatch={2}
          windowSize={5}
          // removeClippedSubviews was true. On Android, that flag has
          // a long-standing bug where the bounding-box calculation
          // during the initial mount + initialScrollIndex layout pass
          // marks a visible section as clipped and unmounts its text.
          // The user then had to TAP the screen — any touch event
          // forces a re-measure, after which the text appears. The
          // memory savings aren't worth the broken first-paint for a
          // paginated reader of a few hundred pages, so we disable
          // the optimisation entirely.
          removeClippedSubviews={false}
          // Start at the user's last-read page. Without getItemLayout,
          // FlatList will still mount items 0..N to reach the index but
          // it won't try to render them all on the same frame —
          // dramatically faster than the previous all-at-once approach.
          initialScrollIndex={Math.min(pageIndex, Math.max(0, pageList.length - 1))}
          onScrollToIndexFailed={(info) => {
            // Mounted items list shorter than target — wait a frame
            // and retry. Triggers when initialScrollIndex points
            // past whatever's been mounted so far.
            setTimeout(() => {
              listRef.current?.scrollToIndex({
                index: Math.min(info.index, info.highestMeasuredFrameIndex),
                animated: false,
              });
            }, 100);
          }}
          // Track which section is currently most-visible to keep
          // pageIndex (and progress bar / page label) in sync with
          // where the user actually is.
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig}
          showsVerticalScrollIndicator={false}
          onTouchStart={showChrome}
          onScrollBeginDrag={dismissPopover}
          contentContainerStyle={styles.pagerContent}
          // Tap-driven scroll progress — FlatList exposes
          // contentOffset via onScroll like ScrollView. We use it to
          // bump scrollTick + estimate progress fraction.
          scrollEventThrottle={120}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const { contentOffset, contentSize, layoutMeasurement } =
              e.nativeEvent;
            const scrollable = Math.max(
              1,
              contentSize.height - layoutMeasurement.height,
            );
            progressFractionRef.current = Math.max(
              0,
              Math.min(1, contentOffset.y / scrollable),
            );
            setScrollTick((t) => t + 1);
          }}
        />
      </View>

      {/* Progress bar — always visible, even when chrome is hidden. Driven
          by the live composite progress (chapter + scroll fraction) so it
          tracks where the user actually is, not where they were when the
          book row was last read from the DB. */}
      <View style={[styles.progressZone, { borderTopColor: palette.border, backgroundColor: palette.actionBg }]}>
        <View style={[styles.progressTrack, { backgroundColor: palette.surface }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${livePercent}%`, backgroundColor: palette.primary },
            ]}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={[styles.progressText, { color: palette.subtle }]}>
            Page {livePage} of {totalBookPages}
          </Text>
          <Text style={[styles.progressText, { color: palette.subtle }]}>
            ~{Math.max(1, Math.round(minsLeft * Math.max(0, 1 - getProgressFraction())))} min left
          </Text>
        </View>
      </View>

      {/* Action bar — fades with auto-hide. paddingBottom respects the
          home-indicator inset so the icons don't sit under it on
          iPhones with Face ID. */}
      <Animated.View
        style={[
          { opacity: chromeOpacity, paddingBottom: insets.bottom },
          { backgroundColor: palette.actionBg },
        ]}
      >
        <ActionBar
          palette={palette}
          onListen={onListen}
          onAITools={() => aiSheetRef.current?.present()}
          onReadingOptions={() => typoSheetRef.current?.present()}
          onHighlights={() => setShowHighlights(true)}
          onSearch={() => setShowSearch(true)}
          pointerEvents={autoHide && !chromeVisible ? 'none' : 'auto'}
        />
      </Animated.View>

      {/* "Tap to show controls" hint when chrome is hidden */}
      {autoHide && (
        <TapHint opacity={chromeOpacity} onPress={showChrome} />
      )}

      {/* Dismiss overlay + word translate popover */}
      {tappedWord && (
        <>
          <Pressable
            style={styles.dismissOverlay}
            onPress={dismissPopover}
            accessibilityLabel="Dismiss"
          />
          <TranslatePopover
            word={tappedWord}
            saved={savedWords.has(tappedWord)}
            onSave={() => handleSaveWord(tappedWord)}
            onDismiss={dismissPopover}
          />
        </>
      )}

      {/* AI tools sheet */}
      <AIToolsSheet
        ref={aiSheetRef}
        book={book}
        pageIndex={pageIndex}
        onSummarize={() => setAIMode('summary')}
        onPractice={() => setAIMode('practice')}
        onAsk={() => setAIMode('chat')}
        onTranslate={() => setAIMode('translate')}
      />

      {/* Typography sheet */}
      <BottomSheet ref={typoSheetRef}>
        <TypographySheet
          preset={preset}
          fontSize={fontSize}
          fontFamily={fontFamily}
          theme={theme}
          autoHide={autoHide}
          onPreset={setPreset}
          onFontSize={setFontSize}
          onFontFamily={setFontFamily}
          onTheme={setTheme}
          onAutoHide={setAutoHide}
          onReset={reset}
        />
      </BottomSheet>

      {/* Sentence translate sheet */}
      <SentenceTranslateSheet
        ref={sentenceSheetRef}
        sentence={selectedSentence ?? ''}
        saved={selectedSentence ? savedSentences.has(selectedSentence.trim()) : false}
        onSave={() => {
          if (selectedSentence) void handleSaveSentence(selectedSentence);
        }}
        onDismiss={() => { setSelectedSentence(null); sentenceSheetRef.current?.dismiss(); }}
      />
    </SafeAreaView>
  );
}

// ─── Reader header ────────────────────────────────────────────────────────────

function ReaderHeader({
  book,
  palette,
  theme,
  mode,
  onBack,
  onModeChange,
  pointerEvents,
}: {
  book: Book;
  palette: (typeof THEME)[ReaderTheme];
  theme: ReaderTheme;
  mode: ReaderMode;
  onBack: () => void;
  onModeChange: (mode: ReaderMode) => void;
  pointerEvents?: 'none' | 'auto';
}) {
  // Title sits to the left next to the back button. Search lives in
  // the bottom ActionBar to keep the top chrome calm — just back,
  // title, and the Full/Text mode pill.
  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: palette.border, backgroundColor: palette.headerBg },
      ]}
      pointerEvents={pointerEvents}
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

      <View style={styles.headerTitleLeft}>
        <Text
          style={[styles.headerBookTitle, { color: palette.text }]}
          numberOfLines={1}
        >
          {book.title}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <ModeTogglePill
          mode={mode}
          onChange={onModeChange}
          // Dark reader theme → dark pill variant so the capsule
          // nests into the chrome instead of glaring as a bright tag.
          variant={theme === 'dark' ? 'dark' : 'light'}
        />
      </View>
    </View>
  );
}

// ─── Inline images ────────────────────────────────────────────────────────────

const IMAGE_MARKER_RE = /^\s*\[\[BOOKFLOW_IMG:([^\]]+)\]\]\s*$/;

/**
 * Detect a paragraph that's actually an image marker. The Edge Function
 * emits `[[BOOKFLOW_IMG:<storage_path>]]` between text paragraphs for
 * each `<img>` it found in the EPUB; the reader splits on blank lines so
 * the marker shows up as a standalone paragraph entry.
 */
function parseImageMarker(paragraph: string): string | null {
  const m = paragraph.match(IMAGE_MARKER_RE);
  return m ? m[1] : null;
}

const imageSignedUrlCache = new Map<string, { url: string; signedAt: number }>();
const IMAGE_SIGNED_URL_TTL_MS = 60 * 60 * 1000;
const IMAGE_SIGNED_URL_REFRESH_MS = 50 * 60 * 1000;
// Cap to stop the Map from growing without bound across a long
// session of reading multiple books with hundreds of inline images
// each. Insertion order is the LRU; the oldest entry is evicted
// when we cross the cap. 1000 entries covers a heavy reader and
// caps memory at a few hundred KB of strings.
const IMAGE_SIGNED_URL_MAX_ENTRIES = 1000;

function rememberImageSignedUrl(path: string, url: string): void {
  if (imageSignedUrlCache.has(path)) imageSignedUrlCache.delete(path);
  imageSignedUrlCache.set(path, { url, signedAt: Date.now() });
  if (imageSignedUrlCache.size > IMAGE_SIGNED_URL_MAX_ENTRIES) {
    const oldest = imageSignedUrlCache.keys().next().value;
    if (oldest !== undefined) imageSignedUrlCache.delete(oldest);
  }
}

/**
 * Drop every cached inline-image signed URL. Exported so the
 * app-level sign-out flow can purge the previous user's URLs from
 * memory before another user signs in on the same device session.
 */
export function clearReaderImageSignedUrlCache(): void {
  imageSignedUrlCache.clear();
}

async function resolveBookImageUrl(path: string): Promise<string | null> {
  const cached = imageSignedUrlCache.get(path);
  if (cached && Date.now() - cached.signedAt < IMAGE_SIGNED_URL_REFRESH_MS) {
    // Touch — move to the end of LRU order so frequently-accessed
    // images don't get evicted by less-used neighbours.
    imageSignedUrlCache.delete(path);
    imageSignedUrlCache.set(path, cached);
    return cached.url;
  }
  const { data, error } = await supabase.storage
    .from('books')
    .createSignedUrl(path, IMAGE_SIGNED_URL_TTL_MS / 1000);
  if (error || !data?.signedUrl) return null;
  rememberImageSignedUrl(path, data.signedUrl);
  return data.signedUrl;
}

/**
 * Renders an inline image referenced from chapter content. Uses a signed
 * URL on the private `books` bucket (cached per session). Width is the
 * full reader column; height adapts via `aspectRatio` measured from the
 * loaded image's natural dimensions, falling back to a 4:3 placeholder
 * while the URL resolves so the layout doesn't jump on load.
 */
function ChapterImage({ storagePath }: { storagePath: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number>(4 / 3);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void resolveBookImageUrl(storagePath).then((u) => {
      if (cancelled) return;
      if (!u) {
        setFailed(true);
        return;
      }
      setUrl(u);
      Image.getSize(
        u,
        (w, h) => {
          if (!cancelled && w > 0 && h > 0) setAspect(w / h);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  if (failed) return null;

  return (
    <View style={chapterImageStyles.wrap}>
      {url ? (
        <Image
          source={{ uri: url }}
          style={[chapterImageStyles.image, { aspectRatio: aspect }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[chapterImageStyles.placeholder, { aspectRatio: aspect }]} />
      )}
    </View>
  );
}

const chapterImageStyles = StyleSheet.create({
  wrap: {
    marginVertical: 18,
    alignItems: 'center',
  },
  image: {
    width: '100%',
    borderRadius: 6,
  },
  placeholder: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 6,
  },
});

// ─── Tappable text ────────────────────────────────────────────────────────────

// ─── Page section (FlatList row) ─────────────────────────────────────────────

type PageSectionProps = {
  bookId: string;
  pageIndex: number;
  isFirst: boolean;
  totalBookPages: number;
  palette: (typeof THEME)[ReaderTheme];
  readingFont: string;
  fontSize: number;
  tappedWord: string | null;
  selectedSentence: string | null;
  onWordPress: (word: string) => void;
  onSentenceLongPress: (sentence: string) => void;
};

/**
 * One page of the book in the FlatList. Lazy-fetches its own row via
 * `usePage` — rendering happens once content lands, before that we
 * show a per-section skeleton so the list keeps a sensible vertical
 * rhythm while content streams in.
 *
 * Highlights are also fetched per-section: each `<PageSection>` reads
 * its own saved-words/sentences set from `usePageHighlights`. Cheap
 * because the hook caches per (bookId, pageIndex) and the FlatList
 * only mounts ~5 sections at a time.
 *
 * Memoised so the FlatList recycler can skip re-rendering off-screen
 * sections when ancestor state (auto-hide chrome, scroll tick, etc)
 * changes.
 */
const PageSection = function PageSection({
  bookId,
  pageIndex,
  isFirst,
  totalBookPages,
  palette,
  readingFont,
  fontSize,
  tappedWord,
  selectedSentence,
  onWordPress,
  onSentenceLongPress,
}: PageSectionProps) {
  const { data: dbPage, loading } = usePage(bookId, pageIndex);
  const { savedWords, savedSentences } = usePageHighlights(bookId, pageIndex);

  const ch = useMemo(() => (dbPage ? deriveChapter(dbPage) : null), [dbPage]);

  return (
    <View style={styles.page}>
      {!isFirst && (
        <View style={styles.pageBreak}>
          <View
            style={[styles.pageBreakLine, { backgroundColor: palette.border }]}
          />
          <Text style={[styles.pageBreakLabel, { color: palette.subtle }]}>
            Page {pageIndex + 1} of {totalBookPages}
          </Text>
          <View
            style={[styles.pageBreakLine, { backgroundColor: palette.border }]}
          />
        </View>
      )}
      {loading || !ch ? (
        <View style={styles.pageLoadingWrap}>
          <ActivityIndicator
            size="small"
            color={palette.subtle}
            style={{ opacity: 0.7 }}
          />
        </View>
      ) : (
        <>
          {(ch.label || ch.title) && (
            <View style={styles.pageHeader}>
              {ch.label ? (
                <Text style={[styles.chapterLabel, { color: palette.subtle }]}>
                  {ch.label}
                </Text>
              ) : null}
              {ch.title ? (
                <Text style={[styles.chapterTitle, { color: palette.text }]}>
                  {ch.title}
                </Text>
              ) : null}
            </View>
          )}
          {ch.paragraphs.map((para, i) => {
            const imgPath = parseImageMarker(para);
            if (imgPath) {
              return <ChapterImage key={i} storagePath={imgPath} />;
            }
            return (
              <TappableParagraph
                key={i}
                text={para}
                tappedWord={tappedWord}
                selectedSentence={selectedSentence}
                savedWords={savedWords}
                savedSentences={savedSentences}
                onWordPress={onWordPress}
                onSentenceLongPress={onSentenceLongPress}
                style={{ fontFamily: readingFont, fontSize, color: palette.text }}
              />
            );
          })}
        </>
      )}
    </View>
  );
};

function TappableParagraph({
  text,
  tappedWord,
  selectedSentence,
  savedWords,
  savedSentences,
  onWordPress,
  onSentenceLongPress,
  style,
}: {
  text: string;
  tappedWord: string | null;
  selectedSentence: string | null;
  savedWords: Set<string>;
  savedSentences: Set<string>;
  onWordPress: (word: string) => void;
  onSentenceLongPress: (sentence: string) => void;
  style: { fontFamily: string; fontSize: number; color: string };
}) {
  const tl = tappedWord?.toLowerCase() ?? '';

  // Split paragraph into sentences for long-press detection
  const sentences = useMemo(() => {
    const raw = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
    return raw.map((s) => s.trim()).filter(Boolean);
  }, [text]);

  return (
    <RNText
      style={[
        styles.paragraph,
        { fontFamily: style.fontFamily, fontSize: style.fontSize, lineHeight: style.fontSize * 1.78, color: style.color },
      ]}
    >
      {sentences.map((sentence, si) => {
        const isSelected = selectedSentence === sentence;
        const isSaved = savedSentences.has(sentence);
        const sentenceStyle = isSelected
          ? styles.sentenceHighlight
          : isSaved
          ? styles.sentenceSaved
          : undefined;
        const words = sentence.split(/(\s+)/);
        return (
          <RNText
            key={si}
            onLongPress={() => onSentenceLongPress(sentence)}
            style={sentenceStyle}
          >
            {words.map((token, wi) => {
              if (/^\s+$/.test(token)) return token;
              const clean = token.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
              const isTapped = clean.length > 1 && clean === tl;
              const isSavedWord = clean.length > 1 && savedWords.has(clean);
              const wordStyle = isTapped
                ? styles.wordTapped
                : isSavedWord
                ? styles.wordSaved
                : undefined;
              return (
                <RNText
                  key={wi}
                  onPress={() => onWordPress(token)}
                  style={wordStyle}
                >
                  {token}
                </RNText>
              );
            })}
            {si < sentences.length - 1 ? ' ' : ''}
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
  onReadingOptions,
  onHighlights,
  onSearch,
  pointerEvents,
}: {
  palette: (typeof THEME)[ReaderTheme];
  onListen?: () => void;
  onAITools?: () => void;
  onReadingOptions?: () => void;
  onHighlights?: () => void;
  onSearch?: () => void;
  pointerEvents?: 'none' | 'auto';
}) {
  // Five actions across the bottom: Listen / AI tools / Search /
  // Highlights / Reading options. Search joined this row so the top
  // chrome stays minimal (back + title + mode pill); it's a frequent
  // enough action to live alongside Listen.
  const ACTIONS = [
    { icon: 'Headphones' as const, label: 'Listen',          primary: true,  onPress: onListen },
    { icon: 'Wand' as const,       label: 'AI tools',        primary: false, onPress: onAITools },
    { icon: 'Search' as const,     label: 'Search',          primary: false, onPress: onSearch },
    { icon: 'Notebook' as const,   label: 'Highlights',      primary: false, onPress: onHighlights },
    { icon: 'Settings' as const,   label: 'Reading options', primary: false, onPress: onReadingOptions },
  ];

  return (
    <View
      style={[styles.actionBar, { borderTopColor: palette.border, backgroundColor: palette.actionBg }]}
      pointerEvents={pointerEvents}
    >
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
              { backgroundColor: primary ? palette.primary : palette.surface },
            ]}
          >
            <Icon
              name={icon}
              size={18}
              color={primary ? palette.primaryIcon : palette.text}
            />
          </View>
          <Text style={[styles.actionLabel, { color: palette.muted }]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ─── Tap hint (auto-hide) ─────────────────────────────────────────────────────

function TapHint({
  opacity,
  onPress,
}: {
  opacity: Animated.Value;
  onPress: () => void;
}) {
  // Invert: hint appears when chrome is hidden
  const hintOpacity = opacity.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.tapHint, { opacity: hintOpacity }]} pointerEvents="none">
      <Pressable onPress={onPress} style={styles.tapHintInner}>
        <Text style={styles.tapHintText}>Tap to show controls</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Sentence translate sheet ─────────────────────────────────────────────────

const SentenceTranslateSheet = forwardRef<BottomSheetModal, {
  sentence: string;
  saved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}>(function SentenceTranslateSheet({ sentence, saved, onSave, onDismiss }, ref) {
  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
        onPress={onDismiss}
      />
    ),
    [onDismiss],
  );

  // Real translation. We call `translate-snippet` whenever the
  // sentence changes; cancellation via a stale-key check stops a
  // late response from overwriting the current sentence's result
  // when the user long-presses two different sentences quickly.
  const targetLanguage = useReaderStore((s) => s.translationLanguage);
  const targetLabel = TRANSLATION_LANGUAGE_LABELS[targetLanguage] ?? targetLanguage;
  const targetBadge = targetLanguage.toUpperCase();
  const [translation, setTranslation] = useState<string | null>(null);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  useEffect(() => {
    const trimmed = sentence.trim();
    if (!trimmed) {
      setTranslation(null);
      setTranslateError(null);
      setTranslateLoading(false);
      return;
    }
    // English → English is a no-op; just echo the source rather than
    // burning an API call asking Claude to "translate to English".
    if (targetLanguage === 'en') {
      setTranslation(trimmed);
      setTranslateError(null);
      setTranslateLoading(false);
      return;
    }
    let cancelled = false;
    setTranslation(null);
    setTranslateError(null);
    setTranslateLoading(true);
    void translateSnippet({ text: trimmed, targetLanguage: targetLabel }).then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          setTranslation(result.translation);
        } else {
          setTranslateError(translateSnippetErrorMessage(result.error));
        }
        setTranslateLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [sentence, targetLanguage, targetLabel]);

  // One-shot TTS for the highlighted sentence. Uses the platform's
  // native speech synthesizer (expo-speech) — instant, no API roundtrip,
  // no bandwidth cost. Quality is below ElevenLabs but for "tap a
  // sentence to hear it" the latency win is the bigger UX lever.
  // Tracks isSpeaking so the button can show a "Stop" affordance while
  // playing and so dismissing the sheet stops audio.
  const [isSpeaking, setIsSpeaking] = useState(false);
  useEffect(() => {
    return () => {
      // Tear down any in-flight speech when the sheet unmounts.
      void Speech.stop();
    };
  }, []);
  const handleAudio = useCallback(() => {
    if (isSpeaking) {
      void Speech.stop();
      setIsSpeaking(false);
      return;
    }
    if (!sentence.trim()) return;
    setIsSpeaking(true);
    Speech.speak(sentence, {
      // Slight slowdown — comfortable for sentence-by-sentence study.
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [sentence, isSpeaking]);
  const handleDismiss = useCallback(() => {
    if (isSpeaking) void Speech.stop();
    setIsSpeaking(false);
    onDismiss();
  }, [isSpeaking, onDismiss]);

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={sentStyles.bg}
      handleIndicatorStyle={sentStyles.handle}
      handleStyle={sentStyles.handleWrap}
      onDismiss={onDismiss}
    >
      <BottomSheetView style={sentStyles.content}>
        {/* Language pair header */}
        <View style={sentStyles.header}>
          <View style={sentStyles.langPair}>
            <View style={sentStyles.langBadgeFrom}>
              <Text style={sentStyles.langBadgeFromText}>EN</Text>
            </View>
            <Text style={sentStyles.langArrow}>→</Text>
            <View style={sentStyles.langBadgeTo}>
              <Text style={sentStyles.langBadgeToText}>{targetBadge}</Text>
            </View>
          </View>
          <Pressable
            style={sentStyles.closeBtn}
            onPress={onDismiss}
            hitSlop={8}
            accessibilityLabel="Close translation"
          >
            <Icon name="X" size={11} color={tokens.colors.ink[400]} strokeWidth={2.5} />
          </Pressable>
        </View>

        {/* Original sentence */}
        <Text style={sentStyles.original}>
          "{sentence}"
        </Text>

        {/* Translation — live from translate-snippet. While the request
            is in flight we show a soft "Translating…" placeholder so the
            sheet's vertical layout doesn't snap when the result lands. */}
        {translateLoading ? (
          <Text style={[sentStyles.translation, { opacity: 0.55 }]}>
            Translating into {targetLabel}…
          </Text>
        ) : translateError ? (
          <Text style={[sentStyles.translation, { opacity: 0.8 }]}>
            {translateError}
          </Text>
        ) : (
          <Text style={sentStyles.translation}>
            {translation ?? ''}
          </Text>
        )}

        {/* Actions */}
        <View style={sentStyles.actions}>
          <Pressable
            style={({ pressed }) => [sentStyles.btn, sentStyles.btnAudio, pressed && { opacity: 0.8 }]}
            onPress={handleAudio}
            accessibilityRole="button"
            accessibilityLabel={isSpeaking ? 'Stop audio' : 'Play sentence audio'}
          >
            <Icon
              name={isSpeaking ? 'Pause' : 'Headphones'}
              size={13}
              color={tokens.colors.ink[300]}
              strokeWidth={1.5}
            />
            <Text style={sentStyles.btnAudioText}>{isSpeaking ? 'Stop' : 'Audio'}</Text>
          </Pressable>
          <Pressable
            disabled={saved}
            style={({ pressed }) => [
              sentStyles.btn,
              sentStyles.btnCopy,
              pressed && { opacity: 0.8 },
              saved && { opacity: 0.6 },
            ]}
            onPress={onSave}
          >
            <Icon
              name={saved ? 'Check' : 'Notebook'}
              size={13}
              color={tokens.colors.ink[300]}
              strokeWidth={1.5}
            />
            <Text style={sentStyles.btnCopyText}>{saved ? 'Saved' : 'Save'}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [sentStyles.btn, sentStyles.btnDone, pressed && { opacity: 0.85 }]}
            onPress={handleDismiss}
          >
            <Text style={sentStyles.btnDoneText}>Done</Text>
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

// ─── Translate popover ────────────────────────────────────────────────────────

function TranslatePopover({
  word,
  saved,
  onSave,
  onDismiss,
}: {
  word: string;
  saved: boolean;
  onSave: () => void;
  onDismiss: () => void;
}) {
  // Dictionary lookup for the tapped word. We start optimistic — show the
  // word + a "Looking up…" line — and replace with the real definition or
  // a not-found state once the fetch resolves. Cached in-memory by
  // `lookupWord`, so the same tap doesn't re-fetch.
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLookup(null);
    void lookupWord(word).then((res) => {
      if (cancelled) return;
      setLookup(res);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [word]);

  return (
    <View style={styles.popoverOverlay} pointerEvents="box-none">
      <View style={styles.popover}>
        <Text style={styles.popoverWord}>{lookup?.word ?? word}</Text>
        {lookup?.phonetic ? (
          <Text style={styles.popoverPhonetic}>{lookup.phonetic}</Text>
        ) : null}
        <View style={styles.popoverDivider} />
        {loading ? (
          <View style={styles.popoverRow}>
            <Text style={styles.popoverLang}>EN</Text>
            <Text style={styles.popoverDef}>Looking up…</Text>
          </View>
        ) : lookup && lookup.definitions.length > 0 ? (
          lookup.definitions.map((d, i) => (
            <View key={i} style={styles.popoverRow}>
              <Text style={styles.popoverLang}>{abbreviatePos(d.partOfSpeech)}</Text>
              <Text style={styles.popoverDef}>{d.definition}</Text>
            </View>
          ))
        ) : (
          <View style={styles.popoverRow}>
            <Text style={styles.popoverLang}>EN</Text>
            <Text style={styles.popoverDef}>No definition found.</Text>
          </View>
        )}
        <View style={styles.popoverActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Play pronunciation"
            // Native TTS the word — instant, no API roundtrip. Slower
            // rate than the sentence sheet because a single word
            // benefits more from clarity than from a "natural"
            // reading cadence.
            onPress={() => {
              void Speech.stop();
              Speech.speak(word, { rate: 0.85 });
            }}
            style={styles.popoverBtnAudio}
          >
            <Icon name="Headphones" size={12} color={tokens.colors.cream[50]} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={saved}
            onPress={onSave}
            style={[styles.popoverBtnSave, saved && { opacity: 0.7 }]}
          >
            <Icon
              name={saved ? 'Check' : 'Notebook'}
              size={11}
              color={tokens.colors.cream[50]}
            />
            <Text style={styles.popoverBtnText}>{saved ? 'Saved' : 'Save word'}</Text>
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

/**
 * Three-letter part-of-speech abbreviation for the popover gutter.
 * Falls back to a generic label so we always have something to render.
 */
function countWordsLocal(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function abbreviatePos(pos: string): string {
  const map: Record<string, string> = {
    noun: 'NOUN',
    verb: 'VERB',
    adjective: 'ADJ',
    adverb: 'ADV',
    pronoun: 'PRON',
    preposition: 'PREP',
    conjunction: 'CONJ',
    interjection: 'INTJ',
  };
  return map[pos.toLowerCase()] ?? pos.slice(0, 4).toUpperCase();
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
  { key: 'sepia', label: 'Sepia', bg: '#F5EDD8',                  dot: '#C4A882',                textColor: '#5C4A30'              },
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
  autoHide,
  onPreset,
  onFontSize,
  onFontFamily,
  onTheme,
  onAutoHide,
  onReset,
}: {
  preset: ReaderPreset;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  theme: ReaderTheme;
  autoHide: boolean;
  onPreset: (p: ReaderPreset) => void;
  onFontSize: (n: number) => void;
  onFontFamily: (f: ReaderFontFamily) => void;
  onTheme: (t: ReaderTheme) => void;
  onAutoHide: (v: boolean) => void;
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

      <View style={styles.sheetDivider} />

      {/* Auto-hide chrome */}
      <View style={styles.autoHideRow}>
        <View style={styles.autoHideText}>
          <Text style={styles.sheetSectionLabel}>Auto-hide controls</Text>
          <Text style={styles.autoHideDesc}>Hides header and buttons after 3 seconds of reading</Text>
        </View>
        <Switch
          value={autoHide}
          onValueChange={onAutoHide}
          trackColor={{ true: tokens.colors.forest[800] }}
        />
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

  // Continuous-scroll reader
  pagerWrap: {
    flex: 1,
    position: 'relative',
  },
  pagerScroll: {
    flex: 1,
  },
  pagerContent: {
    paddingBottom: tokens.space.xl,
  },
  page: {
    paddingHorizontal: 24,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.lg,
  },
  pageHeader: {
    marginBottom: tokens.space.md,
  },
  // Per-section spinner shown while the lazy `usePage` fetch is in
  // flight. Bounded height keeps the FlatList's contentSize stable so
  // sections don't jump around as content streams in.
  pageLoadingWrap: {
    minHeight: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Empty-state UI for books whose text didn't extract (scanned PDFs,
  // failed EPUBs). Centered, with a CTA back to Full mode when the
  // parent provided one.
  notFoundWrap: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  notFoundTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  notFoundBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  notFoundCta: {
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  notFoundCtaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
  },
  // Tertiary action under the primary Retry button. Plain text only —
  // no background — so it reads as the secondary path without
  // competing for attention.
  notFoundSecondaryCta: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notFoundSecondaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
  },
  // Visual page-break divider between sections. Two thin rules with
  // the page label centred between them — gives the user a clear
  // "you've crossed a page boundary" cue without breaking the
  // continuous-scroll flow.
  pageBreak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingVertical: tokens.space.lg,
    marginBottom: tokens.space.md,
  },
  pageBreakLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  pageBreakLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
  // Title now sits to the left of the row, flush against the back
  // button. flex:1 takes the remaining space; alignItems: 'flex-start'
  // anchors it at the top of the cross axis (relevant if the title
  // ever wraps — `numberOfLines={1}` makes it elide instead).
  headerTitleLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: tokens.space.sm,
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
  // Persistent vocab marker — softer than the active tap so previously
  // saved words don't visually shout over the prose, but still stand out.
  wordSaved: {
    backgroundColor: 'rgba(255, 200, 80, 0.28)',
    borderRadius: 3,
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

  // Auto-hide toggle row
  autoHideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space.md,
    paddingBottom: tokens.space.sm,
  },
  autoHideText: {
    flex: 1,
  },
  autoHideDesc: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 2,
  },

  // Sentence highlight (long-press)
  sentenceHighlight: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 3,
  },
  // Persistent saved-sentence marker — same softer tint as wordSaved so
  // the two highlight kinds read as one visual language.
  sentenceSaved: {
    backgroundColor: 'rgba(255, 200, 80, 0.22)',
    borderRadius: 3,
  },

  // Tap hint (auto-hide)
  tapHint: {
    position: 'absolute',
    bottom: 96,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  tapHintInner: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  tapHintText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
});

// ─── Sentence translate sheet styles ─────────────────────────────────────────

const sentStyles = StyleSheet.create({
  bg: {
    backgroundColor: '#1A1A1A',
  },
  handle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    width: 36,
  },
  handleWrap: {
    paddingBottom: 0,
  },
  content: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xl,
    paddingTop: tokens.space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space.md,
  },
  langPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langBadgeFrom: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  langBadgeFromText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: tokens.colors.ink[300],
  },
  langArrow: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.colors.ink[500],
  },
  langBadgeTo: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  langBadgeToText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: tokens.colors.cream[50],
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  original: {
    fontFamily: 'Literata_400Regular',
    fontSize: 14,
    fontStyle: 'italic',
    color: tokens.colors.ink[300],
    lineHeight: 22,
    marginBottom: tokens.space.md,
  },
  translation: {
    fontFamily: tokens.fonts.ui,
    fontSize: 15,
    color: tokens.colors.cream[50],
    lineHeight: 24,
    marginBottom: tokens.space.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  btn: {
    height: 38,
    borderRadius: tokens.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  btnAudio: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
  },
  btnAudioText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.ink[300],
  },
  btnCopy: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
  },
  btnCopyText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.ink[300],
  },
  btnDone: {
    flex: 1,
    backgroundColor: tokens.colors.forest[800],
  },
  btnDoneText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
