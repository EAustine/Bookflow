import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
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
import { mockBooks } from '~/data/mockBooks';
import type { Book } from '~/types/book';
import { ReaderScreen } from '~/screens/ReaderScreen';
import { ListenScreen, MiniPlayer } from '~/screens/ListenScreen';
import { SoftWarningBanner } from '~/screens/PaywallScreen';

type SortKey = 'recent' | 'added' | 'title' | 'progress';
type FilterKey = 'all' | 'in-progress' | 'not-started' | 'finished';

const NOW = new Date('2026-04-28T10:00:00');
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
};

export function LibraryScreen({ onTabChange, userName, onUpgrade }: LibraryScreenProps) {
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [listeningBook, setListeningBook] = useState<Book | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [miniPlayerBook, setMiniPlayerBook] = useState<Book | null>(null);
  const [appliedSort, setAppliedSort] = useState<SortKey>('recent');
  const [appliedFilter, setAppliedFilter] = useState<FilterKey>('all');
  const [pendingSort, setPendingSort] = useState<SortKey>('recent');
  const [pendingFilter, setPendingFilter] = useState<FilterKey>('all');
  const sheetRef = useRef<BottomSheetRef>(null);

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

  const filtered = mockBooks.filter((b) => {
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

  const continueBook = sorted.find(
    (b) => b.lastReadAt && b.progressPercent > 0 && b.progressPercent < 100,
  );

  const counts: Record<FilterKey, number> = {
    all: mockBooks.length,
    'in-progress': mockBooks.filter((b) => b.progressPercent > 0 && b.progressPercent < 100).length,
    'not-started': mockBooks.filter((b) => b.progressPercent === 0).length,
    finished: mockBooks.filter((b) => b.progressPercent === 100).length,
  };

  // Search results
  const lq = searchQuery.trim().toLowerCase();
  const searchResults = lq
    ? mockBooks.filter(
        (b) =>
          b.title.toLowerCase().includes(lq) ||
          b.author.toLowerCase().includes(lq),
      )
    : [];

  if (listeningBook) {
    return (
      <ListenScreen
        book={listeningBook}
        onBack={() => { setListeningBook(null); setMiniPlayerBook(null); }}
        onMinimize={() => { setMiniPlayerBook(listeningBook); setListeningBook(null); }}
      />
    );
  }

  if (selectedBook) {
    return (
      <ReaderScreen
        book={selectedBook}
        onBack={() => setSelectedBook(null)}
        onListen={() => { setListeningBook(selectedBook); setSelectedBook(null); }}
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
        {miniPlayerBook && (
          <MiniPlayer
            book={miniPlayerBook}
            onExpand={() => { setListeningBook(miniPlayerBook); setMiniPlayerBook(null); }}
          />
        )}
        <TabBar activeTab="library" onChange={onTabChange} />
      </SafeAreaView>
    );
  }

  const isEmpty = mockBooks.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.emptyScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Header onSearch={openSearch} onAdd={() => {}} />
          <LibraryEmptyContent
            userName={userName}
            onUpload={() => {}}
            onSeeAll={() => onTabChange('discover')}
            onBookPress={() => {}}
          />
        </ScrollView>
        {miniPlayerBook && (
          <MiniPlayer
            book={miniPlayerBook}
            onExpand={() => { setListeningBook(miniPlayerBook); setMiniPlayerBook(null); }}
          />
        )}
        <TabBar activeTab="library" onChange={onTabChange} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {showBanner && onUpgrade && (
          <SoftWarningBanner
            minutesLeft={18}
            onUpgrade={onUpgrade}
            onDismiss={() => setShowBanner(false)}
          />
        )}
        <Header onSearch={openSearch} onFilter={openSheet} onAdd={() => {}} />
        {continueBook && <ContinueCard book={continueBook} onOpen={setSelectedBook} />}
        <SectionHeader
          count={sorted.length}
          sortLabel={SORT_LABELS[appliedSort]}
          onSortPress={openSheet}
        />
        <BookList books={sorted} onBookPress={setSelectedBook} />
      </ScrollView>
      {miniPlayerBook && (
        <MiniPlayer
          book={miniPlayerBook}
          onExpand={() => { setListeningBook(miniPlayerBook); setMiniPlayerBook(null); }}
        />
      )}
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
  const chNum = book.currentChapter?.match(/\d+/)?.[0];
  const progressLine =
    book.progressPercent === 0
      ? 'Not started'
      : book.progressPercent === 100
      ? 'Finished · 100%'
      : chNum && book.totalChapters
      ? `Ch. ${chNum} of ${book.totalChapters} · ${book.progressPercent}% done`
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

function Header({
  onSearch,
  onFilter,
  onAdd,
}: {
  onSearch: () => void;
  onFilter?: () => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Library</Text>
      <View style={styles.headerActions}>
        <CircleIconButton icon="Search" onPress={onSearch} />
        {onFilter && <CircleIconButton icon="Filter" onPress={onFilter} />}
        <CircleIconButton icon="Plus" onPress={onAdd} />
      </View>
    </View>
  );
}

function CircleIconButton({
  icon,
  onPress,
}: {
  icon: 'Search' | 'Filter' | 'Plus';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.circleButton,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <Icon name={icon} size={18} color={tokens.textColors.secondary} />
    </Pressable>
  );
}

// ─── Continue card ───────────────────────────────────────────────────────────

function ContinueCard({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {
  const chapterNum = book.currentChapter?.match(/\d+/)?.[0];
  const statusLine = chapterNum && book.totalChapters
    ? `Chapter ${chapterNum} · ${book.progressPercent}% done`
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
            <View style={styles.listenWrap}>
              <Button
                label="Listen"
                variant="primary"
                size="compact"
                leadingIcon="Play"
                fullWidth
                onPress={() => onOpen(book)}
              />
            </View>
            <Button
              label="Read"
              variant="secondary"
              size="compact"
              onPress={() => onOpen(book)}
            />
          </View>
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

function BookList({ books, onBookPress }: { books: Book[]; onBookPress: (book: Book) => void }) {
  return (
    <View style={styles.bookList}>
      {books.map((book, index) => (
        <View key={book.id}>
          <BookListItem book={book} onPress={onBookPress} />
          {index < books.length - 1 && <View style={styles.bookDivider} />}
        </View>
      ))}
    </View>
  );
}

function BookListItem({ book, onPress }: { book: Book; onPress: (book: Book) => void }) {
  const inProgress = book.progressPercent > 0 && book.progressPercent < 100;
  const finished = book.progressPercent === 100;
  const notStarted = book.progressPercent === 0;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(book)}
      style={({ pressed }) => [
        styles.bookRow,
        pressed && { backgroundColor: tokens.bgColors.raised },
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
        {(inProgress || finished) && (
          <View style={styles.rowProgressWrap}>
            <ProgressBar percent={book.progressPercent} height={2} />
          </View>
        )}
        {notStarted && <View style={styles.notStartedSpacer} />}
        <Text
          variant="body-xs"
          color={notStarted ? 'disabled' : 'subtle'}
          numberOfLines={1}
        >
          {bookStatusLine(book, NOW)}
        </Text>
      </View>
      <Icon name="ChevronRight" size={16} color={tokens.textColors.disabled} />
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
  const chNum = book.currentChapter?.match(/\d+/)?.[0];
  const chapterPart =
    chNum && book.totalChapters ? `Ch. ${chNum} of ${book.totalChapters}` : null;
  return [chapterPart, `read ${formatRelativeTime(book.lastReadAt, now)}`]
    .filter(Boolean)
    .join(' · ');
}

function formatRelativeTime(date: Date | null, now: Date): string {
  if (!date) return 'never';
  const diffMs = now.getTime() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
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

// ─── Shared primitives ───────────────────────────────────────────────────────

function BookCover({
  book,
  size,
}: {
  book: Book;
  size: 'sm' | 'hero' | 'result';
}) {
  const dims = COVER_DIMS[size];
  return (
    <View
      style={[
        styles.cover,
        {
          width: dims.width,
          height: dims.height,
          backgroundColor: book.coverColor,
          borderRadius: dims.radius,
        },
      ]}
    >
      <Text style={[styles.coverInitial, { fontSize: dims.fontSize }]} color="inverse">
        {book.title.charAt(0)}
      </Text>
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
    paddingHorizontal: tokens.space.lg,
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
});
