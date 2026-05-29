import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatNetworkError } from '~/lib/networkErrors';
import { reprocessBook } from '~/lib/reprocessBook';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';
import { useSlowOp } from '~/hooks/useSlowOp';
import { SlowNetworkBanner } from '~/components/SlowNetworkBanner';
import type { Book } from '~/types/book';
import {
  persistReadingPosition,
  useAllPagesContent,
  usePage,
  usePageList,
  type PageListItem,
  type PageRow,
} from '~/lib/useBookChapters';
import { lookupWord, type WordLookup } from '~/lib/dictionary';
import { supabase } from '~/lib/supabase';
import { useReadingSession } from '~/lib/readingSessions';
import { saveHighlight, useBookHighlights, type Highlight } from '~/lib/highlights';
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
  // Plain text is the canonical source for the paginated reader.
  // Some books (older imports, EPUBs whose pipeline only produced
  // spine HTML, books processed before the 200-word slicer landed)
  // have null/empty `content` but a populated `html_content`. The
  // user saw a blank reader on those — the section mounted but
  // there were no paragraphs to render. Fall back to stripping the
  // HTML so we at least show the prose; the dictionary / highlight
  // affordances still work because they operate on the resulting
  // word tokens.
  let content = dbPage.content ?? '';
  if (!content.trim() && dbPage.html_content) {
    content = dbPage.html_content
      // Drop block-level closers as paragraph breaks (double newline)
      // so the splitter below can rebuild paragraph structure.
      .replace(/<\s*(?:\/p|\/div|\/li|br\s*\/?)\s*>/gi, '\n\n')
      // Strip remaining tags.
      .replace(/<[^>]+>/g, ' ')
      // Common named entities (numeric ones are rare in our pipeline).
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
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

// Module-scope empty Set so per-page lookups against the
// savedWordsByPage / savedSentencesByPage maps can fall back to a
// stable identity. Without this, every PageSection that has no
// highlights would receive a freshly-allocated `new Set()` per
// render — which would invalidate React.memo identity checks down
// the tree and force a re-render on every parent update.
const EMPTY_STRING_SET: ReadonlySet<string> = new Set<string>();

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
  const [pageIndex, setPageIndex] = useState<number>(() =>
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

  // ALL pages' content in a single query. We used to lazy-fetch each
  // page individually from inside <PageSection> (via usePage) which
  // meant the saved-page section showed a small spinner for ~300ms
  // after the FlatList mounted, and the user had to tap or scroll
  // before the text appeared. With the bulk fetch every page is
  // ready by the time the list renders, so opening the book lands
  // the user on their saved page with the text already visible.
  //
  // Payload trade-off: a 200-page book is ~40KB of text, a very
  // large textbook ~1MB. We hold it in memory for the reader's
  // lifetime — modern devices have plenty of headroom for that,
  // and the alternative (blank-flash-then-scroll) was hurting the
  // first-paint experience badly.
  const {
    pages: allPages,
    loading: allPagesLoading,
    // Error path: surfaces the request_timeout sentinel (set by the
    // hook when its 15 s abort fires) and any other Supabase /
    // network failure. When set, we exit the skeleton and render an
    // error empty state with a Retry — without that wiring a
    // failed fetch left the reader in an opaque forever-loading
    // state.
    error: allPagesError,
  } = useAllPagesContent(book.id);
  const pageContentMap = useMemo(() => {
    const m = new Map<number, PageRow>();
    for (const p of allPages) m.set(p.page_index, p);
    return m;
  }, [allPages]);

  // Slow-network indicator. If page-list OR all-pages content has
  // been loading for more than 5 seconds, the user is probably on
  // a flaky connection — surface a banner that tells them why
  // they're staring at a blank reader.
  const isOpenSlow = useSlowOp(pageListLoading || allPagesLoading);

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

  // Page tracker — scroll-position / measured-height estimation.
  //
  // We can't trust per-section `onLayout` y values because every
  // FlatList item is wrapped in a CellRenderer whose own y position
  // we don't see — every PageSection's onLayout reports `y=0`
  // relative to its cell. (Verified in Metro: all 21 mounted
  // sections reported y=0.)
  //
  // We also can't trust `contentSize.height / totalPages` as a
  // per-page-height proxy: FlatList uses ESTIMATED heights for the
  // ~1500 unmounted sections (a 1570-page book mounts only ~12 at
  // a time), so the reported contentSize is dominated by tiny
  // estimates and the resulting fraction massively overshoots once
  // the user scrolls a few pages in.
  //
  // What we CAN trust: each mounted section's `height` (from its
  // onLayout, which is correct because height is intrinsic to the
  // view regardless of cell wrapping). Averaging the measured
  // heights gives a true per-page height for the current window of
  // the book — and since the window moves with the user, this
  // adapts to local variability (a chapter of short pages vs. a
  // chapter of long ones). Current page ≈ scrollY / averageHeight.
  //
  // The Map is keyed by `page_index` so we only count each page
  // once — re-measurement (e.g. after dbPage arrives and the
  // section re-lays-out) just updates the entry instead of
  // double-counting.
  const pageHeightsRef = useRef<Map<number, number>>(new Map());
  // Signals when the SAVED page's section has reported its real
  // layout (height > 100). FlatList walks through intermediate
  // pages on its way to the saved one; we want to keep the
  // visible-FlatList gate closed until the destination itself
  // has been measured, because that's the first moment we know
  // the scroll has actually landed (or is one frame away from
  // landing).
  const savedPageMeasuredRef = useRef<boolean>(false);
  const recordPageHeight = useCallback(
    (pageIdx: number, height: number) => {
      // Discard zero-height measurements (a section that hasn't
      // received its dbPage yet renders only a small spinner —
      // including that in the average would skew the estimate
      // sharply down).
      if (height > 100) {
        pageHeightsRef.current.set(pageIdx, height);
        // Mark the saved-page landing point AND clear the
        // restoration target — we've reached it, so the
        // onContentSizeChange handler should stop firing
        // scrollToOffset calls.
        if (pageIdx === anchorPageRef.current) {
          savedPageMeasuredRef.current = true;
          restoreTargetRef.current = null;
        }
      }
    },
    [],
  );

  // Anchor-based page tracking.
  //
  // `anchorPageRef` is the last page we KNOW the user was on (start
  // = the saved page); `anchorScrollYRef` is the scrollY value when
  // that anchor was set. As the user scrolls forward, current page
  // = anchor + (scrollY - anchorScrollY) / avgHeight.
  //
  // Why anchor: a pure scroll/avgHeight estimate has to extrapolate
  // pages-not-yet-measured from a global average, which means error
  // accumulates linearly from page 0. Anchoring at the saved page
  // resets the error budget to zero at the point the user actually
  // lands, so the tracker stays accurate as they read forward.
  //
  // `anchorReadyRef` gates page-tracker updates so the saved-page
  // restore loop (scrollToOffset converging toward the target)
  // doesn't tick the anchor before the user lands on the saved
  // page. We start tracking once the user takes their first
  // drag.
  const anchorPageRef = useRef<number>(pageIndex);
  const anchorScrollYRef = useRef<number>(0);
  const anchorReadyRef = useRef<boolean>(false);

  // Saved-page restoration target. Holds the index we're trying
  // to scroll to during the initial open, then clears once we
  // land (or the user takes over with a manual scroll). The
  // onContentSizeChange handler below uses this in a converge-on-
  // target loop — recomputing the offset from measured heights as
  // FlatList mounts more sections and firing scrollToOffset until
  // we land on the saved page. This pattern is the StackOverflow-
  // recommended approach for restoring scroll position with
  // variable-height items (which is exactly our case, and which
  // initialScrollIndex / scrollToIndex are not reliable for).
  const restoreTargetRef = useRef<number | null>(
    pageIndex > 0 ? pageIndex : null,
  );

  /**
   * Estimate the scroll offset that lands the top of the
   * viewport at the start of page `target`. We use measured
   * heights for the pages we've actually rendered (accurate)
   * and the running average for the pages we haven't (best
   * available guess). The FALLBACK_HEIGHT only kicks in for the
   * very first call before any items have laid out.
   */
  const FALLBACK_HEIGHT = 700;
  const computeOffsetForPage = useCallback((target: number): number => {
    const heights = pageHeightsRef.current;
    if (heights.size === 0) return target * FALLBACK_HEIGHT;
    let totalMeasured = 0;
    for (const h of heights.values()) totalMeasured += h;
    const avg = totalMeasured / heights.size;
    // Sum heights for pages 0..target-1 using measured-where-we-
    // have-it and avg-otherwise. As FlatList mounts more sections
    // the heights map grows, so each successive estimate is
    // closer to the truth.
    let sum = 0;
    for (let i = 0; i < target; i++) {
      sum += heights.get(i) ?? avg;
    }
    return sum;
  }, []);

  /**
   * onContentSizeChange driver. Fires whenever FlatList's content
   * size grows (typically because new sections rendered after
   * the last batch tick). If we still have a restoration target,
   * recompute the offset and scrollToOffset toward it. Loops
   * until the saved page mounts and `recordPageHeight` clears
   * `restoreTargetRef`.
   *
   * Why this works where scrollToIndex didn't:
   *   scrollToIndex re-fires onScrollToIndexFailed when its
   *   target is unmounted, recursively spawning new callbacks
   *   that lost track of the original page. scrollToOffset never
   *   fails — it just sets the scroll position — so this loop
   *   is deterministic.
   */
  const onContentSizeChange = useCallback(() => {
    const target = restoreTargetRef.current;
    if (target === null) return;
    const offset = computeOffsetForPage(target);
    listRef.current?.scrollToOffset({ offset, animated: false });
  }, [computeOffsetForPage]);

  // Visible-FlatList gate. The FlatList does its scroll-to-saved-
  // page dance by calling scrollToIndex repeatedly with intermediate
  // targets — each call animates a small scroll forward, then
  // FlatList renders the next batch, then we try again. The user
  // SEES that scroll happen: the book briefly displays page 0, then
  // page 4, then page 8, etc, before landing on the saved page.
  // That's the "glitching from page to page" they're seeing.
  //
  // Fix: keep the FlatList visible-but-off (opacity 0) during the
  // restore phase. The skeleton overlay above still hides while
  // loading, so the user sees a clean blank surface, then the
  // saved page fades in once we've landed. Books that open at page
  // 0 skip this entirely (no restore needed).
  const [flatListReady, setFlatListReady] = useState<boolean>(
    () => pageIndex === 0,
  );

  // Two-track reveal logic:
  //
  //   1. Saved-page-measured poll (primary signal). Once
  //      `savedPageMeasuredRef` flips true — meaning the saved
  //      page's section has actually rendered and reported its
  //      onLayout — wait one more frame for the scroll to settle,
  //      then reveal. This is the most accurate "the saved page
  //      is on screen and stable" signal we have. We poll with a
  //      lightweight interval because the ref doesn't trigger
  //      re-renders (refs by design).
  //
  //   2. Safety timer (fallback). If the saved page never gets
  //      measured (degenerate cases — page didn't render, all
  //      pages collapsed, etc), reveal at 5 s anyway so the
  //      user isn't staring at a blank screen indefinitely. The
  //      ceiling is bigger than the retry loop's worst case
  //      (~3.6 s) so the polling path wins on every healthy open.
  useEffect(() => {
    if (flatListReady) return;
    const pollInterval = setInterval(() => {
      if (savedPageMeasuredRef.current) {
        clearInterval(pollInterval);
        // One frame after measurement so the scroll commits
        // before the opacity gate drops.
        setTimeout(() => setFlatListReady(true), 60);
      }
    }, 80);
    const safetyTimer = setTimeout(() => {
      clearInterval(pollInterval);
      setFlatListReady(true);
    }, 3000);
    return () => {
      clearInterval(pollInterval);
      clearTimeout(safetyTimer);
    };
  }, [flatListReady]);

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

  // Saved highlights for the WHOLE BOOK, shared across every
  // PageSection so an optimistic add (handleSaveWord below) shows
  // up immediately on the rendered paragraph. The previous shape
  // called usePageHighlights twice — once at ReaderScreen for the
  // popover, once at PageSection for paragraph rendering — and
  // because each call has its own state, the optimistic add only
  // updated ReaderScreen's copy. The user saved a word, dismissed
  // the popover, and the paragraph never changed because
  // PageSection's hook hadn't refetched yet.
  //
  // Going book-wide here lets one hook back every visible section
  // and one optimistic add reach all of them. Per-page lookups
  // happen via the savedWordsByPage / savedSentencesByPage maps
  // below, which are O(1) per section render.
  const {
    highlights: bookHighlights,
    addOptimistic: addHighlightOptimistic,
  } = useBookHighlights(book.id);
  const savedWordsByPage = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const h of bookHighlights) {
      if (h.kind !== 'word' || h.pageIndex === null) continue;
      let set = map.get(h.pageIndex);
      if (!set) {
        set = new Set();
        map.set(h.pageIndex, set);
      }
      set.add(h.text.toLowerCase());
    }
    return map;
  }, [bookHighlights]);
  const savedSentencesByPage = useMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const h of bookHighlights) {
      if (h.kind !== 'sentence' || h.pageIndex === null) continue;
      let set = map.get(h.pageIndex);
      if (!set) {
        set = new Set();
        map.set(h.pageIndex, set);
      }
      set.add(h.text.trim());
    }
    return map;
  }, [bookHighlights]);
  // Defensive local "saved" mirror.
  //
  // We've chased a stubborn bug where the wordSaved tint wouldn't
  // appear on the just-tapped word after Save dismisses the
  // popover. The state chain (addOptimistic → bookHighlights →
  // savedWordsByPage → per-page Set → memo'd PageSection →
  // TappableParagraph children memo) SHOULD propagate the new
  // word, but on real devices the user kept reporting it didn't.
  //
  // This ref captures the saved word SYNCHRONOUSLY at the moment
  // of the tap, completely bypassing the optimistic / refetch /
  // memo chain. A `savedBump` state bump forces a render so the
  // ref's contents are observed. The render-time `savedWords` Set
  // is the union of the state-derived per-page Set AND this ref's
  // per-page Set — so whatever the chain misses, the ref catches.
  //
  // Once the next refetch returns the real server row, both
  // sources contain the word; the union still resolves to a Set
  // containing it. No de-dupe needed.
  const localSavedRef = useRef<Map<number, Set<string>>>(new Map());
  const [savedBump, setSavedBump] = useState(0);
  const recordLocalSavedWord = useCallback(
    (pageIdx: number, cleanedWord: string) => {
      let set = localSavedRef.current.get(pageIdx);
      if (!set) {
        set = new Set();
        localSavedRef.current.set(pageIdx, set);
      }
      set.add(cleanedWord);
      setSavedBump((b) => b + 1);
    },
    [],
  );

  const savedWords = useMemo(() => {
    const fromState = savedWordsByPage.get(pageIndex) ?? EMPTY_STRING_SET;
    const fromLocal = localSavedRef.current.get(pageIndex);
    if (!fromLocal || fromLocal.size === 0) return fromState;
    return new Set([...fromState, ...fromLocal]);
    // savedBump is intentionally in the dep list — it's the
    // signal that localSavedRef has new content. The ref itself
    // doesn't trigger renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedWordsByPage, pageIndex, savedBump]);
  const savedSentences =
    savedSentencesByPage.get(pageIndex) ?? EMPTY_STRING_SET;

  const handleSaveWord = useCallback(
    async (rawWord: string) => {
      const cleaned = rawWord.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
      if (cleaned.length <= 1) return;
      // Synchronous local mirror — see localSavedRef comment.
      // Has to happen BEFORE the optimistic add so the bump
      // and the bookHighlights update batch together into one
      // render (cleaner than fighting React's batching).
      recordLocalSavedWord(pageIndex, cleaned);
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
    [
      book.id,
      pageIndex,
      dbPage?.id,
      addHighlightOptimistic,
      recordLocalSavedWord,
    ],
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
  // virtualisation window — variable-height items don't support
  // exact scrollToIndex restoration, so we re-arm the saved-page
  // restore loop instead (onContentSizeChange below converges).
  //
  // Re-arm the anchor so the page tracker computes deltas from
  // here, not from the previous anchor point. Without this, jumping
  // from page 130 to page 800 would leave the tracker anchored at
  // page 130 and it would compute (800 + scroll delta from old
  // anchor) ≈ a nonsense large number on the next scroll.
  const jumpToPage = useCallback((idx: number) => {
    setPageIndex(idx);
    anchorPageRef.current = idx;
    anchorReadyRef.current = false; // re-lock on the next scrollBegin
    listRef.current?.scrollToIndex({ index: idx, animated: true });
  }, []);

  // Persist the page-change immediately so reopening lands on the
  // right page even if the user closes the reader before scrolling
  // mid-page. The throttled within-page persistence below covers
  // scroll-position updates.
  useEffect(() => {
    void persistReadingPosition({ bookId: book.id, pageIndex, position: 0 });
  }, [book.id, pageIndex]);

  // Throttled within-page scroll persistence. Debounced 1.5 s after
  // the last scroll event so a thumb-drag through twenty pages
  // doesn't fan out twenty position writes. Held in a ref so we
  // don't re-render ReaderScreen on every scroll just to bump the
  // timer — the previous `scrollTick` state churned the React tree
  // 8× per second during reading, which combined with FlatList's
  // already-tight render budget produced visible flicker on the
  // text content. Ref-only is functionally identical and free.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      void persistReadingPosition({
        bookId: book.id,
        pageIndex,
        position: getProgressFraction(),
      });
    }, 1500);
  }, [book.id, pageIndex, getProgressFraction]);
  // Clear any pending persist on unmount so an in-flight timer
  // doesn't fire against a stale book id after the user navigates
  // away.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // Total page count is still threaded down to PageSection so the
  // in-content "PAGE X OF Y" dividers render correctly. Floor at 1
  // for freshly-uploaded books where total_pages hasn't been
  // written yet.
  const totalBookPages = book.totalPages > 0 ? book.totalPages : 1;

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
      console.warn('[Reader] reprocessBook threw:', err);
      Alert.alert(
        "Couldn't restart processing",
        formatNetworkError(err, 'restarting processing'),
      );
    } finally {
      setReprocessing(false);
    }
  }, [book.id, onBack, reprocessing]);

  // FlatList viewability config removed — the page tracker is now
  // driven by `onScroll` math (anchor + measured-height delta)
  // because the viewability callback fires unreliably under
  // newArch for variable-height items. See the onScroll handler
  // below for the actual tracking logic.
  // Stable setter — FlatList's onViewableItemsChanged callback is
  // fixed at first render (changing it throws), so we route the
  // pageIndex update through a ref-stable function.
  //
  // The ref update lives in a useEffect rather than at render time
  // (the previous render-time write triggers React's "side effect
  // in render" lint and breaks under concurrent rendering, which
  // may run components twice without committing).
  // Stable setter — `setPageIndex` from useState is identity-
  // stable across renders, so we wrap it in a ref-stable function
  // that uses the FUNCTIONAL form of setState to avoid any stale-
  // closure issues. The previous shape compared against a captured
  // `pageIndex` closure value and only fired setPageIndex when the
  // value changed — but under React 18's automatic batching that
  // captured value could lag the actual state by one render in
  // edge cases, and the comparison would no-op a real change.
  // setPageIndex's own dedupe (it ignores updates that produce the
  // same primitive value) handles repeats just fine.
  const setPageIndexFromScrollRef = useRef<(idx: number) => void>(
    () => {},
  );
  setPageIndexFromScrollRef.current = (idx: number) => {
    setPageIndex((prev) => (prev === idx ? prev : idx));
  };

  if (MOCK_READER_LOADING) {
    return <ReaderSkeleton onBack={onBack} />;
  }

  // Show the skeleton while a real (uuid) book's chapter content is in
  // flight. Mock books skip the fetch entirely (notFound fires synchronously
  // via the hook), so they fall through to the fallback content.
  //
  // We also hold the skeleton until `useAllPagesContent` finishes the
  // bulk-load of page bodies. Mounting the FlatList before that data
  // is ready was the root cause of the "text blank until scroll" bug:
  // PageSections rendered with `dbPage === null` (loading spinner),
  // FlatList's `initialScrollIndex` would land on an unmeasured slot,
  // and the user saw an empty viewport until a touch event forced a
  // re-measure. By gating the mount on `allPagesLoading`, every
  // section has its content from the very first paint, the layout
  // settles in one pass, and the saved page lands measured and
  // visible. Trade-off: the skeleton sticks around an extra ~200-
  // 800ms on cold open. Cheap price for first-paint correctness.
  if ((pageListLoading || allPagesLoading) && !notFound) {
    return <ReaderSkeleton onBack={onBack} />;
  }

  // Bulk-fetch errored out (timeout, offline, Supabase issue). We
  // exit the skeleton above only because `allPagesLoading` flips
  // false on error too — without surfacing this branch the screen
  // would render an empty FlatList of pages forever. Friendly
  // mapping lives in `formatNetworkError` (shared across every
  // screen) so the message stays consistent app-wide.
  if (allPagesError) {
    const friendlyError = formatNetworkError(allPagesError, 'loading this book');
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
            name="X"
            size={36}
            color={tokens.colors.error}
            strokeWidth={1.5}
          />
          <Text style={[styles.notFoundTitle, { color: palette.text }]}>
            Could not load book
          </Text>
          <Text style={[styles.notFoundBody, { color: palette.muted }]}>
            {friendlyError}
          </Text>
        </View>
      </SafeAreaView>
    );
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

      {/* Slow-network banner. Shown when the bulk page fetch has
          been pending more than 5 seconds. The user usually sees a
          spinner for ~300ms on a healthy connection; if they're
          staring at a blank reader past 5s, something's wrong with
          the link and we should tell them so they don't think the
          app is broken. */}
      {isOpenSlow && (
        <SlowNetworkBanner label="Loading this book is taking longer than usual — check your connection." />
      )}

      {/* Virtualised continuous-scroll reading area. FlatList renders
          only ~3-5 sections at a time and lazy-fetches each page's
          content when it enters the window — keeps memory bounded
          even on 500-page books. Visual page-break dividers separate
          sections so the user still feels page boundaries. */}
      <View style={styles.pagerWrap}>
        {/* Loading overlay shown while we walk through the
            scroll-to-saved-page retries. Sits absolutely above
            the FlatList so the user sees a clean loading state
            instead of the content visibly scrolling from page 0
            → page N via the intermediate stops. Removed once the
            saved page's section has reported its layout (the
            useEffect that polls savedPageMeasuredRef flips
            `flatListReady` true). */}
        {!flatListReady && (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.restoreOverlay,
              { backgroundColor: palette.bg, zIndex: 10 },
            ]}
            pointerEvents="auto"
          >
            <ActivityIndicator size="small" color={palette.subtle} />
            <Text style={[styles.restoreOverlayLabel, { color: palette.muted }]}>
              Finding your page…
            </Text>
          </View>
        )}
        <FlatList<PageListItem>
          ref={listRef}
          data={pageList}
          keyExtractor={(item) => String(item.page_index)}
          renderItem={({ item, index }) => (
            <PageSection
              pageIndex={item.page_index}
              dbPage={pageContentMap.get(item.page_index) ?? null}
              isFirst={index === 0}
              totalBookPages={totalBookPages}
              palette={palette}
              readingFont={readingFont}
              fontSize={fontSize}
              tappedWord={tappedWord}
              selectedSentence={selectedSentence}
              onWordPress={handleWordPress}
              onSentenceLongPress={handleSentenceLongPress}
              onLayoutHeight={recordPageHeight}
              savedWords={
                savedWordsByPage.get(item.page_index) ?? EMPTY_STRING_SET
              }
              savedSentences={
                savedSentencesByPage.get(item.page_index) ?? EMPTY_STRING_SET
              }
            />
          )}
          // Virtualisation tuning. Mount a small initial window
          // (4 sections) and let FlatList stream more sections as
          // the user (or the saved-page restore loop) scrolls
          // toward them. The previous shape mounted `pageIndex +
          // 2` items on first commit so initialScrollIndex could
          // land — on a 800-page open that froze the JS thread
          // for seconds and made the screen blank until a touch
          // forced a re-render. The current approach (skip
          // initialScrollIndex, converge via onContentSizeChange
          // + scrollToOffset) means we never need more than the
          // viewport's worth of sections mounted on first paint.
          initialNumToRender={Math.min(4, pageList.length)}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={50}
          // windowSize tuned to 11 (~5 viewports above and below
          // the visible region). At 5 the FlatList was unmounting
          // adjacent sections aggressively, causing the "text goes
          // blank after initial render" bug. At 21, the list was
          // holding too many sections in memory and re-renders
          // were slow (Metro warned "large list slow to update"
          // with 54s render deltas). 11 is the goldilocks: enough
          // buffer that scrolling adjacent pages stays smooth, few
          // enough mounted sections that the React.memo'd
          // PageSection re-renders cheaply.
          windowSize={11}
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
          // initialScrollIndex intentionally OMITTED. With variable-
          // height items + no getItemLayout, initialScrollIndex
          // depends on scrollToIndex internally — which is the
          // exact API that's unreliable for our case. The
          // StackOverflow-recommended pattern for restoring scroll
          // position with variable-height items is to skip
          // initialScrollIndex, listen to onContentSizeChange,
          // and call scrollToOffset with a computed pixel offset.
          // The list starts at the top and converges on the saved
          // page over a few render cycles as more sections mount.
          onContentSizeChange={onContentSizeChange}
          // Track which section is currently most-visible to keep
          // pageIndex (and progress bar / page label) in sync with
          // where the user actually is.
          showsVerticalScrollIndicator={false}
          onTouchStart={showChrome}
          onScrollBeginDrag={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            dismissPopover();
            // The user took over scrolling — abandon any pending
            // saved-page restoration so we don't fight their
            // intent. Also lock the page-tracker anchor at the
            // current scroll Y.
            restoreTargetRef.current = null;
            if (!anchorReadyRef.current) {
              anchorScrollYRef.current = e.nativeEvent.contentOffset.y;
              anchorReadyRef.current = true;
            }
          }}
          contentContainerStyle={styles.pagerContent}
          // Tap-driven scroll progress — FlatList exposes
          // contentOffset via onScroll like ScrollView. We use it
          // to update the progress-fraction ref and re-schedule
          // the within-page persistence timer (both ref-based, no
          // re-render).
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
            schedulePersist();

            // Page tracker — anchor-relative scroll estimate.
            //
            // We only run the estimate after the user starts
            // their first drag (anchorReadyRef gets flipped in
            // onScrollBeginDrag below). Until then, FlatList
            // fires many onScroll events of its own as the
            // saved-page restore loop walks scrollToOffset
            // toward the target — letting those through would
            // tick the anchor before the saved page lands.
            // Gating on the first drag means tracking only kicks
            // in once the user is actually reading.
            //
            // Once the anchor is set, current page = anchor +
            // (scrollY - anchorScrollY) / averageHeight. This
            // keeps accuracy tight because we never extrapolate
            // from page 0 using unmeasured-page guesses — we
            // measure deltas from a point we know is correct.
            if (!anchorReadyRef.current) return;

            const totalPages = pageList.length;
            const heights = pageHeightsRef.current;
            if (totalPages > 0 && heights.size > 0) {
              let sum = 0;
              for (const h of heights.values()) sum += h;
              const avgHeight = sum / heights.size;
              if (avgHeight > 0) {
                const deltaY = contentOffset.y - anchorScrollYRef.current;
                const deltaPages = Math.round(deltaY / avgHeight);
                const estimatedPage = Math.max(
                  0,
                  Math.min(
                    totalPages - 1,
                    anchorPageRef.current + deltaPages,
                  ),
                );
                setPageIndexFromScrollRef.current(estimatedPage);
              }
            }
          }}
        />
      </View>

      {/*
        Page-tracker progress bar removed — variable-height pages
        + FlatList's estimated-vs-measured cell layout made every
        accuracy approach we tried drift by tens or hundreds of
        pages (anchored deltas, height averaging, scroll-fraction
        mapping). The in-content "PAGE X OF Y" dividers between
        each section are authoritative and visible during normal
        reading, which covers the same need. The Highlights /
        AI-tools / search surfaces still read `pageIndex` to
        operate on the currently-visible page (the scroll handler
        keeps that state up to date for those features even
        though we no longer render it).
      */}

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
            onSave={() => {
              // Fire-and-forget save AND dismiss the popover in
              // the same tick. Two reasons:
              //   1. The popover sits ON TOP of the word, so the
              //      user can't actually SEE the new `wordSaved`
              //      tint while it's open — they always reported
              //      "the word wasn't highlighted after I saved"
              //      because the popover was occluding it.
              //   2. Dismissing flips `tappedWord` to null, which
              //      releases the `wordTapped` override and lets
              //      the persistent `wordSaved` style render. The
              //      optimistic add (done synchronously inside
              //      handleSaveWord before its `await` lands)
              //      makes savedWords already contain the word
              //      by the time the next render runs.
              void handleSaveWord(tappedWord);
              dismissPopover();
            }}
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
  // try/catch — same pattern as bookCovers.resolveCoverUrl. The
  // Supabase Storage signed-URL call throws on offline, and the
  // consumer (ChapterImage's useEffect) called this with `void
  // promise.then(...)` and no `.catch`. Rejection bubbled to the
  // LogBox dev toast on every reader open without a network.
  // Returning null is the documented "no image" outcome — the
  // ChapterImage component flips to its failed-state fallback.
  try {
    const { data, error } = await supabase.storage
      .from('books')
      .createSignedUrl(path, IMAGE_SIGNED_URL_TTL_MS / 1000);
    if (error || !data?.signedUrl) return null;
    rememberImageSignedUrl(path, data.signedUrl);
    return data.signedUrl;
  } catch (err) {
    console.warn('[ReaderScreen] resolveBookImageUrl threw:', err);
    return null;
  }
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

// ─── Page section (FlatList row) ─────────────────────────────────────────────

type PageSectionProps = {
  pageIndex: number;
  /**
   * The page's pre-fetched row. The parent reader pulls every page
   * in a single bulk query (useAllPagesContent) and threads each
   * row down here, so PageSection no longer does its own usePage
   * round-trip. `null` while the bulk query is in flight (early
   * frames of book-open) or for any page that legitimately has
   * no row.
   */
  dbPage: PageRow | null;
  isFirst: boolean;
  totalBookPages: number;
  palette: (typeof THEME)[ReaderTheme];
  readingFont: string;
  fontSize: number;
  tappedWord: string | null;
  selectedSentence: string | null;
  onWordPress: (word: string) => void;
  onSentenceLongPress: (sentence: string) => void;
  /**
   * Per-page highlight sets, threaded down from the book-wide
   * useBookHighlights hook in ReaderScreen. Lifted up from the
   * previous per-PageSection usePageHighlights call so an
   * optimistic add at the ReaderScreen level is visible across
   * every section render on the very next commit. Empty Sets
   * (identity-stable from the module-level EMPTY_STRING_SET) are
   * passed when a page has no highlights, so React.memo's
   * shallow compare stays stable.
   */
  savedWords: ReadonlySet<string>;
  savedSentences: ReadonlySet<string>;
  /**
   * Called on every layout pass for this section's root wrapper.
   * The parent uses the measured height (cell-relative y is always
   * zero inside FlatList's CellRenderer, so we don't even pass it)
   * to build a per-window average for the bottom page tracker.
   */
  onLayoutHeight: (pageIndex: number, height: number) => void;
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
// Wrapped in `memo` so re-renders only happen when a section's
// props actually change. Without this, every parent re-render
// (scroll tick, page-index update, theme tweak) re-rendered every
// mounted section and pegged the JS thread — Metro started flagging
// "VirtualizedList: You have a large list that is slow to update"
// with multi-second render deltas. handleWordPress and
// handleSentenceLongPress are already useCallback-stable up in
// ReaderScreen, dbPage comes from a Map.get() that returns the same
// reference across renders, and the other props are primitives, so
// the shallow compare is reliable. Word- and sentence-tap state
// changes still cascade to every section (those are the only props
// that legitimately churn), but everything else short-circuits.
const PageSection = memo(function PageSection({
  pageIndex,
  dbPage,
  isFirst,
  totalBookPages,
  palette,
  readingFont,
  fontSize,
  tappedWord,
  selectedSentence,
  onWordPress,
  onLayoutHeight,
  onSentenceLongPress,
  savedWords,
  savedSentences,
}: PageSectionProps) {

  // Loading is now driven by whether the parent's bulk-fetch has
  // populated our row yet. Once useAllPagesContent in the parent
  // returns, every visible section's `dbPage` arrives in the same
  // commit and the spinner state never appears — first paint
  // shows real text, which is the whole point of the refactor.
  const loading = dbPage === null;
  const ch = useMemo(() => (dbPage ? deriveChapter(dbPage) : null), [dbPage]);

  // Memoised style object passed down to each TappableParagraph.
  // Without this, a fresh inline object on every PageSection render
  // would invalidate TappableParagraph's `prev.style === next.style`
  // memo check and force every paragraph to re-reconcile on every
  // parent render — exactly the cascade the memo was added to
  // prevent. Three primitives, so the dep array is fully exhaustive.
  const paragraphStyle = useMemo(
    () => ({ fontFamily: readingFont, fontSize, color: palette.text }),
    [readingFont, fontSize, palette.text],
  );

  return (
    <View
      style={styles.page}
      // Capture this section's height — see `recordPageHeight` in
      // the parent for why we measure heights (not y positions).
      onLayout={(e) =>
        onLayoutHeight(pageIndex, e.nativeEvent.layout.height)
      }
    >
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
                style={paragraphStyle}
              />
            );
          })}
        </>
      )}
    </View>
  );
});

type TappableParagraphProps = {
  text: string;
  tappedWord: string | null;
  selectedSentence: string | null;
  savedWords: ReadonlySet<string>;
  savedSentences: ReadonlySet<string>;
  onWordPress: (word: string) => void;
  onSentenceLongPress: (sentence: string) => void;
  style: { fontFamily: string; fontSize: number; color: string };
};

/**
 * Quick test: does this paragraph contain a word matching `target`
 * (case-insensitive, alphanumeric-clean)? Used by the memo
 * comparator below to short-circuit re-renders when the tapped
 * word lives in a different paragraph.
 *
 * The reader's tappedWord state changes on every tap, which used
 * to cascade a re-render through every TappableParagraph on screen
 * (a typical page has 30–80 paragraphs, each with 50–200 word
 * nodes). The vast majority of those paragraphs don't contain the
 * tapped word — there's nothing for them to highlight — so the
 * re-render is pure overhead. A cheap substring check rules those
 * paragraphs out before React even reconciles them. On a long page
 * this drops the per-tap JS-thread work from ~120 ms to ~5 ms in
 * practice.
 *
 * Word-boundary regex (`\b`) keeps "test" from matching "testing"
 * — important so we don't keep paragraphs in the re-render set
 * when there's no real overlap.
 */
function paragraphContainsWord(text: string, target: string | null): boolean {
  if (!target) return false;
  const clean = target.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
  if (clean.length < 2) return false;
  // Build a word-bounded case-insensitive regex from the cleaned
  // target. Escape regex metas (apostrophe/hyphen are safe; the
  // others are filtered by the clean step above) — defensive only.
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/**
 * Find the line whose vertical range contains the given y. Returns
 * the line frame + the cumulative character offset of the line's
 * first character within the paragraph (so callers can map a tap
 * back to a character index in the original text).
 */
function findLineAt(
  y: number,
  lines: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
  }>,
): { line: typeof lines[number]; charOffset: number } | null {
  let charOffset = 0;
  for (const line of lines) {
    if (y >= line.y && y < line.y + line.height) {
      return { line, charOffset };
    }
    charOffset += (line.text ?? '').length;
  }
  return null;
}

/**
 * Approximate the word a user tapped on, given the tap coordinates
 * inside the paragraph and the line frames captured by onTextLayout.
 *
 * We don't have character-level layout data, so we estimate each
 * word's pixel width as `(word.length / line.length) * line.width`.
 * That's accurate within a half-character for proportional fonts in
 * normal prose — close enough to land on the right word in nearly
 * every tap. If the math lands between words, we return the closer
 * neighbour rather than failing the tap entirely.
 */
function findTappedToken(
  tapX: number,
  tapY: number,
  lines: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
  }>,
): string | null {
  const found = findLineAt(tapY, lines);
  if (!found) return null;
  const lineText = found.line.text ?? '';
  if (lineText.length === 0) return null;
  const charWidth = found.line.width / lineText.length;
  let cursor = found.line.x;
  // Split on whitespace runs so we can iterate through the line's
  // words AND the gaps between them. Tap on a gap → closest word.
  const parts = lineText.split(/(\s+)/);
  let closestWord: string | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const part of parts) {
    const partWidth = part.length * charWidth;
    if (!/^\s+$/.test(part)) {
      // Hit-test the word's pixel range.
      if (tapX >= cursor && tapX < cursor + partWidth) return part;
      // Otherwise track distance to closest word so we can fall
      // back to it if no word's range strictly contains the tap.
      const midpoint = cursor + partWidth / 2;
      const distance = Math.abs(tapX - midpoint);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestWord = part;
      }
    }
    cursor += partWidth;
  }
  return closestWord;
}

function findTappedSentence(
  tapX: number,
  tapY: number,
  lines: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
  }>,
  sentences: ReadonlyArray<{ sentence: string; charStart: number; charEnd: number }>,
): string | null {
  const found = findLineAt(tapY, lines);
  if (!found) return null;
  const lineText = found.line.text ?? '';
  if (lineText.length === 0) return null;
  // Approximate the character index within the paragraph at the tap.
  const charWidth = found.line.width / lineText.length;
  const charInLine = Math.max(
    0,
    Math.min(lineText.length - 1, Math.floor((tapX - found.line.x) / charWidth)),
  );
  const charIdx = found.charOffset + charInLine;
  // Find sentence whose char range contains this index.
  for (const s of sentences) {
    if (charIdx >= s.charStart && charIdx < s.charEnd) return s.sentence;
  }
  return null;
}

function TappableParagraphImpl({
  text,
  tappedWord,
  selectedSentence,
  savedWords,
  savedSentences,
  onWordPress,
  onSentenceLongPress,
  style,
}: TappableParagraphProps) {
  const tl = tappedWord?.toLowerCase() ?? '';

  // Pre-tokenize the paragraph. We split into sentences (for
  // sentence-highlight ranges and long-press lookup) and into
  // words (for cleaned-form matching against tappedWord /
  // savedWords). Memoized on text so the regex passes only run
  // when text actually changes.
  const tokenized = useMemo(() => {
    const raw = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [text];
    let charCursor = 0;
    return raw
      .map((s) => s.trim())
      .filter(Boolean)
      .map((sentence) => {
        const charStart = text.indexOf(sentence, charCursor);
        const start = charStart >= 0 ? charStart : charCursor;
        const end = start + sentence.length;
        charCursor = end;
        return {
          sentence,
          charStart: start,
          charEnd: end,
          words: sentence.split(/(\s+)/).map((token) => {
            if (/^\s+$/.test(token)) {
              return { token, isWhitespace: true as const, clean: '' };
            }
            return {
              token,
              isWhitespace: false as const,
              clean: token.replace(/[^a-zA-Z'-]/g, '').toLowerCase(),
            };
          }),
        };
      });
  }, [text]);

  // Build the paragraph children with the MINIMUM number of
  // RNText nodes needed for highlights. The old implementation
  // wrapped every single word in its own RNText so each could
  // have an onPress handler, but that meant ~200 nodes per
  // paragraph × ~50 paragraphs per page × ~11 mounted pages =
  // ~110k React fibers, and FlatList's "VirtualizedList: slow
  // to update" warnings (1-2 second frame deltas during scroll)
  // were entirely about the cost of mounting those fibers.
  //
  // New strategy:
  //   1. Plain strings for runs of non-highlighted words. No
  //      RNText nodes, no fiber overhead.
  //   2. RNText wrappers only for words that need a tint
  //      (currently tapped, or saved by the user).
  //   3. Sentence wrappers only if a sentence is highlighted
  //      (currently selected via long-press, or saved). Otherwise
  //      sentences just contribute their text to the paragraph.
  //
  // Per-word tap interaction is now handled by a single
  // paragraph-level Pressable below (via tap coordinates against
  // the line frames from onTextLayout). Same for sentence
  // long-press. Component count per paragraph drops from ~200 to
  // ~5–10, which is the level we need for smooth scroll.
  const children = useMemo(() => {
    const out: Array<string | React.ReactNode> = [];
    let key = 0;
    for (let si = 0; si < tokenized.length; si++) {
      const sentence = tokenized[si]!;
      const isSelected = selectedSentence === sentence.sentence;
      const isSavedSentence = savedSentences.has(sentence.sentence);
      const sentenceStyle = isSelected
        ? styles.sentenceHighlight
        : isSavedSentence
        ? styles.sentenceSaved
        : null;

      const sentenceChildren: Array<string | React.ReactNode> = [];
      let runBuffer = '';
      const flushRun = () => {
        if (runBuffer) {
          sentenceChildren.push(runBuffer);
          runBuffer = '';
        }
      };
      for (const w of sentence.words) {
        if (w.isWhitespace) {
          runBuffer += w.token;
          continue;
        }
        const isTapped = w.clean.length > 1 && w.clean === tl;
        const isSavedWord =
          w.clean.length > 1 && savedWords.has(w.clean);
        if (isTapped || isSavedWord) {
          flushRun();
          sentenceChildren.push(
            <RNText
              key={`w-${key++}`}
              style={isTapped ? styles.wordTapped : styles.wordSaved}
            >
              {w.token}
            </RNText>,
          );
        } else {
          runBuffer += w.token;
        }
      }
      flushRun();

      if (sentenceStyle) {
        out.push(
          <RNText key={`s-${key++}`} style={sentenceStyle}>
            {sentenceChildren}
          </RNText>,
        );
      } else {
        // Sentence has no highlight wrapping — splay its children
        // directly into the paragraph so we skip an unnecessary
        // RNText layer.
        for (const c of sentenceChildren) out.push(c);
      }
      if (si < tokenized.length - 1) out.push(' ');
    }
    return out;
  }, [tokenized, tl, savedWords, savedSentences, selectedSentence]);

  // Tap-coordinate machinery. linesRef holds the per-line layout
  // frames captured by onTextLayout. The paragraph-level press
  // handlers use those frames to map a tap coordinate back to a
  // word / sentence in the original text.
  const linesRef = useRef<
    ReadonlyArray<{
      x: number;
      y: number;
      width: number;
      height: number;
      text?: string;
    }>
  >([]);

  const sentenceRanges = useMemo(
    () =>
      tokenized.map((s) => ({
        sentence: s.sentence,
        charStart: s.charStart,
        charEnd: s.charEnd,
      })),
    [tokenized],
  );

  return (
    <Pressable
      style={styles.paragraph}
      onPress={(e) => {
        const word = findTappedToken(
          e.nativeEvent.locationX,
          e.nativeEvent.locationY,
          linesRef.current,
        );
        if (word) onWordPress(word);
      }}
      onLongPress={(e) => {
        const sentence = findTappedSentence(
          e.nativeEvent.locationX,
          e.nativeEvent.locationY,
          linesRef.current,
          sentenceRanges,
        );
        if (sentence) onSentenceLongPress(sentence);
      }}
    >
      <RNText
        style={[
          {
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            lineHeight: style.fontSize * 1.78,
            color: style.color,
          },
        ]}
        onTextLayout={(e) => {
          linesRef.current = e.nativeEvent.lines;
        }}
      >
        {children}
      </RNText>
    </Pressable>
  );
}

/**
 * Memoised paragraph. The custom comparator skips re-renders when
 * a state change (tappedWord / selectedSentence) doesn't actually
 * affect this paragraph's appearance — typically 95%+ of paragraphs
 * on a long page, since only one paragraph contains the tapped
 * word at a time. See `paragraphContainsWord` above for the
 * motivation.
 *
 * Other props (`savedWords`, `savedSentences`, `style`,
 * `onWordPress`, `onSentenceLongPress`) are stable by reference up
 * the tree: the callbacks are useCallback'd in ReaderScreen, the
 * saved-* sets come from a hook that returns the same Set across
 * renders unless contents change, and the style object is rebuilt
 * by PageSection only when font/theme actually shifts. So a plain
 * `===` check suffices for those.
 */
const TappableParagraph = memo(
  TappableParagraphImpl,
  (prev, next) => {
    // Fast-path: prop identity. If nothing changed at all, skip.
    if (
      prev.text === next.text &&
      prev.tappedWord === next.tappedWord &&
      prev.selectedSentence === next.selectedSentence &&
      prev.savedWords === next.savedWords &&
      prev.savedSentences === next.savedSentences &&
      prev.onWordPress === next.onWordPress &&
      prev.onSentenceLongPress === next.onSentenceLongPress &&
      prev.style === next.style
    ) {
      return true;
    }
    // Text or style change → always re-render. Same for the saved
    // sets (they affect highlight colors), and callback identity
    // changes (rare but bail to be safe).
    if (
      prev.text !== next.text ||
      prev.style !== next.style ||
      prev.savedWords !== next.savedWords ||
      prev.savedSentences !== next.savedSentences ||
      prev.onWordPress !== next.onWordPress ||
      prev.onSentenceLongPress !== next.onSentenceLongPress
    ) {
      return false;
    }
    // Selected sentence: only matters if the old or new selection
    // is a sentence inside THIS paragraph.
    if (prev.selectedSentence !== next.selectedSentence) {
      const wasIn =
        !!prev.selectedSentence && prev.text.includes(prev.selectedSentence);
      const isIn =
        !!next.selectedSentence && next.text.includes(next.selectedSentence);
      if (wasIn || isIn) return false;
    }
    // Tapped word: only matters if the old or new tapped word is
    // a real word in this paragraph. This is the big win.
    if (prev.tappedWord !== next.tappedWord) {
      const wasIn = paragraphContainsWord(prev.text, prev.tappedWord);
      const isIn = paragraphContainsWord(next.text, next.tappedWord);
      if (wasIn || isIn) return false;
    }
    return true;
  },
);

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

function countWordsLocal(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Three-letter part-of-speech abbreviation for the popover gutter.
 * Falls back to a generic label so we always have something to render.
 */
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

  // Continuous-scroll reader
  pagerWrap: {
    flex: 1,
    position: 'relative',
  },
  // Loading overlay shown during scroll-to-saved-page so the
  // user sees a clean "finding your page" state instead of the
  // FlatList visibly scrolling through intermediate pages.
  restoreOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  restoreOverlayLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
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
  headerActions: {
    flexDirection: 'row',
    gap: 2,
    flexShrink: 0,
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
  // Persistent vocab marker. Previously was rgba(...0.28) — that
  // looked invisible against the cream reader background, and
  // testers reported saved words appeared not to be highlighted
  // at all. Bumped to 0.55 so the tint clearly reads as "saved"
  // without being as loud as the active-tap amber.
  wordSaved: {
    backgroundColor: 'rgba(255, 200, 80, 0.55)',
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

  // (Progress-zone styles removed alongside the bottom page
  // tracker UI — see the corresponding comment near the old JSX
  // for the why.)

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
  // the two highlight kinds read as one visual language. Bumped from
  // 0.22 → 0.45 alongside wordSaved so the highlight is clearly
  // visible against the cream reader background.
  sentenceSaved: {
    backgroundColor: 'rgba(255, 200, 80, 0.45)',
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
