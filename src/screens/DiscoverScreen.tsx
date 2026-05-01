import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, TabBar, type TabKey, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

type DiscoverBook = {
  id: string;
  title: string;
  coverLabel?: string;
  author: string;
  coverColor: string;
  tags: string[];
  readTime: string;
  chapters: number;
  about: string;
  source?: string;
  related?: { id: string; title: string; coverColor: string }[];
};

// ─── Cover palette ────────────────────────────────────────────────────────────

const CC = {
  forest:  '#1B4332',
  brown:   '#5C4A3A',
  forest7: '#234D38',
  amber:   '#D4A574',
  slate:   '#4A5568',
  rust:    '#7C3A2A',
  teal:    '#2A6B6E',
  plum:    '#5A3D6E',
  olive:   '#5A6E3D',
} as const;

// ─── Mock data ────────────────────────────────────────────────────────────────

const B: Record<string, DiscoverBook> = {
  meditations: {
    id: 'meditations', title: 'Meditations', author: 'Marcus Aurelius',
    coverColor: CC.plum, tags: ['Philosophy', 'Stoicism', 'Roman'], readTime: '~5h', chapters: 12,
    about: "Private notes of a Roman Emperor — a daily practice of Stoic philosophy that's still surprisingly practical 1,800 years on.",
    source: 'Project Gutenberg · originally written c. 161 AD.',
    related: [
      { id: 'walden', title: 'Walden', coverColor: CC.olive },
      { id: 'jekyll', title: 'Dr Jekyll and Mr Hyde', coverColor: CC.slate },
      { id: 'pride', title: 'Pride and Prejudice', coverColor: CC.brown },
    ],
  },
  ageOfInnocence: {
    id: 'ageOfInnocence', title: 'The Age of Innocence', author: 'Edith Wharton',
    coverColor: CC.brown, tags: ['Fiction', 'Society', 'American'], readTime: '~12h', chapters: 34,
    about: "Newland Archer, engaged to the conventional May Welland, falls for her unconventional cousin. A sharp portrait of Old New York's unspoken rules.",
    source: 'Standard Ebooks · originally published 1920.',
  },
  sunAlsoRises: {
    id: 'sunAlsoRises', title: 'The Sun Also Rises', author: 'Ernest Hemingway',
    coverColor: CC.rust, tags: ['Fiction', 'Lost Generation', 'American'], readTime: '~8h', chapters: 19,
    about: "Jake Barnes and a circle of expatriates drift from Paris to Pamplona for the bullfights. Hemingway's first novel — taut, spare, devastating.",
    source: 'Project Gutenberg · originally published 1926.',
  },
  tenderIsTheNight: {
    id: 'tenderIsTheNight', title: 'Tender Is the Night', author: 'F.S. Fitzgerald',
    coverColor: CC.teal, tags: ['Fiction', 'Jazz Age', 'American'], readTime: '~13h', chapters: 34,
    about: "Dick and Nicole Diver, glamorous on the French Riviera, slowly unravel. Fitzgerald's most autobiographical novel.",
    source: 'Project Gutenberg · originally published 1934.',
  },
  sisterCarrie: {
    id: 'sisterCarrie', title: 'Sister Carrie', author: 'Theodore Dreiser',
    coverColor: CC.olive, tags: ['Naturalism', 'Drama', 'American'], readTime: '~17h', chapters: 47,
    about: "A young woman rises through Chicago by ambition and luck while those around her fall. Dreiser's unflinching debut.",
    source: 'Project Gutenberg · originally published 1900.',
  },
  metamorphosis: {
    id: 'metamorphosis', title: 'The Metamorphosis', author: 'Franz Kafka',
    coverColor: CC.forest, tags: ['Surrealism', 'Short', 'German'], readTime: '~2h', chapters: 3,
    about: "Gregor Samsa wakes to find himself transformed into a monstrous insect. Bizarre, funny, and quietly devastating.",
    source: 'Standard Ebooks · originally published 1915.',
  },
  oldManAndSea: {
    id: 'oldManAndSea', title: 'The Old Man and the Sea', author: 'Ernest Hemingway',
    coverColor: CC.amber, tags: ['Fiction', 'Short', 'American'], readTime: '~3h', chapters: 1,
    about: "An aging Cuban fisherman struggles alone in the Gulf Stream with a giant marlin. The novella that won Hemingway the Pulitzer Prize.",
    source: 'Project Gutenberg · originally published 1952.',
  },
  jekyll: {
    id: 'jekyll', title: 'Dr Jekyll and Mr Hyde',
    coverLabel: 'The Strange Case of Dr Jekyll',
    author: 'Robert Louis Stevenson',
    coverColor: CC.slate, tags: ['Gothic', 'Horror', 'British'], readTime: '~2h', chapters: 10,
    about: "A London lawyer investigates his friend Dr Jekyll and the violent Mr Hyde. A foundational text of psychological horror.",
    source: 'Standard Ebooks · originally published 1886.',
  },
  pride: {
    id: 'pride', title: 'Pride and Prejudice', author: 'Jane Austen',
    coverColor: CC.brown, tags: ['Romance', '19th Century', 'British'], readTime: '~9h', chapters: 61,
    about: "The witty Elizabeth Bennet navigates questions of marriage and social standing in rural England. Austen's most beloved novel.",
    source: 'Standard Ebooks · originally published 1813.',
  },
  middlemarch: {
    id: 'middlemarch', title: 'Middlemarch', author: 'George Eliot',
    coverColor: CC.forest7, tags: ['Realism', 'Victorian', 'British'], readTime: '~28h', chapters: 86,
    about: 'A panoramic study of English provincial life — doctors, landowners, idealists — told with compassion and moral intelligence.',
    source: 'Standard Ebooks · originally published 1871.',
  },
  annaKarenina: {
    id: 'annaKarenina', title: 'Anna Karenina', author: 'Leo Tolstoy',
    coverColor: CC.rust, tags: ['Russian', 'Drama', '19th Century'], readTime: '~36h', chapters: 239,
    about: "Anna's affair with Count Vronsky sets her on a collision course with Russian society. Tolstoy's towering social novel.",
    source: 'Project Gutenberg · originally published 1878.',
  },
  janeEyre: {
    id: 'janeEyre', title: 'Jane Eyre', author: 'Charlotte Brontë',
    coverColor: CC.slate, tags: ['Gothic', 'Romance', 'Victorian'], readTime: '~16h', chapters: 38,
    about: "An orphaned governess falls for the brooding Mr Rochester — until a terrible secret changes everything. Gothic romance at its peak.",
    source: 'Standard Ebooks · originally published 1847.',
  },
};

const FEATURED = B.meditations;
const GATSBY_RAIL: DiscoverBook[] = [B.ageOfInnocence, B.sunAlsoRises, B.tenderIsTheNight, B.sisterCarrie];
const SHORT_READS: DiscoverBook[] = [B.metamorphosis, B.oldManAndSea, B.jekyll];
const CLASSICS: DiscoverBook[] = [B.pride, B.middlemarch, B.annaKarenina, B.janeEyre];
const PRE_ADDED = new Set(['tenderIsTheNight', 'pride']);

const CATEGORIES = ['For you', 'Classics', 'Philosophy', 'Self-development', 'Short reads', 'In Twi'];

// ─── Screen ───────────────────────────────────────────────────────────────────

export type DiscoverScreenProps = {
  onTabChange: (tab: TabKey) => void;
};

export function DiscoverScreen({ onTabChange }: DiscoverScreenProps) {
  const [view, setView] = useState<'home' | 'category' | 'detail'>('home');
  const [activeCategory, setActiveCategory] = useState('For you');
  const [detailBook, setDetailBook] = useState<DiscoverBook | null>(null);
  const [detailFrom, setDetailFrom] = useState<'home' | 'category'>('home');
  const [libraryIds, setLibraryIds] = useState<Set<string>>(PRE_ADDED);

  const toggleLibrary = (id: string) =>
    setLibraryIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const openDetail = (book: DiscoverBook, from: 'home' | 'category') => {
    setDetailBook(book);
    setDetailFrom(from);
    setView('detail');
  };

  const openCategory = (cat: string) => {
    setActiveCategory(cat);
    setView('category');
  };

  if (view === 'detail' && detailBook) {
    return (
      <DetailView
        book={detailBook}
        inLibrary={libraryIds.has(detailBook.id)}
        onBack={() => setView(detailFrom)}
        onToggleLibrary={() => toggleLibrary(detailBook.id)}
        onTabChange={onTabChange}
      />
    );
  }

  if (view === 'category') {
    return (
      <CategoryView
        category={activeCategory}
        books={CLASSICS}
        libraryIds={libraryIds}
        onToggleLibrary={toggleLibrary}
        onBook={(b) => openDetail(b, 'category')}
        onBack={() => setView('home')}
        onTabChange={onTabChange}
      />
    );
  }

  return (
    <HomeView
      activeCategory={activeCategory}
      libraryIds={libraryIds}
      onToggleLibrary={toggleLibrary}
      onCategory={openCategory}
      onBook={(b) => openDetail(b, 'home')}
      onTabChange={onTabChange}
    />
  );
}

// ─── Home view ────────────────────────────────────────────────────────────────

function HomeView({
  activeCategory,
  libraryIds,
  onToggleLibrary,
  onCategory,
  onBook,
  onTabChange,
}: {
  activeCategory: string;
  libraryIds: Set<string>;
  onToggleLibrary: (id: string) => void;
  onCategory: (cat: string) => void;
  onBook: (book: DiscoverBook) => void;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.homeHeader}>
          <Text style={s.homeTitle}>Discover</Text>
        </View>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Icon name="Search" size={16} color={tokens.colors.ink[400]} />
          <Text style={s.searchPlaceholder}>Search books…</Text>
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
        >
          {CATEGORIES.map((cat) => {
            const active = cat === activeCategory;
            return (
              <Pressable
                key={cat}
                onPress={() => cat !== 'For you' ? onCategory(cat) : undefined}
                style={[s.chip, active ? s.chipActive : s.chipInactive]}
              >
                <Text style={[s.chipText, { color: active ? tokens.colors.cream[50] : tokens.colors.ink[700] }]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Featured this week */}
        <View style={[s.sectionRow, { marginBottom: 10 }]}>
          <Text style={s.sectionTitle}>Featured this week</Text>
        </View>
        <FeaturedCard
          book={FEATURED}
          inLibrary={libraryIds.has(FEATURED.id)}
          onPress={() => onBook(FEATURED)}
          onToggle={() => onToggleLibrary(FEATURED.id)}
        />

        {/* Because you're reading Gatsby */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Because you're reading Gatsby</Text>
          <Pressable hitSlop={8}><Text style={s.seeAll}>See all →</Text></Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.railScroll}
        >
          {GATSBY_RAIL.map((book) => (
            <RailCard
              key={book.id}
              book={book}
              inLibrary={libraryIds.has(book.id)}
              onPress={() => onBook(book)}
            />
          ))}
        </ScrollView>

        {/* Short reads */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>Short reads · under 100 pages</Text>
          <Pressable hitSlop={8}><Text style={s.seeAll}>See all →</Text></Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.railScroll, { paddingBottom: 28 }]}
        >
          {SHORT_READS.map((book) => (
            <ShortCard key={book.id} book={book} onPress={() => onBook(book)} />
          ))}
        </ScrollView>
      </ScrollView>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

function FeaturedCard({
  book, inLibrary, onPress, onToggle,
}: {
  book: DiscoverBook; inLibrary: boolean; onPress: () => void; onToggle: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.featuredCard}>
      <View style={[s.featuredCoverCol, { backgroundColor: book.coverColor }]}>
        <Text style={s.featuredCoverText}>{book.coverLabel ?? book.title}</Text>
      </View>
      <View style={s.featuredInfo}>
        <Text style={s.featuredEyebrow}>✦ Editor's pick</Text>
        <Text style={s.featuredBookTitle}>{book.title}</Text>
        <Text style={s.featuredAuthor}>{book.author}</Text>
        <Text style={s.featuredBlurb} numberOfLines={3}>{book.about}</Text>
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
          style={[s.featuredAddBtn, inLibrary && s.featuredAddBtnAdded]}
        >
          <Icon
            name={inLibrary ? 'Check' : 'Plus'}
            size={11}
            color={inLibrary ? tokens.colors.forest[800] : tokens.colors.forest[900]}
            strokeWidth={2}
          />
          <Text style={[s.featuredAddBtnText, { color: inLibrary ? tokens.colors.forest[800] : tokens.colors.forest[900] }]}>
            {inLibrary ? 'In library' : 'Add to library'}
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

function RailCard({ book, inLibrary, onPress }: { book: DiscoverBook; inLibrary: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.railCard}>
      <View style={[s.railCover, { backgroundColor: book.coverColor }]}>
        <Text style={s.railCoverText}>{book.coverLabel ?? book.title}</Text>
        {inLibrary && (
          <View style={s.addedBadge}>
            <Icon name="Check" size={9} color={tokens.colors.cream[50]} strokeWidth={2.5} />
          </View>
        )}
      </View>
      <Text style={s.railCardTitle} numberOfLines={2}>{book.title}</Text>
      <Text style={s.railCardMeta}>{book.author}</Text>
    </Pressable>
  );
}

function ShortCard({ book, onPress }: { book: DiscoverBook; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.shortCard}>
      <View style={[s.shortCover, { backgroundColor: book.coverColor }]}>
        <Text style={s.shortCoverText} numberOfLines={2}>{book.coverLabel ?? book.title}</Text>
        <View style={s.readTimeBadge}>
          <Text style={s.readTimeText}>{book.readTime}</Text>
        </View>
      </View>
      <Text style={[s.railCardTitle, { fontSize: 11 }]} numberOfLines={2}>{book.title}</Text>
      <Text style={s.railCardMeta}>{book.author}</Text>
    </Pressable>
  );
}

// ─── Category view ────────────────────────────────────────────────────────────

function CategoryView({
  category, books, libraryIds, onToggleLibrary, onBook, onBack, onTabChange,
}: {
  category: string;
  books: DiscoverBook[];
  libraryIds: Set<string>;
  onToggleLibrary: (id: string) => void;
  onBook: (book: DiscoverBook) => void;
  onBack: () => void;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.catHeader}>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={8}>
          <Icon name="ArrowLeft" size={18} color={tokens.colors.ink[700]} />
        </Pressable>
        <View style={s.catHeaderInfo}>
          <Text style={s.catHeaderTitle}>{category}</Text>
          <Text style={s.catHeaderMeta}>{books.length * 20}+ books · all free</Text>
        </View>
        <Pressable style={s.catFilterBtn} hitSlop={8}>
          <Icon name="Filter" size={16} color={tokens.colors.ink[700]} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.catBookList}>
          {books.map((book, i) => {
            const inLibrary = libraryIds.has(book.id);
            return (
              <View key={book.id}>
                {i > 0 && <View style={s.catDivider} />}
                <Pressable onPress={() => onBook(book)} style={s.catBookCard}>
                  <View style={[s.catBookCover, { backgroundColor: book.coverColor }]}>
                    <Text style={s.catCoverText}>{book.coverLabel ?? book.title}</Text>
                  </View>
                  <View style={s.catBookInfo}>
                    <Text style={s.catBookTitle}>{book.title}</Text>
                    <Text style={s.catBookAuthor}>{book.author}</Text>
                    <View style={s.catTags}>
                      {book.tags.slice(0, 2).map((tag) => (
                        <View key={tag} style={s.catTag}>
                          <Text style={s.catTagText}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={s.catActions}>
                      <Pressable
                        onPress={(e) => { e.stopPropagation?.(); onToggleLibrary(book.id); }}
                        style={inLibrary ? s.catAddedBtn : s.catAddBtn}
                      >
                        <Icon
                          name={inLibrary ? 'Check' : 'Plus'}
                          size={10}
                          color={inLibrary ? tokens.colors.forest[800] : tokens.colors.cream[50]}
                          strokeWidth={2.5}
                        />
                        <Text style={inLibrary ? s.catAddedBtnText : s.catAddBtnText}>
                          {inLibrary ? 'In library' : 'Add'}
                        </Text>
                      </Pressable>
                      <Text style={s.catReadTime}>{book.readTime} read</Text>
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

// ─── Detail view ──────────────────────────────────────────────────────────────

function DetailView({
  book, inLibrary, onBack, onToggleLibrary, onTabChange,
}: {
  book: DiscoverBook;
  inLibrary: boolean;
  onBack: () => void;
  onToggleLibrary: () => void;
  onTabChange: (tab: TabKey) => void;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.detailHeader}>
        <Pressable onPress={onBack} style={s.iconBtn} hitSlop={8}>
          <Icon name="ArrowLeft" size={18} color={tokens.colors.ink[700]} />
        </Pressable>
        <Pressable style={s.iconBtn} hitSlop={8}>
          <Icon name="Upload" size={17} color={tokens.colors.ink[700]} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.detailScroll}>
        <View style={s.detailCoverWrap}>
          <View style={[s.detailCover, { backgroundColor: book.coverColor }]}>
            <Text style={s.detailCoverText}>{book.coverLabel ?? book.title}</Text>
          </View>
        </View>

        <Text style={s.detailBookTitle}>{book.title}</Text>
        <Text style={s.detailAuthor}>{book.author}</Text>

        <View style={s.detailMetaRow}>
          <View style={s.detailMetaItem}>
            <Text style={s.detailMetaValue}>{book.readTime}</Text>
            <Text style={s.detailMetaLabel}>Read time</Text>
          </View>
          <View style={s.detailMetaDivider} />
          <View style={s.detailMetaItem}>
            <Text style={s.detailMetaValue}>{book.chapters}</Text>
            <Text style={s.detailMetaLabel}>Chapters</Text>
          </View>
          <View style={s.detailMetaDivider} />
          <View style={s.detailMetaItem}>
            <View style={s.freeBadge}>
              <Text style={s.freeBadgeText}>Free</Text>
            </View>
          </View>
        </View>

        <Text style={s.detailSectionLabel}>About</Text>
        <Text style={s.detailAbout}>{book.about}</Text>

        <Text style={s.detailSectionLabel}>Topics</Text>
        <View style={s.detailTags}>
          {book.tags.map((tag) => (
            <View key={tag} style={s.detailTag}>
              <Text style={s.detailTagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {book.source && (
          <>
            <Text style={s.detailSectionLabel}>Source</Text>
            <Text style={s.detailSource}>{book.source}</Text>
          </>
        )}

        {book.related && book.related.length > 0 && (
          <>
            <Text style={[s.detailSectionLabel, { marginBottom: 8 }]}>If you like this</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.relatedRail}>
                {book.related.map((rel) => (
                  <View key={rel.id} style={s.relatedCard}>
                    <View style={[s.relatedCover, { backgroundColor: rel.coverColor }]}>
                      <Text style={s.relatedCoverText}>{rel.title}</Text>
                    </View>
                    <Text style={s.relatedTitle} numberOfLines={2}>{rel.title}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={s.detailCTABar}>
        <Pressable
          onPress={onToggleLibrary}
          style={[s.detailPrimaryBtn, inLibrary && s.detailPrimaryBtnAdded]}
        >
          <Icon
            name={inLibrary ? 'Check' : 'Plus'}
            size={15}
            color={inLibrary ? tokens.colors.forest[800] : tokens.colors.cream[50]}
          />
          <Text style={[s.detailPrimaryBtnText, { color: inLibrary ? tokens.colors.forest[800] : tokens.colors.cream[50] }]}>
            {inLibrary ? 'In library' : 'Add to library'}
          </Text>
        </Pressable>
        <Pressable style={s.detailSampleBtn}>
          <Icon name="Play" size={14} color={tokens.colors.ink[700]} />
        </Pressable>
      </View>

      <TabBar activeTab="discover" onChange={onTabChange} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },

  // Shared
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Home
  homeHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  homeTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    color: tokens.colors.ink[900],
    letterSpacing: -0.5,
  },
  searchBar: {
    marginHorizontal: 20,
    marginBottom: 14,
    height: 40,
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 9999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  searchPlaceholder: {
    fontSize: 14,
    color: tokens.colors.ink[400],
    fontFamily: tokens.fonts.ui,
  },
  chipScroll: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    gap: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: tokens.colors.forest[800] },
  chipInactive: {
    backgroundColor: tokens.colors.cream[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
  },
  chipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.colors.ink[900],
  },
  seeAll: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.forest[800],
  },

  // Featured card
  featuredCard: {
    marginHorizontal: 20,
    marginBottom: 22,
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  featuredCoverCol: {
    width: 90,
    flexShrink: 0,
    minHeight: 130,
    padding: 10,
    justifyContent: 'flex-end',
  },
  featuredCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 8,
    color: tokens.colors.forest[200],
    lineHeight: 11,
  },
  featuredInfo: {
    flex: 1,
    padding: 14,
    paddingLeft: 12,
  },
  featuredEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.forest[200],
    marginBottom: 6,
  },
  featuredBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    color: tokens.colors.cream[50],
    lineHeight: 18,
    marginBottom: 4,
  },
  featuredAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    marginBottom: 8,
  },
  featuredBlurb: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.forest[200],
    lineHeight: 16.5,
    opacity: 0.85,
    marginBottom: 10,
  },
  featuredAddBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.amber[500],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
  },
  featuredAddBtnAdded: {
    backgroundColor: tokens.colors.forest[100],
  },
  featuredAddBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
  },

  // Rail cards
  railScroll: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  railCard: {
    width: 108,
    gap: 7,
  },
  railCover: {
    width: 108,
    height: 158,
    borderRadius: 7,
    padding: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  railCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7,
    color: tokens.colors.cream[50],
    lineHeight: 9,
  },
  railCardTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 12,
    color: tokens.colors.ink[900],
    lineHeight: 15.6,
  },
  railCardMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
  addedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Short reads cards
  shortCard: {
    width: 130,
    gap: 7,
  },
  shortCover: {
    width: 130,
    height: 90,
    borderRadius: 8,
    padding: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  shortCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 7.5,
    color: tokens.colors.cream[50],
    lineHeight: 10,
  },
  readTimeBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  readTimeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 9,
    color: '#fff',
  },

  // Category view
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  catFilterBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: tokens.colors.cream[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  catHeaderInfo: { flex: 1 },
  catHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    color: tokens.colors.ink[900],
    letterSpacing: -0.2,
  },
  catHeaderMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
    marginTop: 1,
  },
  catBookList: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  catDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    marginVertical: 14,
  },
  catBookCard: {
    flexDirection: 'row',
    gap: 14,
  },
  catBookCover: {
    width: 72,
    height: 104,
    borderRadius: 6,
    padding: 7,
    justifyContent: 'flex-end',
    flexShrink: 0,
    overflow: 'hidden',
  },
  catCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 6.5,
    color: tokens.colors.cream[50],
    lineHeight: 8.5,
  },
  catBookInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  catBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    color: tokens.colors.ink[900],
    lineHeight: 17.5,
  },
  catBookAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[500],
  },
  catTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4,
  },
  catTag: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  catTagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[500],
  },
  catActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  catAddBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  catAddBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.cream[50],
  },
  catAddedBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[50],
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[200],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  catAddedBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  catReadTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },

  // Detail view
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  detailScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  detailCoverWrap: {
    alignItems: 'center',
    marginBottom: 18,
  },
  detailCover: {
    width: 120,
    height: 176,
    borderRadius: 8,
    padding: 10,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  detailCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 9,
    color: tokens.colors.cream[50],
    lineHeight: 11.25,
  },
  detailBookTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 22,
    color: tokens.colors.ink[900],
    textAlign: 'center',
    letterSpacing: -0.22,
    lineHeight: 26.4,
    marginBottom: 4,
  },
  detailAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.colors.ink[500],
    textAlign: 'center',
    marginBottom: 14,
  },
  detailMetaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.colors.ink[200],
  },
  detailMetaItem: {
    alignItems: 'center',
    gap: 3,
  },
  detailMetaValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.colors.ink[900],
  },
  detailMetaLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
  },
  detailMetaDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: tokens.colors.ink[200],
    alignSelf: 'stretch',
  },
  freeBadge: {
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  freeBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    color: tokens.colors.forest[800],
  },
  detailSectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 8,
  },
  detailAbout: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[700],
    lineHeight: 21.45,
    marginBottom: 16,
  },
  detailTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  detailTag: {
    backgroundColor: tokens.colors.cream[100],
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  detailTagText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[700],
  },
  detailSource: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
    lineHeight: 16.5,
    marginBottom: 18,
  },
  relatedRail: {
    flexDirection: 'row',
    gap: 10,
  },
  relatedCard: {
    width: 80,
  },
  relatedCover: {
    width: 80,
    height: 116,
    borderRadius: 5,
    padding: 6,
    justifyContent: 'flex-end',
    marginBottom: 5,
    overflow: 'hidden',
  },
  relatedCoverText: {
    fontFamily: tokens.fonts.display,
    fontSize: 6,
    color: tokens.colors.cream[50],
    lineHeight: 7.5,
  },
  relatedTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 10,
    color: tokens.colors.ink[900],
    lineHeight: 13,
  },
  detailCTABar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.colors.ink[200],
    backgroundColor: tokens.bgColors.canvas,
  },
  detailPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailPrimaryBtnAdded: {
    backgroundColor: tokens.colors.forest[50],
    borderWidth: 0.5,
    borderColor: tokens.colors.forest[200],
  },
  detailPrimaryBtnText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
  },
  detailSampleBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: tokens.colors.cream[100],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.colors.ink[200],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
