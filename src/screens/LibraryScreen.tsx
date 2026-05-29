import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, {
  Circle as SvgCircle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path as SvgPath,
  Rect,
  Stop,
} from 'react-native-svg';
import { CURATED_LIBRARY } from '~/data/curatedLibrary';
import {
  BottomSheet,
  type BottomSheetRef,
  Button,
  Icon,
  TabBar,
  type TabKey,
  Text,
} from '~/components';
import { tokens } from '~/design/tokens';
import { useBooks } from '~/hooks/useBooks';
import { peekCachedCoverUrl, resolveCoverUrl } from '~/lib/bookCovers';
import { formatNetworkError } from '~/lib/networkErrors';
import { supabase } from '~/lib/supabase';
import type { Book } from '~/types/book';
import { ReaderScreen } from '~/screens/ReaderScreen';
import { SoftWarningBanner } from '~/screens/PaywallScreen';
import {
  AddBookSheet,
  ProcessingScreen,
  type ProcessingStep,
  ScannedPdfErrorScreen,
} from '~/screens/UploadFlowScreen';
import { useBookUpload } from '~/lib/uploadBook';
import { reprocessBook } from '~/lib/reprocessBook';
import { useNetworkState } from '~/hooks/useNetworkState';
import { LibrarySkeleton } from '~/screens/SkeletonScreens';
import { HighlightsScreen } from '~/screens/HighlightsScreen';
import { PdfReaderScreen } from '~/screens/PdfReaderScreen';
import { EpubFullReaderScreen } from '~/screens/EpubFullReaderScreen';
import { useReadingStats } from '~/lib/readingStats';

/**
 * Flip to `true` to preview the library first-load skeleton.
 */
const MOCK_LIBRARY_LOADING = false;

// Offline banner colour constants (slate palette — not in design tokens)
const OFFLINE_COLOR = tokens.colors.offline;
const OFFLINE_BG = tokens.colors.offlineBg;
const OFFLINE_BORDER = tokens.colors.offlineBorder;

type SortKey = 'recent' | 'added' | 'title' | 'progress';
type FilterKey = 'all' | 'in-progress' | 'not-started' | 'finished';

// Wall-clock "now" used by relative-time helpers (e.g. "2h ago"). We
// re-read this on every render rather than capturing a constant at module
// load, so a long-running session doesn't drift. Was previously a hardcoded
// preview date — that meant any real `lastReadAt` past the hardcoded value
// produced negative diffs and nonsensical labels.
const RECENT_SEARCHES_KEY = '@bookflow/recent_searches';
const MAX_RECENT = 5;

const SORT_LABELS: Record<SortKey, string> = {
  recent: 'Recent',
  added: 'Recently added',
  title: 'Title A–Z',
  progress: 'Progress',
};

export type LibraryScreenProps = {
  onTabChange: (tab: TabKey) => void;
  userName?: string;
  onUpgrade?: () => void;
  /**
   * Hand off a book to the global audio session. Owned by App.tsx so the
   * Listen tab can reflect the active book and so a single useAudio
   * instance owns playback (rather than each tab racing its own).
   * Library no longer renders the player itself.
   */
  onStartListening: (book: Book) => void;
  /**
   * Fired whenever the library opens or closes a reader (PDF / EPUB
   * full / EPUB text). App.tsx uses this to hide the global mini
   * player while the user is reading — the mini bar overlapping the
   * reader chrome was distracting and there's no need for it when
   * the user is already on the book.
   */
  onReaderOpenChange?: (open: boolean) => void;
};

export function LibraryScreen({
  onTabChange,
  userName,
  onUpgrade,
  onStartListening,
  onReaderOpenChange,
}: LibraryScreenProps) {
  const { isConnected } = useNetworkState();
  const isOffline = !isConnected;

  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  // Notify the parent shell whenever a reader opens / closes so the
  // global mini-player overlay can hide while the user is in a book.
  // Effect-based so the callback fires for both directions without
  // wrapping every setSelectedBook call site.
  // (Effect that reports drill-in state to App is below the
  // highlightsBook declaration so it can read both signals.)
  const [showBanner, setShowBanner] = useState(true);
  const [appliedSort, setAppliedSort] = useState<SortKey>('recent');
  const [appliedFilter, setAppliedFilter] = useState<FilterKey>('all');
  const [pendingSort, setPendingSort] = useState<SortKey>('recent');
  const [pendingFilter, setPendingFilter] = useState<FilterKey>('all');
  const sheetRef = useRef<BottomSheetRef>(null);
  const addSheetRef = useRef<BottomSheetRef>(null);
  const bookActionSheetRef = useRef<BottomSheetRef>(null);
  const removeConfirmSheetRef = useRef<BottomSheetRef>(null);
  // Book selected by a long-press, used to populate the action sheet.
  // Cleared on dismiss so the sheet doesn't flash with stale content next
  // time it opens.
  const [actionBook, setActionBook] = useState<Book | null>(null);
  // Book staged for removal confirmation. Populated when the user taps
  // "Remove from library" in the action sheet; cleared when the confirm
  // sheet dismisses.
  const [bookToRemove, setBookToRemove] = useState<Book | null>(null);
  const [removing, setRemoving] = useState(false);
  // Book staged for the highlights screen — shown as a full-screen overlay
  // when the user taps "View highlights" from the action sheet.
  const [highlightsBook, setHighlightsBook] = useState<Book | null>(null);
  // One-shot initial page index used when opening a book from a
  // tapped highlight row. The Reader / PDF reader reads its
  // starting page from `book.last_read_page` by default; passing a
  // separate `initialPageIndex` prop overrides that for this open
  // only. We clear it back to null when the reader closes so the
  // NEXT manual open reverts to the last-read page.
  const [pendingInitialPageIndex, setPendingInitialPageIndex] = useState<
    number | null
  >(null);

  // Tell App.tsx whenever we drill INTO a focused surface (reader
  // OR highlights). App.tsx uses this signal to hide the floating
  // MiniPlayer overlay — both surfaces are full-screen focused
  // views that shouldn't share their bottom edge with audio
  // chrome.
  useEffect(() => {
    onReaderOpenChange?.(selectedBook !== null || highlightsBook !== null);
  }, [selectedBook, highlightsBook, onReaderOpenChange]);
  // EPUB reader mode preference. Defaults to 'full' (WebView with
  // original-formatting HTML) so the user sees the book the way
  // its designer laid it out — chapter headings, line breaks,
  // images, the works. They can flip to 'text' via the toggle for
  // the paginated-prose mode (tappable words, sentence saves,
  // AI tools). The mode resets to 'full' between library entries
  // so a fresh book always opens in the format-preserving view.
  const [epubMode, setEpubMode] = useState<'text' | 'full'>('full');
  const [showProcessing, setShowProcessing] = useState(false);
  const [showScannedPdfError, setShowScannedPdfError] = useState(false);

  // Reading-stats aggregate (minutes this week + streak). Refetched when
  // we close the reader so a just-finished session shows up immediately.
  const { stats: readingStats, refetch: refetchStats } = useReadingStats();

  // Real library data — replaces the mockBooks fixture. The hook subscribes
  // to postgres_changes so a successful upload auto-appears here without a
  // manual refresh. Hoisted to the top of the component because the upload
  // terminal-state effect below needs `refetch` as a fallback.
  const { books, continueBook: continueBookFromHook, isLoading, refetch } = useBooks();

  // Pull-to-refresh state. The hook's realtime subscription handles most
  // updates automatically, but a manual pull is useful for catching
  // anything realtime missed (network blips, RLS-filtered changes, etc.).
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  // Real upload pipeline. The hook handles pick → validate → insert →
  // upload → invoke fn → poll. We just react to its phase to drive the UI.
  const upload = useBookUpload();

  // Drives the "processing" phase ring creep. Resets each time we re-enter
  // processing; ticks once a second so the ring advances visibly without
  // burning render cycles. Capped at 60s — past that we hold at 95%.
  const [processingElapsedFraction, setProcessingElapsedFraction] = useState(0);
  useEffect(() => {
    if (upload.state.phase !== 'processing') {
      setProcessingElapsedFraction(0);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setProcessingElapsedFraction(Math.min(1, elapsed / 60));
    }, 1000);
    return () => clearInterval(id);
  }, [upload.state.phase]);

  const handleUploadTap = useCallback(() => {
    setShowProcessing(true);
    void (async () => {
      await upload.startUpload();
    })();
  }, [upload]);

  // React to terminal upload states.
  //
  // Subtlety: this effect must NOT depend on `upload` (the whole hook
  // result) because the hook returns a fresh object on every render and
  // that would cause the dismiss timer to be cleared and re-scheduled on
  // every parent re-render. Realtime book updates re-render the parent
  // frequently right after a successful upload (the new row arrives over
  // postgres_changes, which triggers `useBooks` to setState), so an
  // unstable dep here was preventing the 1.5s timer from ever firing —
  // the upload screen would stay on "All set" forever.
  //
  // We also gate the dismiss with a ref so re-entries within the same
  // terminal phase don't double-schedule.
  const dismissScheduledRef = useRef(false);
  const phase = upload.state.phase;
  const failureReason = upload.state.failureReason;
  const uploadReset = upload.reset;
  useEffect(() => {
    if (phase === 'failed' && failureReason === 'scanned_pdf') {
      setShowProcessing(false);
      setShowScannedPdfError(true);
      uploadReset();
      return;
    }
    if (phase === 'idle' && showProcessing) {
      // Picker was cancelled before we got anywhere — close the screen.
      setShowProcessing(false);
      return;
    }
    if (phase === 'ready' || phase === 'partial') {
      if (dismissScheduledRef.current) return;
      dismissScheduledRef.current = true;
      void refetch();
      const t = setTimeout(() => {
        setShowProcessing(false);
        uploadReset();
        dismissScheduledRef.current = false;
      }, 1500);
      return () => {
        clearTimeout(t);
        dismissScheduledRef.current = false;
      };
    }
    // Any non-terminal phase: clear the latch so the next ready/partial
    // re-arms the dismiss.
    dismissScheduledRef.current = false;
  }, [phase, failureReason, showProcessing, refetch, uploadReset]);

  // Build the processing-screen step list from upload phase. Three rows
  // mirror the design: upload → extract chapters → generate audio. Audio
  // generation isn't wired yet (M2), so it stays pending on success.
  const processingSteps: ProcessingStep[] = (() => {
    const phase = upload.state.phase;
    const sizeLabel = upload.state.fileSize
      ? `${(upload.state.fileSize / 1024 / 1024).toFixed(1)} MB`
      : '';
    const uploadStep: ProcessingStep =
      phase === 'uploading'
        ? {
            state: 'active',
            label: 'Uploading file',
            sublabel: `${Math.round(upload.state.progress * 100)}% · ${sizeLabel}`,
          }
        : phase === 'creating' || phase === 'picking'
        ? { state: 'active', label: 'Preparing upload', sublabel: sizeLabel || 'Reading file…' }
        : { state: 'done', label: 'File uploaded', sublabel: `${sizeLabel} · completed` };

    const extractStep: ProcessingStep =
      phase === 'processing'
        ? {
            state: 'active',
            label: 'Extracting chapters',
            // Prefer the live status hint from the edge function
            // (e.g. "OCR'ing pages 1–100 of 250…") when available;
            // fall back to the generic copy otherwise.
            sublabel:
              upload.state.processingMessage ?? 'Reading the file contents…',
          }
        : phase === 'ready' || phase === 'partial'
        ? { state: 'done', label: 'Chapters extracted', sublabel: 'Completed' }
        : phase === 'failed'
        ? {
            state: 'failed',
            label: 'Extracting chapters',
            // Run the upload's raw error through the shared friendly
            // mapper so we never show stack-trace-shaped strings here
            // ("TypeError: Network request failed"). Falls through to
            // a generic "Failed" if the upload state has no error.
            sublabel: upload.state.errorMessage
              ? formatNetworkError(upload.state.errorMessage, 'extracting chapters')
              : 'Failed',
          }
        : { state: 'pending', label: 'Extract chapters', sublabel: 'Waiting for upload' };

    const audioStep: ProcessingStep = { state: 'pending', label: 'Generating audio', sublabel: 'Coming soon' };

    return [uploadStep, extractStep, audioStep];
  })();

  const processingTitle = (() => {
    const name = upload.state.fileName ?? 'your book';
    if (upload.state.phase === 'uploading') return `Uploading ${name}`;
    if (upload.state.phase === 'processing') return `Processing ${name}`;
    if (upload.state.phase === 'ready') return 'All set';
    if (upload.state.phase === 'partial') return 'Mostly ready';
    if (upload.state.phase === 'failed') return 'Upload failed';
    return `Preparing ${name}`;
  })();

  const processingSubtitle = (() => {
    if (upload.state.phase === 'uploading') return 'Sending the file to your library.';
    if (upload.state.phase === 'processing') {
      // Prefer the live status hint when the edge function has shipped
      // one (OCR / chunking can take minutes — the generic "under a
      // minute" copy is misleading there).
      return (
        upload.state.processingMessage ??
        'Reading the file and extracting chapters. This usually takes under a minute.'
      );
    }
    if (upload.state.phase === 'ready') return 'Your book is in the library.';
    if (upload.state.phase === 'partial') return 'Some optional steps failed, but the book is readable.';
    if (upload.state.phase === 'failed') {
      // Same friendly mapping as the per-step label above — keeps
      // the header subtitle in the same voice as the pipeline UI.
      return upload.state.errorMessage
        ? formatNetworkError(upload.state.errorMessage, 'processing this book')
        : 'Something went wrong.';
    }
    return 'Working…';
  })();

  // Unified 0..1 progress across the whole pipeline so the ring never
  // overshoots and the user always sees forward motion. Phase budgets:
  //   picking / creating   →  0–5%   (fixed checkpoints)
  //   uploading            →  5–55%  (real XHR progress)
  //   processing (server)  →  55–95% (creeps with elapsed time, indeterminate underneath)
  //   ready / partial      →  100%
  // Returning `undefined` would make the ring indeterminate — we avoid that
  // here so the user always sees a number, but processing-phase advancement
  // is just a time heuristic since the Edge Function doesn't stream progress.
  const processingProgress = (() => {
    switch (upload.state.phase) {
      case 'picking':
        return 0;
      case 'creating':
        return 0.05;
      case 'uploading':
        return 0.05 + Math.max(0, Math.min(1, upload.state.progress)) * 0.5;
      case 'processing':
        // Creep up to 95% over ~60s of polling. We don't have real signal
        // from the function, so this is a UX heuristic — better than a
        // ring stuck at one value while we wait.
        return Math.min(0.95, 0.55 + processingElapsedFraction * 0.4);
      case 'ready':
      case 'partial':
        return 1;
      case 'failed':
      case 'idle':
      default:
        return undefined;
    }
  })();

  // Search state
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_SEARCHES_KEY)
      .then((raw) => {
        if (raw) setRecentSearches(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const saveSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...recentSearches.filter((s) => s !== trimmed)].slice(
      0,
      MAX_RECENT,
    );
    setRecentSearches(updated);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated)).catch(() => {});
  }, [recentSearches]);

  const openSearch = useCallback(() => {
    setSearchQuery('');
    setSearchMode(true);
  }, []);

  const closeSearch = useCallback(() => {
    if (searchQuery.trim()) saveSearch(searchQuery);
    setSearchMode(false);
    setSearchQuery('');
  }, [searchQuery, saveSearch]);

  const handleRecentTap = useCallback((term: string) => {
    setSearchQuery(term);
  }, []);

  const openSheet = useCallback(() => {
    setPendingSort(appliedSort);
    setPendingFilter(appliedFilter);
    sheetRef.current?.present();
  }, [appliedSort, appliedFilter]);

  const handleApply = useCallback(() => {
    setAppliedSort(pendingSort);
    setAppliedFilter(pendingFilter);
    sheetRef.current?.dismiss();
  }, [pendingSort, pendingFilter]);

  const handleReset = useCallback(() => {
    setPendingSort('recent');
    setPendingFilter('all');
  }, []);

  const handleSheetDismiss = useCallback(() => {
    setPendingSort(appliedSort);
    setPendingFilter(appliedFilter);
  }, [appliedSort, appliedFilter]);

  // Open the designed remove-confirmation sheet (replaces the old native
  // Alert.alert). The actual delete runs from `confirmRemoveBook` below
  // once the user taps the destructive button.
  const handleRemoveBook = useCallback((book: Book) => {
    setBookToRemove(book);
    removeConfirmSheetRef.current?.present();
  }, []);

  const confirmRemoveBook = useCallback(async () => {
    const book = bookToRemove;
    if (!book || removing) return;
    setRemoving(true);
    try {
      // Storage objects first (RLS lets the user list/delete their own).
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const prefix = `${user.id}/${book.id}`;
        const { data: objects } = await supabase.storage
          .from('books')
          .list(prefix);
        if (objects?.length) {
          await supabase.storage
            .from('books')
            .remove(objects.map((o) => `${prefix}/${o.name}`));
        }
      }
      // Then the row — chapters / audio_cache / etc cascade.
      const { error } = await supabase.from('books').delete().eq('id', book.id);
      if (error) {
        console.warn('[Library] removeBook delete failed:', error);
        Alert.alert('Could not remove', formatNetworkError(error, 'removing this book'));
      } else {
        removeConfirmSheetRef.current?.dismiss();
        setBookToRemove(null);
        void refetch();
      }
    } catch (err) {
      console.warn('[Library] removeBook threw:', err);
      Alert.alert('Could not remove', formatNetworkError(err, 'removing this book'));
    } finally {
      setRemoving(false);
    }
  }, [bookToRemove, removing, refetch]);

  // Long-press opens a designed bottom sheet with book actions. We stage
  // the selected book in state so the sheet can render its title/cover
  // header — the BottomSheet itself doesn't accept arguments through its
  // imperative `present()` API.
  const handleLongPressBook = useCallback((book: Book) => {
    setActionBook(book);
    bookActionSheetRef.current?.present();
  }, []);

  const handleReprocessFromSheet = useCallback(async () => {
    if (!actionBook) return;
    bookActionSheetRef.current?.dismiss();
    try {
      await reprocessBook(actionBook.id);
      void refetch();
    } catch (err) {
      console.warn('[Library] reprocessBook threw:', err);
      Alert.alert('Re-process failed', formatNetworkError(err, 'restarting processing'));
    }
  }, [actionBook, refetch]);

  const handleRemoveFromSheet = useCallback(() => {
    if (!actionBook) return;
    bookActionSheetRef.current?.dismiss();
    // Defer the remove-confirm sheet one tick so it presents after the
    // action sheet finishes its dismiss animation rather than racing it
    // — without this, iOS occasionally drops the second present.
    setTimeout(() => handleRemoveBook(actionBook), 250);
  }, [actionBook, handleRemoveBook]);

  const handleViewHighlightsFromSheet = useCallback(() => {
    if (!actionBook) return;
    const target = actionBook;
    bookActionSheetRef.current?.dismiss();
    // Same dismiss-then-present staggering as the remove confirm — gives
    // the action sheet's exit animation a tick before we mount the new
    // full-screen view, otherwise the book cover/title flicker.
    setTimeout(() => setHighlightsBook(target), 200);
  }, [actionBook]);

  const filtered = books.filter((b) => {
    if (appliedFilter === 'in-progress') return b.progressPercent > 0 && b.progressPercent < 100;
    if (appliedFilter === 'not-started') return b.progressPercent === 0;
    if (appliedFilter === 'finished') return b.progressPercent === 100;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (appliedSort) {
      case 'recent':
        return (b.lastReadAt?.getTime() ?? 0) - (a.lastReadAt?.getTime() ?? 0);
      case 'added':
        return b.addedAt.getTime() - a.addedAt.getTime();
      case 'title':
        return a.title.localeCompare(b.title);
      case 'progress':
        return b.progressPercent - a.progressPercent;
    }
  });

  const continueBook = continueBookFromHook;

  const counts: Record<FilterKey, number> = {
    all: books.length,
    'in-progress': books.filter((b) => b.progressPercent > 0 && b.progressPercent < 100).length,
    'not-started': books.filter((b) => b.progressPercent === 0).length,
    finished: books.filter((b) => b.progressPercent === 100).length,
  };

  // Search results
  const lq = searchQuery.trim().toLowerCase();
  const searchResults = lq
    ? books.filter(
        (b) =>
          b.title.toLowerCase().includes(lq) ||
          b.author.toLowerCase().includes(lq),
      )
    : [];

  if (MOCK_LIBRARY_LOADING) {
    return <LibrarySkeleton />;
  }

  if (selectedBook) {
    // PDFs go to the native PDF reader (full-fidelity Acrobat-style page
    // rendering). Everything else (EPUB) goes to the paginated text
    // reader. Deciding here keeps the reader components unaware of each
    // other — each one is responsible only for its own format.
    if (selectedBook.type === 'pdf') {
      return (
        <PdfReaderScreen
          book={selectedBook}
          initialPageIndex={pendingInitialPageIndex ?? undefined}
          onBack={() => {
            setSelectedBook(null);
            setPendingInitialPageIndex(null);
            void refetch();
            void refetchStats();
          }}
          onListen={() => {
            onStartListening(selectedBook);
            setSelectedBook(null);
            setPendingInitialPageIndex(null);
          }}
        />
      );
    }
    // EPUB: route to the WebView "full" mode or the paginated text reader
    // based on the user's session toggle. Each component knows how to
    // request the other (via onRequestFullMode / onRequestTextMode), so
    // the parent owns the mode state and they don't have to know about
    // each other.
    if (epubMode === 'full') {
      return (
        <EpubFullReaderScreen
          book={selectedBook}
          onBack={() => {
            setSelectedBook(null);
            setEpubMode('full');
            // See PDF onBack above for the refetch rationale.
            void refetch();
            void refetchStats();
          }}
          onRequestTextMode={() => setEpubMode('text')}
          onListen={() => {
            onStartListening(selectedBook);
            setSelectedBook(null);
            setEpubMode('text');
          }}
        />
      );
    }
    return (
      <ReaderScreen
        book={selectedBook}
        initialPageIndex={pendingInitialPageIndex ?? undefined}
        onBack={() => {
          setSelectedBook(null);
          setPendingInitialPageIndex(null);
          // The reader just closed — refetch books so the Continue
          // card + per-book progress show the new last_read_page,
          // and refetch stats to pick up any duration_seconds from
          // this session.
          void refetch();
          void refetchStats();
        }}
        onRequestFullMode={() => setEpubMode('full')}
        onListen={() => {
          onStartListening(selectedBook);
          setSelectedBook(null);
          setPendingInitialPageIndex(null);
        }}
      />
    );
  }

  if (highlightsBook) {
    return (
      <HighlightsScreen
        book={highlightsBook}
        onClose={() => setHighlightsBook(null)}
        onJumpToPage={(pageIndex) => {
          // Jump from a tapped highlight row → open the same book
          // in the reader at the highlight's page.
          //
          // For EPUBs we force Text mode because that's where
          // tappable words / sentence-press / saved highlights are
          // visible — Full mode (the default) is a WebView that
          // doesn't expose those affordances. The user explicitly
          // saved this highlight via the text reader, so it's the
          // surface they expect to be returned to.
          //
          // pendingInitialPageIndex flows through to the reader as
          // the `initialPageIndex` prop, which overrides the
          // persisted last_read_page for this open only.
          const target = highlightsBook;
          setHighlightsBook(null);
          setPendingInitialPageIndex(pageIndex);
          if (target.type !== 'pdf') setEpubMode('text');
          setSelectedBook(target);
        }}
      />
    );
  }

  if (searchMode) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <SearchHeader
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onBack={closeSearch}
          onCancel={closeSearch}
          inputRef={searchInputRef}
        />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.searchScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {lq === '' ? (
            <PreSearchContent
              recentSearches={recentSearches}
              onRecentTap={handleRecentTap}
              onDiscoverTap={() => onTabChange('discover')}
            />
          ) : searchResults.length > 0 ? (
            <SearchResults
              results={searchResults}
              query={searchQuery.trim()}
              onBookPress={setSelectedBook}
              onDiscoverTap={() => onTabChange('discover')}
            />
          ) : (
            <NoResults
              query={searchQuery.trim()}
              onDiscoverTap={() => onTabChange('discover')}
            />
          )}
        </ScrollView>
        <TabBar activeTab="library" onChange={onTabChange} />
      </SafeAreaView>
    );
  }

  if (showProcessing) {
    const sizeLabelForProcessing = upload.state.fileSize
      ? `${(upload.state.fileSize / 1024 / 1024).toFixed(1)} MB`
      : undefined;
    return (
      <ProcessingScreen
        title={processingTitle}
        subtitle={processingSubtitle}
        progress={processingProgress}
        steps={processingSteps}
        failed={upload.state.phase === 'failed'}
        bookTitle={upload.state.fileName ?? undefined}
        fileSizeLabel={sizeLabelForProcessing}
        onBackground={() => setShowProcessing(false)}
        onCancel={() => {
          upload.cancel();
          setShowProcessing(false);
          upload.reset();
        }}
        onRetryAudio={() => {
          // Audio generation isn't wired yet — fall back to retrying the
          // upload. M2 will replace this with a targeted audio retry.
          setShowProcessing(false);
          upload.reset();
        }}
        onReadWithoutAudio={() => {
          setShowProcessing(false);
          upload.reset();
        }}
        onRemoveBook={() => {
          setShowProcessing(false);
          upload.reset();
        }}
      />
    );
  }

  if (showScannedPdfError) {
    const sizeLabelForScanned = upload.state.fileSize
      ? `${(upload.state.fileSize / 1024 / 1024).toFixed(1)} MB`
      : undefined;
    return (
      <ScannedPdfErrorScreen
        fileName={upload.state.fileName ?? undefined}
        fileSizeLabel={sizeLabelForScanned}
        onTryAnother={() => {
          setShowScannedPdfError(false);
          // Re-open add sheet after a tick so the screen transition completes
          setTimeout(() => addSheetRef.current?.present(), 50);
        }}
        onBrowse={() => {
          setShowScannedPdfError(false);
          onTabChange('discover');
        }}
      />
    );
  }

  // Show the skeleton while the first books fetch is in flight. Once
  // resolved, an empty `books` array means the user genuinely has no
  // library yet — render the empty state.
  if (isLoading) {
    return <LibrarySkeleton />;
  }

  const isEmpty = books.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.emptyScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={tokens.textColors.subtle}
            />
          }
        >
          <Header onSearch={openSearch} onAdd={() => addSheetRef.current?.present()} />
          <LibraryEmptyContent
            userName={userName}
            onUpload={() => addSheetRef.current?.present()}
            onSeeAll={() => onTabChange('discover')}
            onBookPress={() => {}}
          />
        </ScrollView>
        <TabBar activeTab="library" onChange={onTabChange} />
        <AddBookSheet
          ref={addSheetRef}
          onUpload={handleUploadTap}
          onBrowse={() => onTabChange('discover')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {isOffline && <OfflineBanner onRetry={() => {}} />}
      {!isOffline && showBanner && onUpgrade && (
        <SoftWarningBanner
          minutesLeft={18}
          onUpgrade={onUpgrade}
          onDismiss={() => setShowBanner(false)}
        />
      )}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={tokens.textColors.subtle}
          />
        }
      >
        <Header onSearch={openSearch} onFilter={openSheet} onAdd={() => addSheetRef.current?.present()} isOffline={isOffline} />
        <ReadingStatsCard stats={readingStats} weekDays={readingStats.weekDays} />
        {continueBook && (
          <ContinueCard
            book={continueBook}
            onListen={onStartListening}
            onRead={setSelectedBook}
            isOffline={isOffline}
          />
        )}
        <SectionHeader
          count={sorted.length}
          sortLabel={SORT_LABELS[appliedSort]}
          onSortPress={openSheet}
        />
        <BookList
          books={sorted}
          onBookPress={setSelectedBook}
          onRemove={handleRemoveBook}
          onLongPress={handleLongPressBook}
        />
      </ScrollView>
      <TabBar activeTab="library" onChange={onTabChange} />

      <BottomSheet ref={sheetRef} onDismiss={handleSheetDismiss}>
        <SortFilterSheet
          sortBy={pendingSort}
          filterBy={pendingFilter}
          counts={counts}
          onSortChange={setPendingSort}
          onFilterChange={setPendingFilter}
          onReset={handleReset}
          onApply={handleApply}
        />
      </BottomSheet>
      <AddBookSheet
        ref={addSheetRef}
        onUpload={handleUploadTap}
        onBrowse={() => onTabChange('discover')}
      />
      <BottomSheet
        ref={bookActionSheetRef}
        onDismiss={() => setActionBook(null)}
      >
        <BookActionSheetContent
          book={actionBook}
          onViewHighlights={handleViewHighlightsFromSheet}
          onReprocess={handleReprocessFromSheet}
          onRemove={handleRemoveFromSheet}
          onCancel={() => bookActionSheetRef.current?.dismiss()}
        />
      </BottomSheet>
      <BottomSheet
        ref={removeConfirmSheetRef}
        onDismiss={() => {
          if (!removing) setBookToRemove(null);
        }}
      >
        <RemoveBookSheetContent
          book={bookToRemove}
          removing={removing}
          onConfirm={confirmRemoveBook}
          onCancel={() => removeConfirmSheetRef.current?.dismiss()}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

// ─── Search header ───────────────────────────────────────────────────────────

function SearchHeader({
  query,
  onQueryChange,
  onBack,
  onCancel,
  inputRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  onBack: () => void;
  onCancel: () => void;
  inputRef: React.RefObject<TextInput | null>;
}) {
  return (
    <View style={styles.searchHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backBtn}
      >
        <Icon name="ArrowLeft" size={20} color={tokens.textColors.secondary} />
      </Pressable>

      <View style={[styles.searchPill, query.length > 0 && styles.searchPillFocused]}>
        <Icon name="Search" size={16} color={tokens.textColors.subtle} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Search by title or author"
          placeholderTextColor={tokens.textColors.subtle}
          value={query}
          onChangeText={onQueryChange}
          autoFocus
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onQueryChange('')}
            hitSlop={4}
            style={styles.clearBtn}
          >
            <Icon name="X" size={10} color={tokens.bgColors.canvas} />
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        hitSlop={8}
      >
        <Text style={styles.cancelBtn}>Cancel</Text>
      </Pressable>
    </View>
  );
}

// ─── Pre-search state ────────────────────────────────────────────────────────

function PreSearchContent({
  recentSearches,
  onRecentTap,
  onDiscoverTap,
}: {
  recentSearches: string[];
  onRecentTap: (term: string) => void;
  onDiscoverTap: () => void;
}) {
  return (
    <>
      {recentSearches.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentLabel}>Recent</Text>
          <View>
            {recentSearches.map((term, idx) => (
              <Pressable
                key={term}
                onPress={() => onRecentTap(term)}
                style={({ pressed }) => [
                  styles.recentChip,
                  idx < recentSearches.length - 1 && styles.recentChipBorder,
                  pressed && { backgroundColor: tokens.bgColors.surface },
                ]}
              >
                <Icon name="Clock" size={16} color={tokens.textColors.subtle} />
                <Text style={styles.recentChipLabel}>{term}</Text>
                <Icon name="ChevronRight" size={14} color={tokens.textColors.disabled} />
              </Pressable>
            ))}
          </View>
        </View>
      )}
      <DiscoverNudge
        title="Not in your library?"
        subtitle="Browse hundreds of free books in Discover"
        onPress={onDiscoverTap}
      />
    </>
  );
}

// ─── Search results ──────────────────────────────────────────────────────────

function SearchResults({
  results,
  query,
  onBookPress,
  onDiscoverTap,
}: {
  results: Book[];
  query: string;
  onBookPress: (book: Book) => void;
  onDiscoverTap: () => void;
}) {
  return (
    <>
      <Text style={styles.resultsMeta}>
        {results.length} {results.length === 1 ? 'result' : 'results'}
      </Text>
      <View style={styles.resultList}>
        {results.map((book, index) => (
          <View key={book.id}>
            <SearchResultRow book={book} query={query} onPress={onBookPress} />
            {index < results.length - 1 && <View style={styles.bookDivider} />}
          </View>
        ))}
      </View>
      <DiscoverNudge
        title="Browse the free library"
        subtitle="Find more books in Discover"
        onPress={onDiscoverTap}
        style={styles.nudgeSpacing}
      />
    </>
  );
}

function SearchResultRow({ book, query, onPress }: { book: Book; query: string; onPress: (book: Book) => void }) {
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  const progressLine =
    book.progressPercent === 0
      ? 'Not started'
      : book.progressPercent === 100
      ? 'Finished · 100%'
      : pageNum
      ? `Page ${pageNum} · ${book.progressPercent}% done`
      : `${book.progressPercent}% done`;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(book)}
      style={({ pressed }) => [
        styles.resultRow,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <BookCover book={book} size="result" />
      <View style={styles.resultInfo}>
        <HighlightedTitle title={book.title} query={query} />
        <Text variant="body-xs" color="muted" numberOfLines={1}>
          {book.author}
        </Text>
        <Text variant="body-xs" color="subtle">
          {progressLine}
        </Text>
      </View>
      <Icon name="ChevronRight" size={16} color={tokens.textColors.disabled} />
    </Pressable>
  );
}

function HighlightedTitle({ title, query }: { title: string; query: string }) {
  const lq = query.toLowerCase();
  const idx = title.toLowerCase().indexOf(lq);
  if (idx === -1) {
    return (
      <Text style={styles.resultTitle} numberOfLines={1}>
        {title}
      </Text>
    );
  }
  return (
    <Text style={styles.resultTitle} numberOfLines={1}>
      {title.slice(0, idx)}
      <Text style={styles.resultHighlight}>{title.slice(idx, idx + query.length)}</Text>
      {title.slice(idx + query.length)}
    </Text>
  );
}

// ─── No results ──────────────────────────────────────────────────────────────

function NoResults({
  query,
  onDiscoverTap,
}: {
  query: string;
  onDiscoverTap: () => void;
}) {
  return (
    <>
      <View style={styles.noResults}>
        <Text style={styles.noResultsTitle}>
          Nothing in your library{'\n'}matches "{query}"
        </Text>
        <Text variant="body-sm" color="muted" style={styles.noResultsSub}>
          Try a different spelling or browse Discover for new books.
        </Text>
      </View>
      <DiscoverNudge
        title="Not in your library?"
        subtitle="Browse hundreds of free books in Discover"
        onPress={onDiscoverTap}
        style={{ marginTop: 0 }}
      />
    </>
  );
}

// ─── Discover nudge ──────────────────────────────────────────────────────────

function DiscoverNudge({
  title,
  subtitle,
  onPress,
  style,
}: {
  title: string;
  subtitle: string;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.discoverNudge,
        style,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={styles.nudgeIconWrap}>
        <Icon name="Search" size={18} color={tokens.colors.forest[800]} />
      </View>
      <View style={styles.nudgeText}>
        <Text style={styles.nudgeTitle}>{title}</Text>
        <Text style={styles.nudgeSub}>{subtitle}</Text>
      </View>
      <Icon name="ChevronRight" size={14} color={tokens.colors.forest[700]} />
    </Pressable>
  );
}

// ─── Library header ──────────────────────────────────────────────────────────

// ─── Offline banner ──────────────────────────────────────────────────────────

function OfflineBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.offlineBanner}>
      <View style={styles.offlineDot} />
      <View style={styles.offlineTextWrap}>
        <Text style={styles.offlineTitle}>No connection</Text>
        <Text style={styles.offlineSub}>Reading still works · Streaming unavailable</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retry connection"
        onPress={onRetry}
        style={({ pressed }) => [styles.offlineRetryBtn, pressed && { opacity: 0.7 }]}
        hitSlop={6}
      >
        <Icon name="Refresh" size={11} color={OFFLINE_COLOR} />
        <Text style={styles.offlineRetryLabel}>Retry</Text>
      </Pressable>
    </View>
  );
}

function Header({
  onSearch,
  onFilter,
  onAdd,
  isOffline,
}: {
  onSearch: () => void;
  onFilter?: () => void;
  onAdd: () => void;
  isOffline?: boolean;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Library</Text>
      <View style={styles.headerActions}>
        <CircleIconButton icon="Search" onPress={onSearch} dimmed={isOffline} />
        {onFilter && <CircleIconButton icon="Filter" onPress={onFilter} dimmed={isOffline} />}
        <CircleIconButton icon="Plus" onPress={onAdd} dimmed={isOffline} />
      </View>
    </View>
  );
}

function CircleIconButton({
  icon,
  onPress,
  dimmed,
}: {
  icon: 'Search' | 'Filter' | 'Plus';
  onPress: () => void;
  dimmed?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={dimmed}
      style={({ pressed }) => [
        styles.circleButton,
        pressed && !dimmed && { backgroundColor: tokens.bgColors.raised },
        dimmed && styles.circleButtonDimmed,
      ]}
    >
      <Icon name={icon} size={18} color={tokens.textColors.secondary} />
    </Pressable>
  );
}

// ─── Reading-stats card ──────────────────────────────────────────────────────

/**
 * Compact stats card above the books grid. Shows this-week reading time
 * with a clear primary metric, day-of-week dots that visually trace the
 * user's reading pattern, and a streak badge.
 *
 * Hides entirely when there's no recorded reading yet — a fresh-install
 * library shouldn't carry a "0m · 0-day streak" reminder of an empty
 * state. As soon as the first session lands, the card appears.
 *
 * Day dots: one per weekday Mon–Sun. Filled (forest) for a day with any
 * reading, hollow (subtle border) for an empty day, accented (amber)
 * for today. This was the cheapest way to communicate consistency at a
 * glance — a number alone hides whether the streak is fresh or about to
 * break, but the dots show "you're at 4 days, today is empty so far".
 *
 * Stats are aggregated client-side from `reading_sessions` (see
 * `lib/readingStats.ts`).
 */
function ReadingStatsCard({
  stats,
  weekDays,
}: {
  stats: { minutesThisWeek: number; minutesToday: number; streakDays: number };
  /** 7 booleans, Mon → Sun, true if the user read on that day this week. */
  weekDays: boolean[];
}) {
  if (stats.minutesThisWeek === 0 && stats.streakDays === 0) {
    return null;
  }
  // Today's index in the weekDays array (Mon=0..Sun=6) so the highlighted
  // dot tracks the device clock, not a hardcoded position.
  const jsDay = new Date().getDay(); // 0 = Sun
  const todayIndex = (jsDay + 6) % 7;

  const headline = stats.minutesToday > 0
    ? `${formatMinutes(stats.minutesToday)} today`
    : `${formatMinutes(stats.minutesThisWeek)} this week`;
  const subline = stats.minutesToday > 0
    ? `${formatMinutes(stats.minutesThisWeek)} this week`
    : 'No reading yet today';

  return (
    <View style={styles.statsCard}>
      <View style={styles.statsCardLeft}>
        <Text style={styles.statsCardHeadline}>{headline}</Text>
        <Text style={styles.statsCardSubline}>{subline}</Text>
        <View style={styles.statsDots}>
          {WEEKDAYS.map((day, i) => {
            const filled = weekDays[i];
            const isToday = i === todayIndex;
            return (
              <View key={day.id} style={styles.statsDotColumn}>
                <View
                  style={[
                    styles.statsDot,
                    filled && styles.statsDotFilled,
                    isToday && (filled ? styles.statsDotToday : styles.statsDotTodayEmpty),
                  ]}
                />
                <Text
                  style={[
                    styles.statsDotLabel,
                    isToday && styles.statsDotLabelToday,
                  ]}
                >
                  {day.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      {stats.streakDays > 0 ? (
        <View style={styles.statsStreakBadge}>
          <Text style={styles.statsStreakValue}>{stats.streakDays}</Text>
          <Text style={styles.statsStreakLabel}>
            {stats.streakDays === 1 ? 'day streak' : 'day streak'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// Mon → Sun, with stable ids so React keys don't collide on the
// repeated single-letter labels (T/T, S/S).
const WEEKDAYS = [
  { id: 'mon', label: 'M' },
  { id: 'tue', label: 'T' },
  { id: 'wed', label: 'W' },
  { id: 'thu', label: 'T' },
  { id: 'fri', label: 'F' },
  { id: 'sat', label: 'S' },
  { id: 'sun', label: 'S' },
] as const;

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  const remaining = min % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

// ─── Continue card ───────────────────────────────────────────────────────────

function ContinueCard({
  book,
  onListen,
  onRead,
  isOffline,
}: {
  book: Book;
  /** Tapped when the user hits "Listen" — routes straight to the audio player. */
  onListen: (book: Book) => void;
  /** Tapped when the user hits "Read" — routes to the reader (PDF or EPUB). */
  onRead: (book: Book) => void;
  isOffline?: boolean;
}) {
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  const statusLine = pageNum
    ? `Page ${pageNum} · ${book.progressPercent}% done`
    : `${book.progressPercent}% done`;

  return (
    <View style={styles.continueSection}>
      <Text style={styles.eyebrow}>Continue reading</Text>
      <View style={styles.continueCard}>
        <BookCover book={book} size="hero" />
        <View style={styles.continueMeta}>
          <Text style={styles.bookTitleHero} numberOfLines={2}>
            {book.title}
          </Text>
          <Text variant="body-xs" color="muted" numberOfLines={1}>
            {book.author}
          </Text>
          <Text variant="body-xs" color="subtle" numberOfLines={1} style={styles.continueStatus}>
            {statusLine}
          </Text>
          <View style={styles.progressWrap}>
            <ProgressBar percent={book.progressPercent} height={3} />
          </View>
          <View style={styles.continueActions}>
            <View style={[styles.listenWrap, isOffline && { opacity: 0.4 }]}>
              <Button
                label="Listen"
                variant="primary"
                size="compact"
                leadingIcon="Play"
                fullWidth
                disabled={isOffline}
                onPress={() => onListen(book)}
              />
            </View>
            <Button
              label="Read"
              variant="secondary"
              size="compact"
              onPress={() => onRead(book)}
            />
          </View>
          {isOffline && (
            <View style={styles.streamingUnavailable}>
              <Icon name="AlertTriangle" size={10} color={tokens.textColors.disabled} strokeWidth={1.5} />
              <Text style={styles.streamingUnavailableText}>
                Audio streaming unavailable offline
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionHeader({
  count,
  sortLabel,
  onSortPress,
}: {
  count: number;
  sortLabel: string;
  onSortPress: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionLabelRow}>
        <Text style={styles.sectionLabelBold}>All books</Text>
        <Text style={styles.sectionLabelCount}> · {count}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onSortPress}
        hitSlop={8}
        style={styles.sortPress}
      >
        <Icon name="ArrowsSort" size={14} color={tokens.textColors.subtle} />
        <Text variant="body-xs" color="muted">
          {sortLabel}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Book list ───────────────────────────────────────────────────────────────

function BookList({
  books,
  onBookPress,
  onRemove,
  onLongPress,
}: {
  books: Book[];
  onBookPress: (book: Book) => void;
  onRemove?: (book: Book) => void;
  onLongPress?: (book: Book) => void;
}) {
  return (
    <View style={styles.bookList}>
      {books.map((book, index) => (
        <View key={book.id}>
          <BookListItem
            book={book}
            onPress={onBookPress}
            onRemove={onRemove}
            onLongPress={onLongPress}
          />
          {index < books.length - 1 && <View style={styles.bookDivider} />}
        </View>
      ))}
    </View>
  );
}

function BookListItem({
  book,
  onPress,
  onRemove,
  onLongPress,
}: {
  book: Book;
  onPress: (book: Book) => void;
  onRemove?: (book: Book) => void;
  onLongPress?: (book: Book) => void;
}) {
  const status = book.processingStatus;
  const isProcessing = status === 'pending' || status === 'processing';
  const isFailed = typeof status === 'string' && status.startsWith('failed');

  const inProgress = book.progressPercent > 0 && book.progressPercent < 100;
  const finished = book.progressPercent === 100;
  const notStarted = book.progressPercent === 0;

  // Processing rows: tap is a no-op (the book has nothing to read yet).
  // Failed rows: tap routes to the remove flow so the user can recover.
  const handlePress = () => {
    if (isProcessing) return;
    if (isFailed && onRemove) {
      onRemove(book);
      return;
    }
    onPress(book);
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={handlePress}
      onLongPress={onLongPress ? () => onLongPress(book) : undefined}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.bookRow,
        pressed && !isProcessing && { backgroundColor: tokens.bgColors.raised },
        isProcessing && { opacity: 0.7 },
      ]}
    >
      <BookCover book={book} size="sm" />
      <View style={styles.bookMeta}>
        <Text style={styles.bookRowTitle} numberOfLines={1}>
          {book.title}
        </Text>
        <Text variant="body-xs" color="muted" numberOfLines={1}>
          {book.author}
        </Text>
        {!isProcessing && !isFailed && (inProgress || finished) && (
          <View style={styles.rowProgressWrap}>
            <ProgressBar percent={book.progressPercent} height={2} />
          </View>
        )}
        {!isProcessing && !isFailed && notStarted && <View style={styles.notStartedSpacer} />}
        {isProcessing ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={tokens.textColors.subtle} />
            <Text variant="body-xs" color="subtle" numberOfLines={1}>
              Processing…
            </Text>
          </View>
        ) : isFailed ? (
          <Text variant="body-xs" color="error" numberOfLines={1}>
            Upload failed · tap to remove
          </Text>
        ) : (
          <Text
            variant="body-xs"
            color={notStarted ? 'disabled' : 'subtle'}
            numberOfLines={1}
          >
            {bookStatusLine(book, new Date())}
          </Text>
        )}
      </View>
      {isProcessing ? null : isFailed ? (
        <Icon name="X" size={16} color={tokens.textColors.disabled} />
      ) : (
        <Icon name="ChevronRight" size={16} color={tokens.textColors.disabled} />
      )}
    </Pressable>
  );
}

function bookStatusLine(book: Book, now: Date): string {
  if (book.progressPercent === 100) {
    return `Finished · 100% · ${formatRelativeTime(book.lastReadAt, now)}`;
  }
  if (book.progressPercent === 0) {
    return `Not started · added ${formatRelativeTime(book.addedAt, now)}`;
  }
  const pageNum = book.currentChapter?.match(/\d+/)?.[0];
  const pagePart = pageNum ? `Page ${pageNum}` : null;
  return [pagePart, `read ${formatRelativeTime(book.lastReadAt, now)}`]
    .filter(Boolean)
    .join(' · ');
}

function formatRelativeTime(date: Date | null, now: Date): string {
  if (!date) return 'never';
  // Clamp to >= 0 so any clock skew (device behind server, or a stale `now`
  // from a long-stationary screen) reads as "just now" instead of negative.
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return '1 week ago';
  if (weeks < 4) return `${weeks} weeks ago`;
  return date.toLocaleDateString();
}

// ─── Sort / filter sheet ─────────────────────────────────────────────────────

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'added', label: 'Recently added' },
  { key: 'title', label: 'Title A–Z' },
  { key: 'progress', label: 'Progress' },
];

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'not-started', label: 'Not started' },
  { key: 'finished', label: 'Finished' },
];

function SortFilterSheet({
  sortBy,
  filterBy,
  counts,
  onSortChange,
  onFilterChange,
  onReset,
  onApply,
}: {
  sortBy: SortKey;
  filterBy: FilterKey;
  counts: Record<FilterKey, number>;
  onSortChange: (k: SortKey) => void;
  onFilterChange: (k: FilterKey) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  return (
    <View>
      <View style={styles.sheetTitleRow}>
        <Text style={styles.sheetTitle}>Sort &amp; filter</Text>
        <Pressable onPress={onReset} hitSlop={8}>
          <Text style={styles.sheetReset}>Reset</Text>
        </Pressable>
      </View>

      <Text style={styles.sheetSectionLabel}>Sort by</Text>
      <View style={styles.sheetOptions}>
        {SORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onSortChange(opt.key)}
            style={[
              styles.sheetOption,
              sortBy === opt.key && styles.sheetOptionActive,
            ]}
          >
            <RadioDot checked={sortBy === opt.key} />
            <Text style={styles.sheetOptionLabel}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.sheetDivider} />

      <Text style={styles.sheetSectionLabel}>Filter</Text>
      <View style={styles.sheetOptions}>
        {FILTER_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => onFilterChange(opt.key)}
            style={[
              styles.sheetOption,
              filterBy === opt.key && styles.sheetOptionActive,
            ]}
          >
            <RadioDot checked={filterBy === opt.key} />
            <Text style={[styles.sheetOptionLabel, { flex: 1 }]}>{opt.label}</Text>
            <Text style={styles.sheetOptionCount}>{counts[opt.key]}</Text>
          </Pressable>
        ))}
      </View>

      <Button
        label="Apply"
        variant="primary"
        size="large"
        fullWidth
        onPress={onApply}
        style={styles.applyBtn}
      />
    </View>
  );
}

function RadioDot({ checked }: { checked: boolean }) {
  return (
    <View style={[styles.radio, checked && styles.radioChecked]}>
      {checked && <View style={styles.radioDot} />}
    </View>
  );
}

// ─── Book action sheet (long-press) ──────────────────────────────────────────

/**
 * Bottom sheet shown when a library row is long-pressed. Hosts the two
 * destructive-ish actions on a book (re-process / remove) inside the same
 * visual language as `AddBookSheet`: a header with a small book preview,
 * a hairline divider, two icon-led action rows, and a cancel footer.
 *
 * The component is intentionally presentational — the parent owns the
 * `actionBook` state and the action handlers, so the sheet can render an
 * empty placeholder for one frame while the BottomSheet animates closed
 * (state clears on dismiss).
 */
function BookActionSheetContent({
  book,
  onViewHighlights,
  onReprocess,
  onRemove,
  onCancel,
}: {
  book: Book | null;
  onViewHighlights: () => void;
  onReprocess: () => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  // Render a tiny placeholder during the dismiss animation rather than
  // returning null — null collapses the sheet's intrinsic height and makes
  // it visibly snap.
  if (!book) {
    return <View style={styles.actionSheetPlaceholder} />;
  }

  const status = book.processingStatus;
  const isProcessing = status === 'processing' || status === 'pending';

  return (
    <View>
      <View style={styles.actionSheetHeader}>
        <BookCover book={book} size="sm" />
        <View style={styles.actionSheetHeaderText}>
          <Text style={styles.actionSheetTitle} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author ? (
            <Text style={styles.actionSheetAuthor} numberOfLines={1}>
              {book.author}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.actionSheetDivider} />

      <ActionRow
        iconBg={tokens.colors.amber[200]}
        iconName="Notebook"
        iconColor={tokens.colors.ink[700]}
        title="View highlights"
        desc="Browse saved words and sentences"
        onPress={onViewHighlights}
      />

      <ActionRow
        iconBg={tokens.colors.forest[50]}
        iconName="Refresh"
        iconColor={tokens.colors.forest[800]}
        title="Re-process chapters"
        desc={
          isProcessing
            ? 'Restart processing from the original file'
            : 'Re-detect chapters from the original file'
        }
        onPress={onReprocess}
      />

      <ActionRow
        iconBg={tokens.colors.errorBg}
        iconName="Trash"
        iconColor={tokens.colors.error}
        title="Remove from library"
        desc="Delete this book and its files"
        destructive
        onPress={onRemove}
      />

      <View style={styles.actionSheetFooter}>
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          style={({ pressed }) => [
            styles.actionSheetCancel,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.actionSheetCancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ActionRow({
  iconBg,
  iconName,
  iconColor,
  title,
  desc,
  destructive,
  onPress,
}: {
  iconBg: string;
  iconName: 'Refresh' | 'Trash' | 'Notebook';
  iconColor: string;
  title: string;
  desc: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={[styles.actionRowIcon, { backgroundColor: iconBg }]}>
        <Icon name={iconName} size={20} color={iconColor} strokeWidth={1.75} />
      </View>
      <View style={styles.actionRowText}>
        <Text
          style={[
            styles.actionRowTitle,
            destructive && { color: tokens.colors.error },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.actionRowDesc}>{desc}</Text>
      </View>
      <Icon name="ChevronRight" size={16} color={tokens.colors.ink[300]} />
    </Pressable>
  );
}

// ─── Remove-book confirm sheet ───────────────────────────────────────────────

/**
 * Designed destructive-confirmation sheet for removing a book. Replaces
 * the native `Alert.alert` so the flow stays in our visual language
 * (matches the action sheet styling) and so we can show the book's cover
 * + title in the confirmation — easier to recognise the right book than
 * a string in a system alert.
 *
 * Layout:
 *   - Header: forward-loaded warning icon (red), short title.
 *   - Body:   book cover + title/author + warning copy listing what gets
 *             deleted (file, chapters, progress).
 *   - Footer: stacked buttons — destructive "Remove book" on top (so the
 *             primary CTA reads first on tall handsets) and a secondary
 *             "Cancel" below it.
 */
function RemoveBookSheetContent({
  book,
  removing,
  onConfirm,
  onCancel,
}: {
  book: Book | null;
  removing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!book) {
    return <View style={styles.actionSheetPlaceholder} />;
  }

  return (
    <View>
      <View style={styles.removeSheetHeader}>
        <View style={styles.removeSheetIcon}>
          <Icon
            name="Trash"
            size={18}
            color={tokens.colors.error}
            strokeWidth={1.75}
          />
        </View>
        <View style={styles.removeSheetHeaderText}>
          <Text style={styles.removeSheetTitle}>Remove book?</Text>
          <Text style={styles.removeSheetSubtitle}>
            This can't be undone.
          </Text>
        </View>
      </View>

      <View style={styles.removeSheetBookRow}>
        <BookCover book={book} size="sm" />
        <View style={styles.removeSheetBookText}>
          <Text style={styles.removeSheetBookTitle} numberOfLines={2}>
            {book.title}
          </Text>
          {book.author ? (
            <Text style={styles.removeSheetBookAuthor} numberOfLines={1}>
              {book.author}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.removeSheetWarning}>
        <Text style={styles.removeSheetWarningText}>
          Removing this book deletes the original file, all extracted
          chapters, and your reading progress.
        </Text>
      </View>

      <View style={styles.removeSheetFooter}>
        <Pressable
          accessibilityRole="button"
          disabled={removing}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.removeSheetDestructive,
            pressed && { backgroundColor: tokens.colors.errorPressed },
            removing && { opacity: 0.7 },
          ]}
        >
          {removing ? (
            <ActivityIndicator size="small" color={tokens.colors.cream[50]} />
          ) : (
            <>
              <Icon
                name="Trash"
                size={14}
                color={tokens.colors.cream[50]}
                strokeWidth={2}
              />
              <Text style={styles.removeSheetDestructiveLabel}>Remove book</Text>
            </>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={removing}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.removeSheetCancel,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.removeSheetCancelLabel}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Shared primitives ───────────────────────────────────────────────────────

// Signed-URL resolution + cache lives in `~/lib/bookCovers` so that
// any screen rendering a cover (Library, Listen history, Now Playing,
// etc.) shares one cache and we don't re-sign the same path across
// surfaces. Re-exported under the legacy name for App.tsx — the
// next-user-sign-in purge calls it from there.
export { clearBookCoverCache as clearLibrarySignedUrlCache } from '~/lib/bookCovers';

function BookCover({
  book,
  size,
}: {
  book: Book;
  size: 'sm' | 'hero' | 'result';
}) {
  const dims = COVER_DIMS[size];
  const path = book.coverStoragePath ?? null;
  const [coverUrl, setCoverUrl] = useState<string | null>(() =>
    path ? peekCachedCoverUrl(path) : null,
  );

  useEffect(() => {
    if (!path) {
      setCoverUrl(null);
      return;
    }
    let cancelled = false;
    void resolveCoverUrl(path).then((url) => {
      if (!cancelled) setCoverUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <View
      style={[
        styles.cover,
        {
          width: dims.width,
          height: dims.height,
          backgroundColor: book.coverColor,
          borderRadius: dims.radius,
          overflow: 'hidden',
        },
      ]}
    >
      {coverUrl ? (
        <Image
          source={{ uri: coverUrl }}
          style={{ width: dims.width, height: dims.height }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.coverInitial, { fontSize: dims.fontSize }]} color="inverse">
          {book.title.charAt(0)}
        </Text>
      )}
      {book.downloaded && (
        <View style={[styles.downloadedBadge, size === 'sm' && styles.downloadedBadgeSm]}>
          <Icon name="Download" size={size === 'sm' ? 7 : 8} color={tokens.colors.cream[50]} strokeWidth={2.5} />
        </View>
      )}
    </View>
  );
}

function ProgressBar({ percent, height }: { percent: number; height: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, { width: `${clamped}%` }]} />
    </View>
  );
}

const COVER_DIMS = {
  sm:     { width: 40, height: 60, radius: tokens.radii.xs, fontSize: 16 },
  hero:   { width: 64, height: 96, radius: tokens.radii.sm, fontSize: 22 },
  result: { width: 36, height: 54, radius: tokens.radii.xs, fontSize: 14 },
} as const;

// ─── Library empty state ─────────────────────────────────────────────────────

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function LibraryEmptyContent({
  userName,
  onUpload,
  onSeeAll,
  onBookPress,
}: {
  userName?: string;
  onUpload: () => void;
  onSeeAll: () => void;
  onBookPress: (id: string) => void;
}) {
  const now = new Date();
  const firstName = userName?.split(' ')[0] ?? 'there';

  return (
    <View style={styles.emptyZone}>
      <View style={styles.greeting}>
        <Text style={styles.greetingLine}>{greeting(now)}</Text>
        <Text style={styles.greetingName}>Welcome, {firstName}.</Text>
      </View>

      <View style={styles.uploadBlock}>
        <BookIllustration />
        <Text style={styles.uploadTitle}>Add your first book</Text>
        <Text style={styles.uploadSub}>
          Upload a PDF or EPUB, or choose something from our free library below.
        </Text>
        <Button
          label="Upload a book"
          variant="primary"
          size="large"
          leadingIcon="Upload"
          fullWidth
          onPress={onUpload}
        />
        <Text style={styles.uploadFormats}>EPUB or PDF · max 50 MB</Text>
      </View>

      <View style={styles.freeSection}>
        <View style={styles.freeHeader}>
          <Text style={styles.freeLabel}>Free to read</Text>
          <Pressable onPress={onSeeAll} hitSlop={8}>
            <Text style={styles.seeAll}>See all →</Text>
          </Pressable>
        </View>
        <View style={styles.bookGrid}>
          {CURATED_LIBRARY.map((book) => (
            <Pressable
              key={book.id}
              onPress={() => onBookPress(book.id)}
              style={styles.bookCard}
            >
              <View style={styles.bookCardCover}>
                <Svg
                  style={StyleSheet.absoluteFillObject}
                  width="100%"
                  height="100%"
                  preserveAspectRatio="none"
                >
                  <Defs>
                    <SvgLinearGradient
                      id={`empty-${book.id}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <Stop offset="0" stopColor={book.cover.from} />
                      <Stop offset="1" stopColor={book.cover.to} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                    fill={`url(#empty-${book.id})`}
                  />
                  {book.cover.border && (
                    <Rect
                      x={0}
                      y={0}
                      width="100%"
                      height="100%"
                      fill="none"
                      stroke={book.cover.border}
                      strokeWidth={0.5}
                    />
                  )}
                </Svg>
              </View>
              <Text style={styles.bookCardTitle} numberOfLines={2}>
                {book.shortTitle}
              </Text>
              <Text style={styles.bookCardAuthor} numberOfLines={1}>
                {book.shortAuthor}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function BookIllustration() {
  return (
    <Svg width={148} height={110} viewBox="0 0 320 240" style={styles.illus}>
      {/* Left page */}
      <SvgPath
        d="M 80 80 L 80 180 L 160 180 L 160 90 C 160 86, 156 80, 150 80 L 88 80 C 84 80, 80 84, 80 88 Z"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Spine */}
      <SvgPath
        d="M 160 90 L 160 180"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      {/* Right page */}
      <SvgPath
        d="M 160 180 L 240 180 L 240 90 C 240 86, 236 80, 230 80 L 168 80 C 164 80, 160 84, 160 88"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Page lines left */}
      {[100, 112, 124, 136, 148, 160].map((y, i) => (
        <SvgPath
          key={y}
          d={`M 92 ${y} L ${i === 3 || i === 5 ? 138 : 148} ${y}`}
          fill="none"
          stroke={tokens.colors.forest[800]}
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.5}
        />
      ))}
      {/* Right page wave lines */}
      <SvgPath
        d="M 175 110 C 185 105, 195 115, 205 110 C 215 105, 225 115, 235 110"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <SvgPath
        d="M 175 128 C 185 120, 195 136, 205 128 C 215 120, 225 136, 235 128"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <SvgPath
        d="M 175 146 C 185 140, 195 152, 205 146 C 215 140, 225 152, 235 146"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      <SvgPath
        d="M 175 164 C 185 160, 195 168, 205 164 C 215 160, 225 168, 235 164"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {/* Outer arc */}
      <SvgPath
        d="M 256 100 C 264 110, 268 122, 268 132 C 268 142, 264 154, 256 162"
        fill="none"
        stroke={tokens.colors.forest[800]}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.7}
      />
      {/* Amber accent dot */}
      <SvgCircle cx={205} cy={146} r={8} fill={tokens.colors.amber[500]} />
    </Svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Offline banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: tokens.space.lg,
    backgroundColor: OFFLINE_BG,
    borderBottomWidth: 0.5,
    borderBottomColor: OFFLINE_BORDER,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: OFFLINE_COLOR,
    flexShrink: 0,
  },
  offlineTextWrap: {
    flex: 1,
  },
  offlineTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: OFFLINE_COLOR,
  },
  offlineSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },
  offlineRetryBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: OFFLINE_BORDER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  offlineRetryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: OFFLINE_COLOR,
  },

  // Dimmed icon button
  circleButtonDimmed: {
    opacity: 0.4,
  },

  // Streaming unavailable tag
  streamingUnavailable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  streamingUnavailableText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.disabled,
  },

  // Download badge on cover
  downloadedBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    borderWidth: 2,
    borderColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadedBadgeSm: {
    width: 15,
    height: 15,
    borderRadius: 8,
    top: -5,
    right: -5,
    borderWidth: 1.5,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.sm,
    paddingBottom: tokens.space['2xl'],
  },
  searchScrollContent: {
    paddingBottom: tokens.space['2xl'],
  },
  emptyScrollContent: {
    flexGrow: 1,
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space['2xl'],
  },

  // Library header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: tokens.space.sm,
    marginBottom: tokens.space.md,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: -0.4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: tokens.space.sm,
  },
  circleButton: {
    width: 36,
    height: 36,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search header
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  searchPill: {
    flex: 1,
    height: 38,
    borderRadius: tokens.radii.full,
    backgroundColor: tokens.bgColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingHorizontal: tokens.space.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchPillFocused: {
    borderColor: tokens.colors.forest[800],
  },
  searchInput: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    padding: 0,
  },
  clearBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.colors.ink[300],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cancelBtn: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.accent,
    flexShrink: 0,
  },

  // Recent searches
  recentSection: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
  },
  recentLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: tokens.space.md,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: tokens.space.xs,
  },
  recentChipBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  recentChipLabel: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.secondary,
  },

  // Results
  resultsMeta: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.sm,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
  },
  resultList: {
    marginHorizontal: tokens.space.lg,
    borderRadius: tokens.radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
    backgroundColor: tokens.bgColors.canvas,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.listRow.paddingX,
    minHeight: 68,
    backgroundColor: tokens.bgColors.canvas,
  },
  resultInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  resultTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  resultHighlight: {
    backgroundColor: tokens.colors.amber[200],
    borderRadius: 2,
  },
  nudgeSpacing: {
    marginTop: tokens.space.lg,
  },

  // No results
  noResults: {
    paddingVertical: 48,
    paddingHorizontal: tokens.space.xl,
    alignItems: 'center',
  },
  noResultsTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    marginBottom: tokens.space.sm,
  },
  noResultsSub: {
    textAlign: 'center',
  },

  // Discover nudge
  discoverNudge: {
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.xl,
    backgroundColor: tokens.colors.forest[50],
    borderRadius: tokens.radii.xl,
    paddingVertical: 14,
    paddingHorizontal: tokens.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
  },
  nudgeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nudgeText: {
    flex: 1,
  },
  nudgeTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
    marginBottom: 2,
  },
  nudgeSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[700],
    lineHeight: 16,
  },

  // Continue card
  continueSection: {
    marginBottom: tokens.space.lg,
  },
  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: tokens.space.sm,
  },
  continueCard: {
    flexDirection: 'row',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii['2xl'],
    borderTopWidth: 1,
    borderTopColor: tokens.bgColors.canvas,
    padding: tokens.space.md,
    gap: tokens.space.md,
  },
  continueMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  bookTitleHero: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  continueStatus: {
    marginTop: tokens.space.xs,
  },
  progressWrap: {
    marginTop: tokens.space.sm,
    marginBottom: tokens.space.sm,
  },
  continueActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    marginTop: tokens.space.xs,
  },
  listenWrap: {
    flex: 1,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: tokens.space.sm,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  sectionLabelBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  sectionLabelCount: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.subtle,
  },
  sortPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },

  // Book list
  bookList: {
    borderRadius: tokens.radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
    backgroundColor: tokens.bgColors.canvas,
  },
  bookDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingVertical: tokens.space.sm,
    paddingHorizontal: tokens.listRow.paddingX,
    minHeight: 72,
    backgroundColor: tokens.bgColors.canvas,
  },
  bookMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  bookRowTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  rowProgressWrap: {
    marginTop: 4,
    marginBottom: 2,
  },
  notStartedSpacer: {
    height: 6,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },

  // Cover
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  coverInitial: {
    fontFamily: tokens.fonts.display,
    color: tokens.textColors.inverse,
    fontWeight: '500',
  },

  // Progress bar
  progressTrack: {
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },

  // Sort/filter sheet
  sheetTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.lg,
    paddingTop: tokens.space.xs,
  },
  sheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
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
    marginBottom: tokens.space.sm,
  },
  sheetOptions: {
    gap: 2,
    marginBottom: tokens.space.lg,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.sm,
    paddingVertical: 10,
    paddingHorizontal: tokens.space.md,
    borderRadius: tokens.radii.md,
  },
  sheetOptionActive: {
    backgroundColor: tokens.colors.forest[50],
  },
  sheetOptionLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  sheetOptionCount: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.subtle,
  },
  sheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
    marginBottom: tokens.space.lg,
  },
  applyBtn: {
    marginTop: tokens.space.xs,
  },

  // Radio
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.default,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioChecked: {
    borderColor: tokens.colors.forest[800],
    backgroundColor: tokens.colors.forest[800],
  },
  radioDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Empty state
  emptyZone: {
    // Horizontal padding now lives on `emptyScrollContent` so the Header
    // shares the same grid as the content below it.
  },
  greeting: {
    marginBottom: 28,
  },
  greetingLine: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.subtle,
    marginBottom: 3,
  },
  greetingName: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: -0.2,
  },
  uploadBlock: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii['3xl'],
    paddingTop: tokens.space.xl,
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.lg,
    alignItems: 'center',
    gap: tokens.space.lg,
    marginBottom: tokens.space.xl,
  },
  illus: {
    alignSelf: 'center',
  },
  uploadTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    lineHeight: 24,
    marginTop: -tokens.space.xs,
  },
  uploadSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -tokens.space.sm,
  },
  uploadFormats: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    marginTop: -tokens.space.sm,
  },
  freeSection: {
    paddingBottom: tokens.space.lg,
  },
  freeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.space.md,
  },
  freeLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  seeAll: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.accent,
  },
  bookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.md,
  },
  bookCard: {
    width: '30%',
    flexShrink: 1,
    gap: 7,
  },
  bookCardCover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: tokens.radii.sm,
    overflow: 'hidden',
  },
  bookCardTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 15,
  },
  bookCardAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.subtle,
  },

  // Long-press action sheet
  actionSheetPlaceholder: {
    height: 120,
  },
  actionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.md,
  },
  actionSheetHeaderText: {
    flex: 1,
  },
  actionSheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  actionSheetAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  actionSheetDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: tokens.space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[100],
  },
  actionRowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionRowText: {
    flex: 1,
  },
  actionRowTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  actionRowDesc: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    lineHeight: 16,
  },
  actionSheetFooter: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.xl,
  },
  actionSheetCancel: {
    height: 44,
    borderRadius: 10,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSheetCancelLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },

  // Remove-book confirm sheet
  removeSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.sm,
  },
  removeSheetIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.colors.errorBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  removeSheetHeaderText: {
    flex: 1,
  },
  removeSheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  removeSheetSubtitle: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  removeSheetBookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.lg,
    paddingVertical: tokens.space.md,
    paddingHorizontal: tokens.space.md,
    marginHorizontal: tokens.space.lg,
    marginTop: tokens.space.sm,
  },
  removeSheetBookText: {
    flex: 1,
  },
  removeSheetBookTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  removeSheetBookAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  removeSheetWarning: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: tokens.space.lg,
  },
  removeSheetWarningText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
  },
  removeSheetFooter: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xl,
    gap: tokens.space.sm,
  },
  removeSheetDestructive: {
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.colors.error,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  removeSheetDestructiveLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  removeSheetCancel: {
    height: 48,
    borderRadius: 12,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeSheetCancelLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },

  // Reading-stats card (above the book grid). Width-wise it sits inside
  // the scroll container's existing horizontal padding (same as
  // ContinueCard / BookList rows) so left/right edges align with the
  // rest of the column. Adding marginHorizontal here would make it
  // narrower than its neighbours.
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii['2xl'],
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: tokens.space.xs,
    marginBottom: tokens.space.md,
    gap: 14,
  },
  statsCardLeft: {
    flex: 1,
  },
  statsCardHeadline: {
    fontFamily: tokens.fonts.display,
    fontSize: 18,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 22,
  },
  statsCardSubline: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
    marginTop: 2,
    marginBottom: 12,
  },
  statsDots: {
    flexDirection: 'row',
    gap: 10,
  },
  statsDotColumn: {
    alignItems: 'center',
    gap: 4,
  },
  statsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: 'transparent',
  },
  statsDotFilled: {
    backgroundColor: tokens.colors.forest[800],
    borderColor: tokens.colors.forest[800],
  },
  statsDotToday: {
    backgroundColor: tokens.colors.amber[500],
    borderColor: tokens.colors.amber[500],
  },
  statsDotTodayEmpty: {
    borderColor: tokens.colors.amber[500],
    borderWidth: 1.5,
  },
  statsDotLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 9,
    color: tokens.textColors.subtle,
    letterSpacing: 0.3,
  },
  statsDotLabelToday: {
    color: tokens.textColors.secondary,
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
  },
  statsStreakBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radii.md,
    backgroundColor: tokens.bgColors.canvas,
    minWidth: 68,
  },
  statsStreakValue: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    fontWeight: '500',
    color: tokens.colors.amber[500],
    lineHeight: 26,
  },
  statsStreakLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.textColors.muted,
    marginTop: 2,
    letterSpacing: 0.3,
  },
});
