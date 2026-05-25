/**
 * OnboardingFirstBookScreen — Step 2 of 2 onboarding for new users.
 *
 * Activation gate: the empty-library new-user is the worst engagement
 * profile we have. This screen makes it ~impossible to leave onboarding
 * with nothing in the library — six pre-curated public-domain books
 * sit one tap away. Upload is offered as a secondary tab for users who
 * arrive with a specific PDF/EPUB.
 *
 * Per /Users/completefarmer/Downloads/05_first_book.html.
 *
 * On Continue:
 *   - library tab    · caller copies the chosen `CuratedBook` into the
 *                      user's library + emits `signup_first_book_picked`
 *                      with `{ source: 'library', bookId }`
 *   - upload tab     · caller invokes the document picker, parses with
 *                      epubjs/pdfjs, persists, then advances. (UI only
 *                      here — picker wiring is M2.)
 *   - skip           · caller emits `{ source: 'skipped' }` and routes
 *                      straight to /library.
 */

import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Button } from '~/components/Button';
import { Icon } from '~/components/Icon';
import { Text } from '~/components/Text';
import { CURATED_LIBRARY, type CuratedBook, type CuratedBookId } from '~/data/curatedLibrary';
import { tokens } from '~/design/tokens';

type Tab = 'library' | 'upload';

export type FirstBookSelection =
  | { source: 'library'; books: CuratedBook[] }
  | { source: 'upload' }; // M2 will carry the parsed file metadata

export type OnboardingFirstBookScreenProps = {
  /** Continue with the made selection. Caller persists + emits analytics. */
  onContinue: (selection: FirstBookSelection) => void;
  /** Skip without picking. Caller emits "skipped" + routes to /library. */
  onSkip: () => void;
  /**
   * Open the native document picker. Wired up at the call site so this
   * screen stays platform-agnostic. Until it's implemented (M2), the
   * Choose-file button is a no-op.
   */
  onPickFile?: () => void;
};

export function OnboardingFirstBookScreen({
  onContinue,
  onSkip,
  onPickFile,
}: OnboardingFirstBookScreenProps) {
  const [tab, setTab] = useState<Tab>('library');
  // Multi-select: the picker now accepts any number of books from the
  // curated grid (1..N), not just one. Activation data showed that
  // users who add 2-3 books in onboarding return at substantially
  // higher rates than 1-book users — they have a backlog instead of
  // a single "did I finish it?" obligation. Using a Set keeps
  // toggle / membership checks O(1) across the 6-card grid.
  const [selectedIds, setSelectedIds] = useState<Set<CuratedBookId>>(
    () => new Set(),
  );
  const selectedCount = selectedIds.size;

  const toggleSelect = (id: CuratedBookId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canContinue = tab === 'library' && selectedCount > 0;
  // Singular/plural in the CTA so the button confirms what it'll do.
  // Even a single-book user sees the same affordance as before — the
  // multi-book flow doesn't penalise the simple case with awkward
  // copy like "Add 1 book(s)".
  const ctaLabel =
    selectedCount > 1
      ? `Add ${selectedCount} books to library`
      : 'Add to library';

  const handleContinue = () => {
    if (tab !== 'library' || selectedCount === 0) return;
    // Preserve curated-library order rather than selection order so
    // the user's library lands in the same canonical ordering they
    // saw in the grid — and downstream tests / analytics see stable
    // book ids regardless of tap sequence.
    const books = CURATED_LIBRARY.filter((b) => selectedIds.has(b.id));
    if (books.length === 0) return;
    onContinue({ source: 'library', books });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.content}>
        {/* Top bar — progress (100%, step 2 of 2) + Skip */}
        <View style={styles.topbar}>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Pressable onPress={onSkip} hitSlop={8} accessibilityRole="button">
            <RNText style={styles.skipText}>Skip for now</RNText>
          </Pressable>
        </View>

        {/* Title */}
        <View style={styles.titleBlock}>
          <RNText style={styles.title}>Pick your first book.</RNText>
          <Text variant="body-md" color="muted" style={styles.sub}>
            Choose from our library to start reading right away, or bring your own.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TabButton
            label="From our library"
            iconName="Books"
            active={tab === 'library'}
            onPress={() => setTab('library')}
          />
          <TabButton
            label="Upload your own"
            iconName="Upload"
            active={tab === 'upload'}
            onPress={() => setTab('upload')}
          />
        </View>

        {/* Tab content */}
        {tab === 'library' ? (
          <LibraryTab selectedIds={selectedIds} onToggle={toggleSelect} />
        ) : (
          <UploadTab onPickFile={onPickFile} />
        )}

        {/* CTA */}
        <View style={styles.actions}>
          <Button
            label={ctaLabel}
            variant="primary"
            size="large"
            fullWidth
            disabled={!canContinue}
            onPress={handleContinue}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ============================================================================
// Tabs (segmented control)
// ============================================================================

function TabButton({
  label,
  iconName,
  active,
  onPress,
}: {
  label: string;
  iconName: 'Books' | 'Upload';
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Icon
        name={iconName}
        size={14}
        color={active ? tokens.textColors.primary : tokens.textColors.muted}
      />
      <RNText style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</RNText>
    </Pressable>
  );
}

// ============================================================================
// Library tab — 3-column book grid
// ============================================================================

function LibraryTab({
  selectedIds,
  onToggle,
}: {
  selectedIds: Set<CuratedBookId>;
  onToggle: (id: CuratedBookId) => void;
}) {
  return (
    <ScrollView
      style={styles.tabContent}
      contentContainerStyle={styles.gridContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.grid}>
        {CURATED_LIBRARY.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            selected={selectedIds.has(book.id)}
            onPress={() => onToggle(book.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function BookCard({
  book,
  selected,
  onPress,
}: {
  book: CuratedBook;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      // Checkbox semantics — taps toggle membership rather than
      // mutually exclude others (which would be the radio pattern
      // we used to have).
      accessibilityRole="checkbox"
      accessibilityState={{ selected, checked: selected }}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <View style={[styles.cover, selected && styles.coverSelected]}>
        <BookCoverArt
          cover={book.cover}
          title={book.title}
          author={book.author}
          gutenbergId={book.gutenbergId}
        />
        {/* Selected check badge — floats over the top-right of the
            cover so the multi-select state is unmistakable at a
            glance. Without this, several cards with the same forest
            ring blend together and the user has to count rings to
            know what's selected. */}
        {selected && (
          <View style={styles.coverCheck}>
            <Icon name="Check" size={12} color={tokens.colors.cream[50]} strokeWidth={3} />
          </View>
        )}
      </View>
      <View style={styles.cardMeta}>
        <RNText style={styles.cardTitle} numberOfLines={1}>
          {book.shortTitle}
        </RNText>
        <RNText style={styles.cardAuthor} numberOfLines={1}>
          {book.shortAuthor}
        </RNText>
      </View>
    </Pressable>
  );
}

/**
 * Cover artwork — real Project Gutenberg cover when available, with
 * the existing 135deg gradient + typography as a fallback for books
 * Gutenberg doesn't have a cover image for (and as the placeholder
 * shown for the ~200-500ms while the image is loading).
 *
 * The gradient previously rendered alone, which looked plain enough
 * that testers asked whether the thumbnails were broken. Real covers
 * carry the book's identity at a glance.
 */
function BookCoverArt({
  cover,
  title,
  author,
  gutenbergId,
}: {
  cover: CuratedBook['cover'];
  title: string;
  author: string;
  gutenbergId?: number;
}) {
  const gradientId = `cover-${title.replace(/\W+/g, '-')}`;
  // Track load + error so we can fade the real cover in only when
  // it's actually painted, and keep the gradient visible if the
  // image 404s (some Gutenberg entries have no cover).
  const [imgReady, setImgReady] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showRealCover = !!gutenbergId && imgReady && !imgFailed;
  // Project Gutenberg's stable cover URL pattern. The `medium` size
  // is ~150x225 — perfect for a 3-column thumbnail grid.
  const coverUri = gutenbergId
    ? `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
    : null;

  return (
    <View style={styles.coverArt}>
      {/* Gradient + typography fallback. Always rendered, hidden
          behind the real cover once it loads. This is also the
          permanent state for books without a Gutenberg cover. */}
      <Svg
        style={StyleSheet.absoluteFillObject}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* 135deg ≈ top-left → bottom-right */}
          <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={cover.from} />
            <Stop offset="1" stopColor={cover.to} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>

      {cover.border && <View style={[styles.coverHairline, { borderColor: cover.border }]} />}

      <View style={styles.coverTextBlock} pointerEvents="none">
        <RNText style={[styles.coverTitle, { color: cover.titleColor }]}>{title}</RNText>
        <RNText style={[styles.coverAuthor, { color: cover.authorColor }]}>{author}</RNText>
      </View>

      {/* Real Gutenberg cover — fades over the gradient once loaded.
          Kept absolutely positioned so the gradient renders behind it
          for the brief load window and as a permanent fallback if
          the image fails. */}
      {coverUri && (
        <Image
          source={{ uri: coverUri }}
          style={[
            StyleSheet.absoluteFillObject,
            { opacity: showRealCover ? 1 : 0 },
          ]}
          resizeMode="cover"
          onLoad={() => setImgReady(true)}
          onError={() => setImgFailed(true)}
          accessible={false}
        />
      )}
    </View>
  );
}

// ============================================================================
// Upload tab — dropzone (UI only)
// ============================================================================

function UploadTab({ onPickFile }: { onPickFile?: () => void }) {
  return (
    <View style={styles.uploadArea}>
      <View style={styles.dropzone}>
        <View style={styles.dropzoneIcon}>
          <Icon name="CloudUpload" size={28} color={tokens.colors.forest[800]} />
        </View>

        <View style={styles.dropzoneTextBlock}>
          <RNText style={styles.dropzoneHeadline}>Bring your own book</RNText>
          <Text variant="body-sm" color="muted" align="center" style={styles.dropzoneSub}>
            Tap to browse files on your phone. EPUB or PDF.
          </Text>
        </View>

        <Button
          label="Choose file"
          variant="secondary"
          size="standard"
          onPress={onPickFile ?? (() => {})}
        />
      </View>

      <RNText style={styles.uploadFormats}>
        EPUB, PDF · max 50MB · stays private to you
      </RNText>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const COVER_RADIUS = 6;
const CARD_PAD = 4;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  content: {
    flex: 1,
    paddingTop: tokens.space.lg,
    paddingHorizontal: tokens.space.xl,
    paddingBottom: tokens.space.xl,
  },

  // Top bar
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    marginBottom: tokens.space['2xl'],
    gap: tokens.space.lg,
  },
  progressTrack: {
    flex: 1,
    maxWidth: 200,
    height: 4,
    backgroundColor: tokens.colors.ink[100],
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: '100%',
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 2,
  },
  skipText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  // Title
  titleBlock: {
    marginBottom: tokens.space.xl,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 30,
    fontWeight: '500',
    lineHeight: 34,
    letterSpacing: -0.6,
    color: tokens.textColors.primary,
    marginBottom: tokens.space.sm,
  },
  sub: {
    fontSize: 14,
    lineHeight: 21,
  },

  // Tabs (iOS pill-style segmented control)
  tabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: tokens.colors.cream[100],
    padding: 4,
    borderRadius: 10,
    marginBottom: tokens.space.lg,
  },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabActive: {
    backgroundColor: tokens.colors.cream[50],
    // Web/native subtle elevation
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  tabLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.muted,
  },
  tabLabelActive: {
    color: tokens.textColors.primary,
  },

  // Tab content area
  tabContent: {
    flex: 1,
  },
  gridContent: {
    paddingBottom: tokens.space.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Negative margin trick to give a uniform 12px column gap and 14px row gap.
    marginHorizontal: -6,
  },

  // Book card
  card: {
    width: '33.3333%',
    paddingHorizontal: 6,
    marginBottom: 14,
  },
  cardSelected: {
    // Wrap-bg per spec — applied via inner padding to keep grid sizing stable.
  },
  cover: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: COVER_RADIUS,
    overflow: 'hidden',
    backgroundColor: tokens.colors.cream[200],
    // Soft elevation on the cover itself
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  coverSelected: {
    // 2.5px forest ring per spec (rendered as inset border to avoid layout shift).
    borderWidth: 2.5,
    borderColor: tokens.colors.forest[800],
    shadowColor: tokens.colors.forest[800],
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  coverArt: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  coverHairline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: COVER_RADIUS,
  },
  coverTextBlock: {
    alignItems: 'center',
  },
  // Multi-select check badge floating over the top-right of the
  // cover. Forest pill with a white check, sized just large enough
  // to be unambiguous without crowding the cover itself.
  coverCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  coverTitle: {
    fontFamily: tokens.fonts.displayBold,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 13,
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  coverAuthor: {
    fontFamily: tokens.fonts.displayItalic,
    fontSize: 9,
    fontStyle: 'italic',
    lineHeight: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  cardMeta: {
    marginTop: 8,
    paddingHorizontal: 2,
  },
  cardTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: tokens.textColors.primary,
    marginBottom: 2,
  },
  cardAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 14,
    color: tokens.textColors.muted,
  },

  // Upload tab
  uploadArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.lg,
    gap: tokens.space.xl,
  },
  dropzone: {
    width: '100%',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: tokens.colors.ink[200],
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: tokens.space.xl,
    alignItems: 'center',
    gap: tokens.space.lg,
    backgroundColor: tokens.colors.cream[100],
  },
  dropzoneIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropzoneTextBlock: {
    alignItems: 'center',
  },
  dropzoneHeadline: {
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 22,
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  dropzoneSub: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 220,
  },
  uploadFormats: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    textAlign: 'center',
    lineHeight: 16,
  },

  // CTA
  actions: {
    marginTop: tokens.space.lg,
  },
});
