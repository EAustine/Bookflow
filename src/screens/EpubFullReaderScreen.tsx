/**
 * EpubFullReaderScreen — "Full" reading mode for EPUBs.
 *
 * Renders the publisher's original HTML for the entire book inside a
 * scrollable WebView. This preserves images, headings, bold/italic,
 * lists, blockquotes, and any inline-styled passages — what makes an
 * EPUB "look like a book". Per-word features (dictionary popover,
 * sentence translate, save highlight) only exist in text mode; the
 * toggle in the header switches between the two.
 *
 * Architecture (post chapters→pages migration):
 *   - The DB stores 200-word "pages" but `html_content` is set only on
 *     the first page of each spine item (the rest are sub-slices of
 *     the same authored chunk).
 *   - Full mode therefore loads ALL pages with non-null `html_content`
 *     in one query, concatenates them with section dividers, resolves
 *     `[[BOOKFLOW_IMG:<path>]]` markers to signed URLs once, and lets
 *     the WebView scroll continuously — closer to how Apple Books
 *     handles re-flowable EPUB content. Page-by-page navigation isn't
 *     a meaningful concept in this mode (the publisher's HTML doesn't
 *     have native pages), so the chevrons / page counter from text
 *     mode aren't shown here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import {
  BottomSheet,
  ModeTogglePill,
  type BottomSheetRef,
  Icon,
  Text,
} from '~/components';
import { tokens } from '~/design/tokens';
import { useBackHandler } from '~/lib/useBackHandler';
import { useSlowOp } from '~/hooks/useSlowOp';
import { SlowNetworkBanner } from '~/components/SlowNetworkBanner';
import type { Book } from '~/types/book';
import { formatNetworkError } from '~/lib/networkErrors';
import { supabase } from '~/lib/supabase';
import { persistReadingPosition, touchLastReadAt } from '~/lib/useBookChapters';
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

export type EpubFullReaderScreenProps = {
  book: Book;
  onBack: () => void;
  onListen?: () => void;
  /** Called when the user toggles back to text mode. */
  onRequestTextMode: () => void;
};

const IMAGE_MARKER_RE = /\[\[BOOKFLOW_IMG:([^\]]+)\]\]/g;
const IMG_SIGNED_TTL_S = 60 * 60;

/**
 * In-memory stitched-HTML cache keyed by book id.
 *
 * Building the full-mode HTML for a book is expensive:
 *   1. One Supabase query for every spine row (N pages worth).
 *   2. Parallel signed-URL fetch for every distinct image asset.
 *   3. String concatenation of the whole document.
 *
 * That whole pipeline runs every time the user opens full mode,
 * even when they just closed it 30 seconds ago. Caching the
 * stitched output in memory lets reopens within the same session
 * skip straight to "feed HTML to WebView", which goes from
 * 1-3 s of staring at the spinner to instant.
 *
 * Cap is intentionally small (3 books) because the cached HTML
 * can be hundreds of KB to several MB per book. LRU by insertion
 * order. The cache is per-session (no disk) because the image
 * signed URLs embedded in the HTML have a 1-hour TTL — beyond that
 * window we'd be serving expired URLs.
 */
const epubHtmlCache: Map<string, { html: string; cachedAt: number }> = new Map();
const EPUB_HTML_CACHE_MAX = 3;
const EPUB_HTML_CACHE_REFRESH_MS = (IMG_SIGNED_TTL_S - 5 * 60) * 1000;

function getCachedEpubHtml(bookId: string): string | null {
  const entry = epubHtmlCache.get(bookId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > EPUB_HTML_CACHE_REFRESH_MS) {
    epubHtmlCache.delete(bookId);
    return null;
  }
  return entry.html;
}

function rememberEpubHtml(bookId: string, html: string): void {
  if (epubHtmlCache.has(bookId)) epubHtmlCache.delete(bookId);
  epubHtmlCache.set(bookId, { html, cachedAt: Date.now() });
  if (epubHtmlCache.size > EPUB_HTML_CACHE_MAX) {
    const oldest = epubHtmlCache.keys().next().value;
    if (oldest !== undefined) epubHtmlCache.delete(oldest);
  }
}

export function EpubFullReaderScreen({
  book,
  onBack,
  onListen,
  onRequestTextMode,
}: EpubFullReaderScreenProps) {
  // Android hardware-back routes through the header chevron's onBack
  // so testers land on Library instead of seeing the root "Press back
  // again to exit" toast on this screen.
  useBackHandler(() => {
    onBack();
    return true;
  });
  const insets = useSafeAreaInsets();
  const aiSheetRef = useRef<BottomSheetRef>(null);
  // Reading options replaces the prior chapter list. In full mode the
  // publisher's own CSS controls typography; the sheet is a hint to
  // switch to text mode for fine-grained control.
  const readingOptionsSheetRef = useRef<BottomSheetRef>(null);
  const [aiMode, setAIMode] = useState<'summary' | 'chat' | 'practice' | 'translate' | null>(null);
  const [showHighlights, setShowHighlights] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Auto-hide chrome — same affordance as the other readers. State,
  // not ref: a ref would let `pointerEvents` go stale on subsequent
  // re-renders and silently break the back button (see PdfReaderScreen
  // for the full diagnosis of that bug).
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const [chromeVisible, setChromeVisible] = useState(true);
  // Mirror chromeVisible into a ref so the tap-toggle (driven by a
  // WebView postMessage callback) reads the latest value without
  // needing to be in the message handler's dep list. Stays synced
  // because we assign every render.
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
  const hideChrome = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setChromeVisible(false);
    Animated.timing(chromeOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [chromeOpacity]);
  // Tap behaviour for the WebView bridge: always reveal chrome.
  //
  // Previously this toggled (hide if visible, show if hidden), which
  // testers experienced as "works sometimes" — if the auto-hide timer
  // had just fired (chrome hidden) a tap showed it, but if the user
  // tapped while chrome was still up the same gesture hid it and the
  // 3.5 s auto-hide wasn't long enough to feel like a reliable
  // affordance. Always calling `showChrome()` makes the gesture
  // discoverable: any tap brings the nav back, and the existing
  // auto-hide timer (reset inside `showChrome`) handles fade-out.
  const toggleChrome = useCallback(() => {
    showChrome();
  }, [showChrome]);
  useEffect(() => {
    showChrome();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [showChrome]);

  // Reading session — one row for the whole full-mode visit. We don't
  // know how far the user scrolled inside the WebView (would require an
  // injected script + postMessage), so progress stays at 0 for now.
  // duration_seconds (the primary stats input) is still tracked.
  const progressFractionRef = useRef(0);
  useReadingSession({
    bookId: book.id,
    pageIndex: 0,
    pageId: null,
    pageWordCount: null,
    getProgress: () => progressFractionRef.current,
  });

  // Initial scroll fraction to restore once the WebView reports it has
  // mounted. Read once from the persisted `last_read_position` (0..100
  // integer percent on the books row) and converted to a 0..1 fraction.
  // We don't track changes to last_read_position after this — the user
  // is the source of truth from the moment they enter full mode.
  const initialScrollFraction = useMemo(() => {
    const raw = (book as { last_read_position?: number }).last_read_position;
    if (typeof raw !== 'number') return 0;
    return Math.max(0, Math.min(1, raw / 100));
  }, [book]);

  // Debounced persistence. The injected script posts on every scroll
  // event; we throttle the round-trip to Supabase so a fast scroll
  // doesn't fire a write per frame. 800ms feels right — the user has
  // stopped scrolling but it's fast enough that closing the reader
  // immediately after still captures the position.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Live "page index" estimate for AI tools / metadata. Full-mode
  // rendering doesn't have a real concept of pages — the WebView
  // shows the publisher's HTML as one continuous document — so we
  // approximate by mapping the scroll fraction onto the book's
  // total page count. Drives the AI Tools sheet header so it shows
  // the page the user is currently looking at instead of always
  // saying "Page 1".
  const [livePageIndex, setLivePageIndex] = useState(0);
  const handleScrollMessage = useCallback(
    (fraction: number) => {
      progressFractionRef.current = fraction;
      const total = book.totalPages ?? 0;
      let computedIdx = 0;
      if (total > 0) {
        computedIdx = Math.min(
          total - 1,
          Math.max(0, Math.floor(fraction * total)),
        );
        setLivePageIndex((prev) =>
          prev === computedIdx ? prev : computedIdx,
        );
      }
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
      // Use the computed page index, NOT a hardcoded 0. The
      // previous shape silently reset every reader's saved page
      // to 0 on every WebView scroll. We use Math.floor(fraction
      // * totalPages) as a fair approximation — Full mode has
      // no per-page DOM markers we can hit from the WebView
      // bridge today, so scroll-fraction-to-page is the best
      // mapping we have. Accurate within a page or two for any
      // reasonably-uniform-density book.
      persistTimerRef.current = setTimeout(() => {
        void persistReadingPosition({
          bookId: book.id,
          pageIndex: computedIdx,
          position: fraction,
        });
      }, 800);
    },
    [book.id, book.totalPages],
  );

  // Cancel any pending throttled write whenever the book changes —
  // not just on unmount. Without this, the prior book's 800ms
  // timer could fire after a remount on a different book and
  // overwrite *that* book's last_read_position with the previous
  // book's fraction.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [book.id]);

  // One-shot fetch of every spine item's HTML for the book, concatenated
  // in spine order. Image markers are resolved to signed URLs in one
  // batch so the WebView never has to talk to Supabase. Re-fetches if
  // the book id changes (e.g. user re-processed). Failure surfaces an
  // error state; the user can fall back to text mode.
  //
  // The HTML is seeded from the module-level cache on mount so reopens
  // within the same session skip the entire fetch + stitch pipeline
  // and render instantly. The fresh-fetch path below runs only on
  // cache miss.
  const [resolvedHtml, setResolvedHtml] = useState<string | null>(() =>
    getCachedEpubHtml(book.id),
  );
  const [resolveError, setResolveError] = useState<string | null>(null);
  // hasContent: if we have a cache hit, we know there's content (we
  // wouldn't have cached an empty book). On cold open it starts null
  // and the resolver flips it once the spine query returns.
  const [hasContent, setHasContent] = useState<boolean | null>(() =>
    getCachedEpubHtml(book.id) ? true : null,
  );

  useEffect(() => {
    // Cache hit on this book id — nothing to fetch, the state above
    // is already populated from the cache.
    if (getCachedEpubHtml(book.id)) return;

    let cancelled = false;
    setResolvedHtml(null);
    setResolveError(null);
    setHasContent(null);

    void (async () => {
      try {
        // Pull every page that carries spine HTML (= one row per spine
        // item; the 200-word sub-slices have html_content=null).
        const { data, error } = await supabase
          .from('pages')
          .select('page_index, title, html_content')
          .eq('book_id', book.id)
          .not('html_content', 'is', null)
          .order('page_index', { ascending: true });

        if (cancelled) return;
        if (error) {
          // The catch block below already maps fetch-thrown errors
          // to friendly copy, but Supabase frequently surfaces row-
          // query failures here without throwing — the raw
          // `error.message` would land in the empty-state UI as
          // stack-trace-shaped text. Same mapper for parity.
          console.warn('[EpubFullReader] pages query failed:', error);
          setResolveError(formatNetworkError(error, 'opening this book'));
          return;
        }

        const sections = (data ?? []) as Array<{
          page_index: number;
          title: string | null;
          html_content: string;
        }>;

        if (sections.length === 0) {
          setHasContent(false);
          return;
        }
        setHasContent(true);

        // Resolve every distinct image marker in one batch.
        const paths = new Set<string>();
        for (const s of sections) {
          for (const m of s.html_content.matchAll(IMAGE_MARKER_RE)) paths.add(m[1]);
        }
        const urlByPath = new Map<string, string>();
        await Promise.all(
          [...paths].map(async (path) => {
            const { data: signed, error: signErr } = await supabase.storage
              .from('books')
              .createSignedUrl(path, IMG_SIGNED_TTL_S);
            if (!signErr && signed?.signedUrl) urlByPath.set(path, signed.signedUrl);
          }),
        );
        if (cancelled) return;

        // Stitch spine items together. Each gets a section anchor (so we
        // could later wire jump-to-chapter), an optional <h2> label
        // pulled from the spine title, and a hairline divider between
        // siblings. Image markers swap to the resolved signed URL.
        const stitched = sections
          .map((s, i) => {
            const html = s.html_content.replace(IMAGE_MARKER_RE, (_, p: string) => {
              const url = urlByPath.get(p);
              return url ? `<img src="${url}" alt="" />` : '';
            });
            const heading =
              s.title && !/^chapter\s+\d+$/i.test(s.title.trim())
                ? `<h2 class="spine-title">${escapeHtml(s.title.trim())}</h2>`
                : '';
            const sep = i === 0 ? '' : '<hr class="spine-sep" />';
            return `${sep}<section class="spine-item">${heading}${html}</section>`;
          })
          .join('\n');

        const fullHtml = buildDocument(stitched, book.title);
        rememberEpubHtml(book.id, fullHtml);
        setResolvedHtml(fullHtml);
      } catch (err) {
        if (!cancelled) {
          // Centralised friendly-message mapping. Was an inline
          // branch before this refactor — now lives in
          // `formatNetworkError` so the same offline / timeout /
          // generic copy is used across Reader, PDF reader, AI
          // panels, Library, and Discover.
          console.warn('[EpubFullReader] resolve failed:', err);
          setResolveError(formatNetworkError(err, 'opening this book'));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [book.id, book.title]);

  // Bump `last_read_at` only — so the library's "Continue
  // reading" surface knows this book was just touched, but we
  // DON'T overwrite the user's saved page. The previous shape
  // called persistReadingPosition with pageIndex: 0, which
  // silently destroyed the saved page each time the user opened
  // the book in Full mode (Full mode has no scroll-position
  // bridging from the WebView yet, so we genuinely don't know
  // their current page from this surface).
  useEffect(() => {
    if (resolvedHtml) {
      void touchLastReadAt(book.id);
    }
  }, [book.id, resolvedHtml]);


  // Take-over screens (AI tools, highlights) — same pattern as the
  // other readers. Returning early means the WebView unmounts; on
  // re-entry the same chapter HTML re-resolves (fine — signed URLs
  // are cheap) and the WebView re-renders.
  //
  // pageIndex resolves from the live scroll fraction (see
  // handleScrollMessage). It's an approximation since full-mode HTML
  // doesn't have hard page boundaries, but it gets the AI tools to
  // operate on roughly the slice the user is looking at — much
  // better than always summarising page 1.
  if (aiMode === 'summary') {
    return <SummaryScreen book={book} pageIndex={livePageIndex} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'chat') {
    return <ChatScreen book={book} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'practice') {
    return <PracticeQuestionsScreen book={book} pageIndex={livePageIndex} onBack={() => setAIMode(null)} />;
  }
  if (aiMode === 'translate') {
    return <TranslateChapterScreen book={book} pageIndex={livePageIndex} onBack={() => setAIMode(null)} />;
  }
  if (showHighlights) {
    return (
      <HighlightsScreen
        book={book}
        onClose={() => setShowHighlights(false)}
      />
    );
  }
  if (showSearch) {
    // Full mode renders the entire book in one WebView, so jumping to
    // a specific DB page would require scrolling to the matching
    // section. Without page-anchor IDs in the stitched HTML we don't
    // have a precise target — for now we drop the user back into
    // text mode at the matched page so they can continue from there.
    return (
      <BookSearchScreen
        book={book}
        onClose={() => setShowSearch(false)}
        onJumpToPage={() => {
          setShowSearch(false);
          onRequestTextMode();
        }}
      />
    );
  }

  const showLoadingOverlay = !resolvedHtml && !resolveError && hasContent !== false;
  // Flip to true once the resolve has been pending >5s — tells the
  // user the wait is on the network, not the app.
  const isSlowLoad = useSlowOp(showLoadingOverlay);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      {isSlowLoad && (
        <SlowNetworkBanner label="Loading this book is taking longer than usual — check your connection." />
      )}
      {/*
        The WebView used to be wrapped in a <Pressable onPress={showChrome}>
        so any tap surfaced the toolbar back. That broke two interactions
        at once:
          1. Scrolling — the Pressable's touch-tracking intercepted the
             drag gesture before the WebView's native scroller could
             claim it, so pages wouldn't move.
          2. Toggle — onPress only fires on a tap-end, which doesn't
             reach you when the WebView itself is eating the touch
             after a scroll.

        Fix: drop the wrapper entirely and let the WebView own all
        touch handling. The injected scroll bridge below now also
        listens for tap events inside the document and posts a
        `{ type: 'tap' }` message; RN flips chrome visibility on
        receipt. Same effect, no conflict with scroll.
      */}
      <View style={styles.webviewWrap}>
        {resolvedHtml ? (
          <WebView
            originWhitelist={['*']}
            source={{ html: resolvedHtml }}
            style={styles.webview}
            startInLoadingState={false}
            androidLayerType="hardware"
            setSupportMultipleWindows={false}
            automaticallyAdjustContentInsets={false}
            showsVerticalScrollIndicator
            // Numeric form, not the "normal" string alias. The
            // string alias works on the old Paper renderer (which
            // converts internally) but the new Fabric renderer on
            // Android — enabled in app.json via `newArchEnabled` —
            // enforces strict prop types and throws
            // `ClassCastException: String cannot be cast to Double`
            // on the alias. 0.998 is the documented iOS value that
            // "normal" used to map to.
            decelerationRate={0.998}
            // Restore scroll on first load + post scroll position on
            // every scroll event. The injected script reports the
            // 0..1 fraction so the RN side doesn't need to know the
            // document height. It also posts a `tap` message so RN
            // can toggle the chrome — see buildScrollBridge for the
            // tap-vs-scroll discrimination.
            injectedJavaScript={buildScrollBridge(initialScrollFraction)}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data) as {
                  type: string;
                  fraction?: number;
                };
                if (data.type === 'scroll' && typeof data.fraction === 'number') {
                  handleScrollMessage(data.fraction);
                } else if (data.type === 'tap') {
                  toggleChrome();
                }
              } catch {
                // ignore non-JSON payloads from the WebView
              }
            }}
          />
        ) : showLoadingOverlay ? (
            <View style={styles.statusWrap}>
              <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
              <Text style={styles.statusLabel}>Loading book…</Text>
            </View>
          ) : hasContent === false ? (
            <View style={styles.statusWrap}>
              <Icon
                name="Notebook"
                size={24}
                color={tokens.textColors.muted}
                strokeWidth={1.5}
              />
              <Text style={styles.statusTitle}>No formatted content</Text>
              <Text style={styles.statusBody}>
                This book hasn't been processed for full-mode rendering yet.
                Tap "Text" to read it as plain text, or long-press the book
                in your library and tap "Re-process".
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.switchTextBtn,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={onRequestTextMode}
              >
                <Text style={styles.switchTextLabel}>Switch to text mode</Text>
              </Pressable>
            </View>
          ) : resolveError ? (
            <View style={styles.statusWrap}>
              <Icon name="X" size={20} color={tokens.colors.error} strokeWidth={2} />
              <Text style={styles.statusTitle}>Could not load book</Text>
              <Text style={styles.statusBody}>{resolveError}</Text>
            </View>
          ) : null}
      </View>

      {/* Top chrome — back, book title, mode toggle. */}
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
          <ModeTogglePill mode="full" onChange={(m) => m === 'text' && onRequestTextMode()} />
        </View>
      </Animated.View>

      {/* Bottom action bar — five-item layout matching the text-mode
          reader: Listen / AI tools / Search / Highlights / Reading
          options. Same order, same icons, same primary slot so the
          two modes feel like one surface viewed two ways. */}
      <Animated.View
        style={[
          styles.bottomChrome,
          { opacity: chromeOpacity, paddingBottom: insets.bottom },
        ]}
        pointerEvents={chromeVisible ? 'auto' : 'none'}
      >
        <View style={styles.actionBar}>
          <ActionItem icon="Headphones" label="Listen" primary onPress={onListen} />
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

      {/* Sheets */}
      <AIToolsSheet
        ref={aiSheetRef}
        book={book}
        // Estimated from the WebView scroll fraction so the sheet
        // shows the page the user is currently looking at.
        pageIndex={livePageIndex}
        onSummarize={() => setAIMode('summary')}
        onPractice={() => setAIMode('practice')}
        onAsk={() => setAIMode('chat')}
        onTranslate={() => setAIMode('translate')}
      />
      <BottomSheet ref={readingOptionsSheetRef}>
        <FullModeReadingOptionsSheet />
      </BottomSheet>
    </SafeAreaView>
  );
}

/**
 * Reading-options sheet for the EPUB full-mode reader. Like the PDF
 * version, this is a placeholder that points the user at text mode for
 * fine-grained typography — the WebView renders the publisher's own
 * CSS, so font/size/theme controls don't apply here.
 */
function FullModeReadingOptionsSheet() {
  return (
    <View style={readingOptionsStyles.wrap}>
      <Text style={readingOptionsStyles.title}>Reading options</Text>
      <Text style={readingOptionsStyles.body}>
        Full mode renders the EPUB with its publisher's own typography.
        Tap <Text style={readingOptionsStyles.bodyEm}>Text</Text> at the
        top of the reader to switch to text mode, where you can adjust
        font, size, and theme.
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

/**
 * Wrap a sanitised body HTML fragment in a minimal HTML document that
 * applies our reader typography. Keeps the publisher's structural
 * markup but renders it with the look-and-feel of the rest of the app.
 *
 * The CSS deliberately overrides aggressive publisher styles (max-width,
 * absolute positioning, fixed widths, color schemes that fight our
 * background) and lets images scale to the column. `font-family` falls
 * back through serifs the device is likely to have.
 */
function buildDocument(bodyHtml: string, title: string): string {
  const css = `
    :root { color-scheme: light; }
    html, body { margin: 0; padding: 0; background: #FAF7F2; }
    body {
      font-family: 'Literata', 'Georgia', 'Times New Roman', serif;
      font-size: 17px;
      line-height: 1.65;
      color: #2A2620;
      padding: 24px 22px 96px;
      -webkit-text-size-adjust: 100%;
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Fraunces', 'Georgia', serif;
      color: #1F1B16;
      line-height: 1.25;
      margin: 1.2em 0 0.4em;
    }
    h1 { font-size: 1.6em; }
    h2 { font-size: 1.35em; }
    h3 { font-size: 1.15em; }
    p { margin: 0 0 0.8em; }
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 14px auto;
      border-radius: 4px;
    }
    blockquote {
      margin: 1em 0;
      padding: 0.4em 1em;
      border-left: 3px solid #C9C2B5;
      color: #4A443B;
      font-style: italic;
    }
    ul, ol { padding-left: 1.4em; margin: 0.6em 0 0.9em; }
    li { margin: 0.25em 0; }
    pre, code {
      font-family: 'Geist Mono', 'Menlo', 'Courier New', monospace;
      background: #EDE7DD;
      border-radius: 4px;
    }
    pre { padding: 10px; overflow-x: auto; }
    code { padding: 1px 5px; font-size: 0.92em; }
    a { color: #2D6A4F; text-decoration: underline; }
    hr { border: 0; border-top: 1px solid #DDD7CB; margin: 1.4em 0; }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid #DDD7CB; padding: 6px 8px; }

    /* Spine-section dividers (one per EPUB spine item, stitched into
       a single document for full-mode rendering). The first item has
       no divider above it; siblings get a generous breathing space so
       the boundary between authored chunks is obvious. */
    .spine-item {
      padding-top: 8px;
    }
    .spine-sep {
      margin: 2.4em 0 1.6em;
      border-top: 1px solid #DDD7CB;
    }
    .spine-title {
      font-family: 'Fraunces', 'Georgia', serif;
      font-size: 1.5em;
      font-weight: 500;
      color: #1F1B16;
      margin: 0.4em 0 0.6em;
      letter-spacing: -0.01em;
    }
  `;
  // Title is set on the document but not rendered visually — the body
  // already carries the chapter heading from the source EPUB.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=2, user-scalable=yes" />
    <title>${escapeHtml(title)}</title>
    <style>${css}</style>
  </head>
  <body>${bodyHtml}</body>
</html>`;
}

/**
 * Inline script the WebView runs after document load. Two jobs:
 *   1. Scroll to the persisted fraction (so the user lands where they
 *      left off — Apple-Books-style "open and resume").
 *   2. Post the current scroll fraction to RN on every scroll event
 *      (passive listener — won't interfere with the page's smooth
 *      scrolling). RN debounces the writes server-side.
 *
 * The script must end with `true;` per the WebView contract — the
 * return value is ignored, but a non-undefined trailing expression
 * avoids a warning on iOS.
 */
function buildScrollBridge(initialFraction: number): string {
  // Clamp + format to keep the injected source small and parseable.
  const clamped = Math.max(0, Math.min(1, initialFraction));
  return `
(function () {
  function maxScroll() {
    return Math.max(
      0,
      (document.documentElement.scrollHeight || document.body.scrollHeight) -
        window.innerHeight
    );
  }
  function currentFraction() {
    var max = maxScroll();
    if (max <= 0) return 0;
    return Math.max(0, Math.min(1, window.scrollY / max));
  }
  // Restore once the document has laid out enough that scrollHeight is
  // meaningful. We try a few times across the first second since
  // images can resize the page after their load completes.
  var initial = ${clamped};
  if (initial > 0) {
    var attempts = 0;
    function restore() {
      var max = maxScroll();
      if (max > 0) {
        window.scrollTo({ top: max * initial, behavior: 'instant' });
      } else if (attempts++ < 8) {
        setTimeout(restore, 120);
      }
    }
    if (document.readyState === 'complete') restore();
    else window.addEventListener('load', restore);
  }
  // Post scroll fraction. We don't throttle here — the RN side
  // debounces the write — but the listener itself is passive so the
  // browser keeps scrolling smoothly even on slow devices.
  function post() {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'scroll', fraction: currentFraction() })
      );
    }
  }
  window.addEventListener('scroll', post, { passive: true });
  // Fire once after layout so RN sees the initial position.
  setTimeout(post, 200);

  // ── Tap bridge ────────────────────────────────────────────────
  // We post a tap message that RN routes to toggleChrome(). The
  // shotgun approach below registers on touchend AND click — Android
  // WebView under the new Fabric architecture has been observed to
  // synthesize click inconsistently for taps that follow a scroll
  // cancellation, while touchend always fires. We dedupe by time so
  // both events firing for a single tap only post once.
  //
  // tap-vs-scroll discrimination: we remember the touchstart
  // coordinates and treat a touchend as a tap only if it moved less
  // than ~10 px AND completed in under 500 ms. Beyond that it was
  // a scroll gesture or a long-press and we ignore it.
  //
  // Links / form controls are excluded so following a hyperlink or
  // interacting with an input does not also toggle the reader chrome.
  function postTap() {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: 'tap' })
        );
      } catch (err) {}
    }
  }
  function isInteractiveTarget(target) {
    var node = target;
    while (node && node !== document.body) {
      var tag = node.tagName;
      if (
        tag === 'A' ||
        tag === 'BUTTON' ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'LABEL'
      ) {
        return true;
      }
      node = node.parentNode;
    }
    return false;
  }
  var tapStart = null;
  var lastTapPostAt = 0;
  function maybePostTapDeduped() {
    var now = Date.now();
    if (now - lastTapPostAt < 350) return;
    lastTapPostAt = now;
    postTap();
  }
  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) {
      tapStart = null;
      return;
    }
    var t = e.touches[0];
    tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, true);
  document.addEventListener('touchend', function (e) {
    var start = tapStart;
    tapStart = null;
    if (!start || e.changedTouches.length !== 1) return;
    if (isInteractiveTarget(e.target)) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - start.x;
    var dy = t.clientY - start.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) return;
    if (Date.now() - start.time > 500) return;
    maybePostTapDeduped();
  }, true);
  document.addEventListener('click', function (e) {
    if (isInteractiveTarget(e.target)) return;
    maybePostTapDeduped();
  }, true);
})();
true;
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&'
      ? '&amp;'
      : c === '<'
      ? '&lt;'
      : c === '>'
      ? '&gt;'
      : c === '"'
      ? '&quot;'
      : '&#39;',
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  webviewWrap: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  statusWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  statusLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  statusTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginTop: 6,
  },
  statusBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 19,
  },
  switchTextBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
  },
  switchTextLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
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
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  topTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  bottomChrome: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tokens.bgColors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
  },
  // Bottom action bar — matches the text-mode reader's ActionBar
  // (ReaderScreen.tsx) so switching between Full and Text doesn't
  // jolt the user with two different toolbar styles. Dimensions /
  // radii / typography come from the text-mode spec; only the
  // border lives on the parent bottomChrome (above) so the chrome
  // can fade in/out as one unit.
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
