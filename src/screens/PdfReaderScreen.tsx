/**
 * PdfReaderScreen — native PDF rendering via react-native-pdf.
 *
 * Trade-off (intentional): PDFs are rendered as the original file with
 * full fidelity (layout, fonts, embedded images). The EPUB paginated
 * text reader's per-word features — dictionary popover, sentence
 * highlight, saved vocabulary — don't apply here because we're showing
 * rendered pages, not text spans. Reading-session tracking still works
 * (we know book_id + page count).
 *
 * Source: a signed URL on the private `books` bucket pointing to the
 * uploaded `original.pdf`. URLs expire on a TTL; we sign for a generous
 * window and refresh on remount, which is plenty for typical reading
 * sessions.
 *
 * State persisted: `last_read_chapter` carries the current page (we
 * repurpose the column rather than add a per-format `last_read_page`
 * since the data shape is the same); `last_read_at` updates on debounce.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import {
  BottomSheet,
  ModeTogglePill,
  type BottomSheetRef,
  Icon,
  Text,
} from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import { supabase } from '~/lib/supabase';
import { persistReadingPosition } from '~/lib/useBookChapters';
import { useBackHandler } from '~/lib/useBackHandler';
import { useReadingSession } from '~/lib/readingSessions';
import {
  AIToolsSheet,
  ChatScreen,
  SummaryScreen,
} from '~/screens/AIToolsScreen';
import { PracticeQuestionsScreen } from '~/screens/PracticeQuestionsScreen';
import { TranslateChapterScreen } from '~/screens/TranslateChapterScreen';
import { HighlightsScreen } from '~/screens/HighlightsScreen';
import { BookSearchScreen } from '~/screens/BookSearchScreen';
import { ReaderScreen } from '~/screens/ReaderScreen';

export type PdfReaderScreenProps = {
  book: Book;
  onBack: () => void;
  /** Optional jump to the audio listen mode for this book. */
  onListen?: () => void;
};

const PDF_SIGNED_URL_TTL_S = 60 * 60; // 1 hour
// Refresh 10 min before the TTL so we never hand a URL that's about
// to expire mid-read to the native PDF view.
const PDF_URL_CACHE_REFRESH_MS = (PDF_SIGNED_URL_TTL_S - 10 * 60) * 1000;

/**
 * Module-level cache keyed by book id. Re-opening a PDF the user has
 * opened in this session before skips the Supabase signed-URL round-
 * trip entirely (~200–500ms on a slow network), AND lets
 * react-native-pdf hit its own URL-keyed file cache because the URL
 * is byte-for-byte identical. Without this cache, every mount got a
 * fresh signed URL and the PDF was re-downloaded.
 *
 * Lives outside the component so it survives unmount + remount as
 * the user navigates Library → Reader → Library → Reader. Capped
 * loosely at 50 entries (LRU via insertion order) so libraries with
 * hundreds of PDFs can't make the map grow without bound.
 */
const pdfUrlCache = new Map<string, { url: string; signedAt: number }>();
const PDF_URL_CACHE_MAX = 50;

function getCachedPdfUrl(bookId: string): string | null {
  const entry = pdfUrlCache.get(bookId);
  if (!entry) return null;
  if (Date.now() - entry.signedAt > PDF_URL_CACHE_REFRESH_MS) {
    pdfUrlCache.delete(bookId);
    return null;
  }
  return entry.url;
}

function rememberPdfUrl(bookId: string, url: string): void {
  if (pdfUrlCache.has(bookId)) pdfUrlCache.delete(bookId);
  pdfUrlCache.set(bookId, { url, signedAt: Date.now() });
  if (pdfUrlCache.size > PDF_URL_CACHE_MAX) {
    const oldest = pdfUrlCache.keys().next().value;
    if (oldest !== undefined) pdfUrlCache.delete(oldest);
  }
}

export function PdfReaderScreen({ book, onBack, onListen }: PdfReaderScreenProps) {
  // Android hardware-back routes through the header chevron's onBack
  // (Library). Without this the user lands on the root "Press back
  // again to exit" handler, which is wrong for a sub-screen.
  useBackHandler(() => {
    onBack();
    return true;
  });
  const screen = Dimensions.get('window');
  // Explicit safe-area insets so absolute-positioned chrome can pad
  // itself off the status bar / home indicator. Nesting SafeAreaViews
  // inside an absolute-positioned parent doesn't apply the inset
  // because react-native-safe-area-context's "remaining" propagation
  // sees the outer SafeAreaView as already having consumed it; the
  // outer's padding is on the BORDER box, not the absolute child.
  const insets = useSafeAreaInsets();

  // Sheet refs for the four extra-features (Listen / AI tools / Chapters /
  // Highlights). Each is the same component the EPUB reader uses, so the
  // sheets are visually identical across formats.
  const aiSheetRef = useRef<BottomSheetRef>(null);
  // Reading options sheet — replaces the prior chapter list. PDFs have
  // few customisable options today (no font / theme since the rendering
  // is fixed); the sheet is a placeholder so the action bar slot is
  // consistent across readers. We can flesh it out with PDF-specific
  // toggles (continuous vs single-page, brightness wash) later.
  const readingOptionsSheetRef = useRef<BottomSheetRef>(null);
  const [aiMode, setAIMode] = useState<'summary' | 'chat' | 'practice' | 'translate' | null>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  // "Aa" / Text mode: swaps the rendered PDF view for the paginated text
  // reader on the same chapter. Lets the user tap-look-up words, long-
  // press-translate sentences, and save highlights — none of which work
  // on rendered PDF pages because we have no text-coordinate mapping.
  // Same affordance Apple Books gives for some PDFs.
  const [textMode, setTextMode] = useState(false);

  // Real chapter list from Supabase. We fetch it whether or not the user
  // opens the chapter sheet — the cost is one cheap query — so the
  // chapter→PDF-page jump approximation has the chapter count it needs.

  // The pdf-source URL. Resolved once on mount; if the user is on the
  // reader for >1 h the URL would expire mid-read. Acceptable for
  // first cut — we can refresh on near-expiry later if needed.
  //
  // Seed from the module-level cache so repeat opens of the same
  // book skip the signing round-trip and the native PDF view can
  // immediately hit its on-disk cache for the (unchanged) URL.
  const [pdfUri, setPdfUri] = useState<string | null>(() =>
    getCachedPdfUrl(book.id),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  // Initial page: persisted last_read_chapter (we repurpose the column
  // for PDFs as "last page"). Defaults to 1 — the column is 0-indexed
  // for chapters but we shift by 1 because PDF pages are 1-indexed.
  const initialPage = Math.max(
    1,
    (book as { last_read_page?: number }).last_read_page || 1,
  );
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(book.totalPages ?? 0);

  // The `<Pdf page>` prop is decoupled from `currentPage` to keep
  // user-driven swipes butter-smooth on Android. When the user
  // swipes, react-native-pdf fires `onPageChanged` → we update
  // `currentPage` for the header / progress / persistence → that
  // re-renders the JSX. If we passed `page={currentPage}` straight
  // through, the native PDF view would see "navigate to N" on every
  // swipe (where N is the page it already snapped to), causing a
  // mid-gesture stutter on Android specifically (PdfRenderer
  // recomputes layout on every prop change; iOS PDFKit short-
  // circuits identical values).
  //
  // `pdfNavTarget` holds the page WE want the native view to show.
  // It's only set on initial mount and on explicit jumps
  // (ChapterSheet pick, etc.) — never during user swipes. The
  // counter forces a re-render even when the page value happens to
  // match the current scroll position, so re-jumps to the same
  // page still work.
  const [pdfNavTarget, setPdfNavTarget] = useState<{ page: number; nonce: number }>({
    page: initialPage,
    nonce: 0,
  });
  const jumpToPdfPage = useCallback((page: number) => {
    setPdfNavTarget((prev) => ({ page, nonce: prev.nonce + 1 }));
    setCurrentPage(page);
  }, []);

  // Auto-hide chrome — same affordance as the EPUB reader, so the user
  // can tap-anywhere to surface the back button + page indicator.
  //
  // Note: `chromeVisible` is state (not a ref) on purpose. We use it
  // to drive `pointerEvents` on the chrome containers, and that prop
  // is read at render time — a ref would let the value go stale (e.g.
  // when an unrelated re-render captures the post-auto-hide value
  // before the next showChrome flips it back). That bug manifested as
  // the back button silently no-op'ing because `pointerEvents='none'`
  // had been baked in by a stale render.
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  // Mirror chromeVisible into a ref so the toggle callback below
  // reads the latest value without becoming a dep of itself. Stays
  // synced because we assign on every render.
  const chromeVisibleRef = useRef(true);
  chromeVisibleRef.current = chromeVisible;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showChrome = useCallback(() => {
    setChromeVisible(true);
    Animated.timing(chromeOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setChromeVisible(false);
      Animated.timing(chromeOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }, 3500);
  }, [chromeOpacity]);
  // Imperative hide. Tapping while chrome is visible should
  // dismiss it immediately rather than wait for the auto-hide
  // timer, so the toggle feels symmetrical and the user can
  // reclaim screen real-estate on demand.
  const hideChrome = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setChromeVisible(false);
    Animated.timing(chromeOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [chromeOpacity]);
  // Single-tap anywhere on the PDF toggles chrome visibility.
  // Previously the only way to summon chrome was a tiny 56-pt strip
  // at the bottom of the screen, which testers consistently missed.
  // react-native-pdf's `onPageSingleTap` fires reliably and doesn't
  // interfere with horizontal swipe / pinch-zoom, so it's the right
  // hook for this.
  const toggleChrome = useCallback(() => {
    if (chromeVisibleRef.current) {
      hideChrome();
    } else {
      showChrome();
    }
  }, [hideChrome, showChrome]);

  useEffect(() => {
    showChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showChrome]);

  // Sign the storage URL. We always look up the auth uid + build the
  // path rather than trusting a passed-in path — the storage layout
  // convention is `{user_id}/{book_id}/original.{ext}`.
  //
  // Cache hit: useState above already seeded pdfUri from the
  // module-level cache, so this effect's only job is the slow path
  // (cold open or expired cache entry). Bailing early avoids
  // double-signing and stays out of react-native-pdf's way during
  // its initial layout pass.
  useEffect(() => {
    if (getCachedPdfUrl(book.id)) return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setLoadError('You need to be signed in.');
          return;
        }
        const path = `${user.id}/${book.id}/original.pdf`;
        const { data, error } = await supabase.storage
          .from('books')
          .createSignedUrl(path, PDF_SIGNED_URL_TTL_S);
        if (cancelled) return;
        if (error || !data?.signedUrl) {
          setLoadError(error?.message ?? 'Could not load the PDF.');
          return;
        }
        rememberPdfUrl(book.id, data.signedUrl);
        setPdfUri(data.signedUrl);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load the PDF.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Persist current page to `books.last_read_chapter` on a debounce
  // (1.5 s). Same pattern as the EPUB reader — discrete state changes,
  // small write rate, but a debounce protects against a user thumb-
  // drumming through pages.
  useEffect(() => {
    if (currentPage <= 0) return;
    const id = setTimeout(() => {
      void persistPdfPosition(book.id, currentPage);
    }, 1500);
    return () => clearTimeout(id);
  }, [book.id, currentPage]);

  // Reading-session row: same hook the EPUB reader uses. We pass page-
  // count metadata so word-read estimates have something to multiply
  // against; for a PDF we don't really know words-per-page, so we use
  // a coarse estimate (book.totalPages × 250 words/page average), and
  // rely on duration_seconds as the primary stat anyway.
  //
  // The progress-fraction ref is updated in a layout effect (post-
  // commit) instead of at render time. The previous render-time
  // write tripped React's "side effect in render" rule and would
  // misbehave under concurrent rendering when the render is
  // discarded without committing.
  const progressFractionRef = useRef(0);
  useEffect(() => {
    progressFractionRef.current =
      totalPages > 0 ? Math.min(1, currentPage / totalPages) : 0;
  }, [currentPage, totalPages]);
  useReadingSession({
    bookId: book.id,
    pageIndex: 0,
    pageId: null,
    pageWordCount: totalPages * 250,
    getProgress: () => progressFractionRef.current,
  });

  const pdfSource = useMemo(
    () => (pdfUri ? { uri: pdfUri, cache: true } : null),
    [pdfUri],
  );
  // Memoised style object so the Pdf component doesn't see a fresh
  // style reference every render — RN's diff would otherwise hand
  // a "new style" to the native view on every parent re-render
  // (state ticks, chrome animations, etc.), and on Android that
  // forces a layout pass that can pre-empt the swipe gesture.
  const pdfStyle = useMemo(
    () => [styles.pdf, { width: screen.width, height: screen.height }],
    [screen.width, screen.height],
  );
  // Last-shown timestamp for showChrome throttling. The native PDF
  // view fires `onPageChanged` quickly during a fast swipe; without
  // throttling we'd kick off an Animated.timing per page tick and
  // each one steals a few JS-thread frames from the gesture.
  const lastChromeShownRef = useRef(0);
  const showChromeThrottled = useCallback(() => {
    const now = Date.now();
    if (now - lastChromeShownRef.current < 400) return;
    lastChromeShownRef.current = now;
    showChrome();
  }, [showChrome]);

  // AI tools open as full-screen modals over the reader, same pattern
  // the EPUB reader uses. Returning early swaps the entire reader UI
  // for the tool — back from the tool returns here at the same page.
  if (aiMode === 'summary') {
    // Map the user's current PDF page (1-based) to the corresponding DB
    // page index proportionally. Each PDF page produces ~ totalDbPages/
    // totalPdfPages DB-page slices on ingest; this picks the first
    // slice from the current PDF page, which is good enough for the
    // single-page summary (Step 5 will let the user select a range).
    const pdfPages = totalPages || 1;
    const dbPages = book.totalPages ?? 0;
    const estimatedPageIndex =
      dbPages > 0
        ? Math.min(
            dbPages - 1,
            Math.max(0, Math.floor(((currentPage - 1) / pdfPages) * dbPages)),
          )
        : 0;
    return (
      <SummaryScreen
        book={book}
        pageIndex={estimatedPageIndex}
        onBack={() => setAIMode(null)}
      />
    );
  }
  if (aiMode === 'chat') {
    return <ChatScreen book={book} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'practice' || aiMode === 'translate') {
    // Same PDF-page → DB-page mapping as the Summary path so the
    // tool operates on the slice the user is currently viewing.
    const pdfPages = totalPages || 1;
    const dbPages = book.totalPages ?? 0;
    const estimatedPageIndex =
      dbPages > 0
        ? Math.min(
            dbPages - 1,
            Math.max(0, Math.floor(((currentPage - 1) / pdfPages) * dbPages)),
          )
        : 0;
    if (aiMode === 'practice') {
      return (
        <PracticeQuestionsScreen
          book={book}
          pageIndex={estimatedPageIndex}
          onBack={() => setAIMode(null)}
        />
      );
    }
    return (
      <TranslateChapterScreen
        book={book}
        pageIndex={estimatedPageIndex}
        onBack={() => setAIMode(null)}
      />
    );
  }
  if (showHighlights) {
    return (
      <HighlightsScreen
        book={book}
        onClose={() => setShowHighlights(false)}
        onJumpToPage={(pageIndex) => {
          setShowHighlights(false);
          // page_index in DB is 0-based DB-page index. We approximate
          // the corresponding PDF page proportionally; an exact mapping
          // would use pages.pdf_page_number, which is a follow-up.
          const total = book.totalPages || totalPages || 1;
          const dbPages = book.totalPages || 1;
          const targetPage = Math.max(
            1,
            Math.min(total, Math.round(((pageIndex + 1) / dbPages) * total)),
          );
          // Imperative jump from the Highlights drill-in — must
          // route through jumpToPdfPage so `pdfNavTarget` updates
          // and the native PDF view actually navigates. A bare
          // setCurrentPage wouldn't propagate to the Pdf prop now
          // that the controlled-page is decoupled.
          jumpToPdfPage(targetPage);
        }}
      />
    );
  }
  if (showSearch) {
    return (
      <BookSearchScreen
        book={book}
        onClose={() => setShowSearch(false)}
        onJumpToPage={(pageIndex) => {
          setShowSearch(false);
          // Same DB-page → PDF-page proportional jump as Highlights.
          const totalPdf = totalPages || 1;
          const dbPages = book.totalPages || 1;
          const targetPage = Math.max(
            1,
            Math.min(
              totalPdf,
              Math.round(((pageIndex + 1) / dbPages) * totalPdf),
            ),
          );
          jumpToPdfPage(targetPage);
        }}
      />
    );
  }
  // Text mode: render the paginated text reader rooted at the page that
  // maps to the current PDF page. onBack returns to PDF mode rather
  // than closing the reader entirely, so the user can flip back and
  // forth between original-layout and text-interaction views.
  if (textMode) {
    const totalDbPages = book.totalPages ?? 0;
    const estimatedChapterIdx =
      totalPages > 0 && totalDbPages > 0
        ? Math.min(
            totalDbPages - 1,
            Math.floor(((currentPage - 1) / Math.max(1, totalPages)) * totalDbPages),
          )
        : 0;
    return (
      <ReaderScreen
        book={book}
        initialPageIndex={estimatedChapterIdx}
        // Back from the text view goes all the way back to the
        // library, not just to the PDF intermediate. The user pressed
        // back to leave the book; making them tap twice (text → PDF →
        // library) was needless friction.
        onBack={onBack}
        // The Full/Text pill is how the user toggles between the two
        // renderers without leaving the book. Tapping "Full" flips
        // back to native PDF rendering.
        onRequestFullMode={() => setTextMode(false)}
        onListen={onListen}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <View style={styles.pdfArea}>
        {pdfSource ? (
          <Pdf
            source={pdfSource}
            // `pdfNavTarget.page` only changes on initial mount and
            // explicit jumps (ChapterSheet, etc.) — never on user
            // swipes. That keeps the prop stable during gesture-
            // driven page changes so the native view doesn't try to
            // re-snap to a page it's already at. See the comment on
            // `pdfNavTarget` for the full reasoning.
            page={pdfNavTarget.page}
            onLoadComplete={(pages) => {
              if (pages > 0) setTotalPages(pages);
            }}
            onPageChanged={(page) => {
              // User-driven page change: update `currentPage` (for
              // header / persistence / AI tools) but do NOT touch
              // `pdfNavTarget` — that's reserved for OUR
              // imperative jumps and stays stable here.
              setCurrentPage(page);
              showChromeThrottled();
            }}
            onError={(error) => {
              const msg =
                error instanceof Error ? error.message : 'Could not display this PDF.';
              setLoadError(msg);
            }}
            onPressLink={() => {
              // We don't follow embedded links yet — surface the chrome
              // so the user gets back the toolbar instead.
              showChrome();
            }}
            onPageSingleTap={() => toggleChrome()}
            onLoadProgress={() => showChromeThrottled()}
            trustAllCerts={false}
            enablePaging
            horizontal
            // Annotations off — none of our content is annotated,
            // and the renderer skipping that pass measurably tightens
            // the swipe on Android.
            enableAnnotationRendering={false}
            spacing={8}
            style={pdfStyle}
          />
        ) : loadError ? (
          <View style={styles.errorWrap}>
            <Icon
              name="X"
              size={20}
              color={tokens.colors.error}
              strokeWidth={2}
            />
            <Text style={styles.errorTitle}>Could not open this PDF</Text>
            <Text style={styles.errorBody}>{loadError}</Text>
          </View>
        ) : (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
            <Text style={styles.loadingLabel}>Loading…</Text>
          </View>
        )}
      </View>

      {/* Top chrome — matches the text-mode reader header: light
          palette background, back arrow, book title, Full/Text pill.
          The page indicator and search live in the bottom chrome
          alongside the other actions so the two modes feel like the
          same surface viewed two ways. */}
      <Animated.View
        style={[
          styles.topChrome,
          { opacity: chromeOpacity, paddingTop: insets.top },
        ]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            hitSlop={8}
            style={styles.backBtn}
          >
            <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} />
          </Pressable>
          <View style={styles.topCenter}>
            <Text style={styles.topTitle} numberOfLines={1}>
              {book.title}
            </Text>
          </View>
          <View style={styles.topRight}>
            <ModeTogglePill
              mode={textMode ? 'text' : 'full'}
              onChange={(m) => setTextMode(m === 'text')}
            />
          </View>
        </View>
      </Animated.View>

      {/* Progress strip — thin row between content and the action bar
          showing the current page and the bar. Mirrors the
          progress + page label that ReaderScreen renders for text
          mode, so users see the same affordance in both modes. */}
      <Animated.View
        style={[
          styles.progressZone,
          { opacity: chromeOpacity },
        ]}
        pointerEvents="none"
      >
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${
                  totalPages > 0
                    ? Math.min(100, Math.round((currentPage / totalPages) * 100))
                    : 0
                }%`,
              },
            ]}
          />
        </View>
        <View style={styles.progressMeta}>
          <Text style={styles.progressText}>
            Page {currentPage} of {totalPages || '–'}
          </Text>
        </View>
      </Animated.View>

      {/* Bottom action bar — five actions matching the text-mode
          reader: Listen / AI tools / Search / Highlights / Reading
          options. Light palette so the two modes look like the same
          reader, not two separate apps. */}
      <Animated.View
        style={[
          styles.bottomChrome,
          { opacity: chromeOpacity, paddingBottom: insets.bottom },
        ]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <View style={styles.actionBar}>
          <ActionItem
            icon="Headphones"
            label="Listen"
            primary
            onPress={onListen}
          />
          <ActionItem
            icon="Wand"
            label="AI tools"
            onPress={() => aiSheetRef.current?.present()}
          />
          <ActionItem
            icon="Search"
            label="Search"
            onPress={() => setShowSearch(true)}
          />
          <ActionItem
            icon="Notebook"
            label="Highlights"
            onPress={() => setShowHighlights(true)}
          />
          <ActionItem
            icon="Settings"
            label="Reading options"
            onPress={() => readingOptionsSheetRef.current?.present()}
          />
        </View>
      </Animated.View>

      {/* The old `tapToShow` Pressable was a 56-pt bottom strip used
          to summon the chrome back. That's been replaced by
          `onPageSingleTap` on the Pdf component, which fires for any
          tap anywhere on the page and toggles chrome visibility
          (show when hidden, hide when shown). Same affordance the
          user expects from Apple Books / Kindle. */}

      {/* Sheets */}
      <AIToolsSheet
        ref={aiSheetRef}
        book={book}
        // Map the user's current PDF page → DB page index so the
        // sheet's "Page N · {title}" label matches the page they're
        // looking at, not the persisted last-read.
        pageIndex={(() => {
          const pdfPages = totalPages || 1;
          const dbPages = book.totalPages ?? 0;
          return dbPages > 0
            ? Math.min(
                dbPages - 1,
                Math.max(0, Math.floor(((currentPage - 1) / pdfPages) * dbPages)),
              )
            : 0;
        })()}
        onSummarize={() => setAIMode('summary')}
        onPractice={() => setAIMode('practice')}
        onAsk={() => setAIMode('chat')}
        onTranslate={() => setAIMode('translate')}
      />
      <BottomSheet ref={readingOptionsSheetRef}>
        <PdfReadingOptionsSheet />
      </BottomSheet>
    </SafeAreaView>
  );
}

/**
 * Placeholder reading-options sheet for the PDF reader. The native PDF
 * view doesn't expose font/theme/spacing the way the text reader does,
 * so this sheet's job is mostly to point the user at text-mode if they
 * want fine-grained typography control. Future iterations can add
 * PDF-specific options (continuous-vs-page mode, brightness wash).
 */
function PdfReadingOptionsSheet() {
  return (
    <View style={readingOptionsStyles.wrap}>
      <Text style={readingOptionsStyles.title}>Reading options</Text>
      <Text style={readingOptionsStyles.body}>
        Font, size, and theme settings apply to text mode. Tap{' '}
        <Text style={readingOptionsStyles.bodyEm}>Text</Text> at the top
        of the reader to switch — your typography preferences carry over.
      </Text>
    </View>
  );
}

const readingOptionsStyles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 28,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 8,
  },
  body: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 20,
    color: tokens.textColors.muted,
  },
  bodyEm: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
});

function ActionItem({
  icon,
  label,
  primary,
  onPress,
}: {
  icon: 'Headphones' | 'Wand' | 'Search' | 'Notebook' | 'Settings';
  label: string;
  primary?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.actionItem}
      disabled={!onPress}
    >
      <View
        style={[
          styles.actionIcon,
          primary ? styles.actionIconPrimary : styles.actionIconSecondary,
          !onPress && { opacity: 0.4 },
        ]}
      >
        <Icon
          name={icon}
          size={18}
          color={primary ? tokens.colors.cream[50] : tokens.textColors.primary}
        />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

async function persistPdfPosition(bookId: string, page: number) {
  try {
    // Reuse the existing helper so any future cross-format changes
    // (e.g. updating last_read_at) live in one place. We pass position=0
    // because PDFs don't have a within-page position; the page index
    // alone is enough.
    await persistReadingPosition({
      bookId,
      pageIndex: page,
      position: 0,
    });
  } catch (err) {
    // persistReadingPosition already logs; nothing else to do.
    void err;
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  pdfArea: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  pdf: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  errorTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginTop: 8,
  },
  errorBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },

  // Top chrome — light palette to match the text-mode reader header.
  // The two modes look like the same surface viewed two ways.
  topChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bgColors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'flex-start',
    paddingLeft: 4,
    paddingRight: 8,
  },
  topTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  // Progress strip — page count + thin bar above the action bar.
  // Mirrors what the text-mode reader shows so both modes carry the
  // same orientation cue.
  progressZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 78,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
    gap: 6,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.bgColors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: tokens.colors.forest[800],
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
  },

  tapToShow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 56,
  },

  // Bottom chrome (action bar) — light, matching the text-mode reader.
  bottomChrome: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
  },
  // Bottom action bar — kept in lockstep with the text-mode
  // ReaderScreen.tsx and EpubFullReaderScreen so the toolbar feels
  // identical whether the user is reading a PDF, EPUB-text, or
  // EPUB-full. Any visual tweak should land in all three.
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: tokens.space.xl,
    paddingHorizontal: tokens.space.lg,
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
  actionIconSecondary: {
    backgroundColor: tokens.bgColors.surface,
  },
  actionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
});
