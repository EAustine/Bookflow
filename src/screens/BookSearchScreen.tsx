/**
 * BookSearchScreen — full-text search across one book.
 *
 * Backed by `useBookSearch`, which talks to Postgres FTS via the
 * `pages.content_tsv` index (migration 0012). The screen is a
 * standalone takeover route; the parent reader launches it from
 * Reading Options and receives a `pageIndex` callback when the user
 * taps a result so it can jump to that page.
 *
 * Snippet rendering: each hit's `snippet` is a short excerpt around
 * the first match in the page. The matched substring is highlighted
 * with the saved-word amber tint so the user can find it at a glance.
 */
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import { useBookSearch, type SearchHit } from '~/lib/bookSearch';
import { useBackHandler } from '~/lib/useBackHandler';

export type BookSearchScreenProps = {
  book: Book;
  onClose: () => void;
  /** Called when the user taps a result. The parent jumps and dismisses. */
  onJumpToPage: (pageIndex: number) => void;
};

export function BookSearchScreen({ book, onClose, onJumpToPage }: BookSearchScreenProps) {
  // Route Android hardware-back to the in-screen close affordance
  // so testers land back on the reader instead of falling through
  // to the reader's own back handler (which goes to Library).
  useBackHandler(() => {
    onClose();
    return true;
  });
  const [query, setQuery] = useState('');
  const { results, loading, error } = useBookSearch(book.id, query);
  const trimmed = query.trim();
  const showResults = trimmed.length >= 2;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onClose}
          hitSlop={8}
          style={styles.headerBtn}
        >
          <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} />
        </Pressable>
        <View style={styles.fieldWrap}>
          <Icon name="Search" size={14} color={tokens.textColors.muted} strokeWidth={1.5} />
          <TextInput
            style={styles.field}
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${book.title}…`}
            placeholderTextColor={tokens.textColors.disabled}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {trimmed.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear"
              onPress={() => setQuery('')}
              hitSlop={6}
            >
              <Icon name="X" size={11} color={tokens.colors.ink[400]} strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Body */}
      {!showResults ? (
        <View style={styles.emptyZone}>
          <Icon
            name="Search"
            size={28}
            color={tokens.textColors.muted}
            strokeWidth={1.5}
          />
          <Text style={styles.emptyTitle}>Find anything in this book</Text>
          <Text style={styles.emptyBody}>
            Type a phrase or quoted "exact phrase". Use{' '}
            <Text style={styles.emptyMono}>-</Text> to exclude a word.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.statusZone}>
          <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
        </View>
      ) : error ? (
        <View style={styles.statusZone}>
          <Text style={styles.errorText}>Search failed: {error}</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.statusZone}>
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyBody}>
            Try a shorter or different phrase.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.resultsCount}>
            {results.length === 1 ? '1 match' : `${results.length} matches`}
          </Text>
          {results.map((hit) => (
            <ResultRow key={hit.pageId} hit={hit} onPress={() => onJumpToPage(hit.pageIndex)} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ResultRow({ hit, onPress }: { hit: SearchHit; onPress: () => void }) {
  const { snippet, highlightRange } = hit;
  const before = highlightRange ? snippet.slice(0, highlightRange[0]) : snippet;
  const match = highlightRange ? snippet.slice(highlightRange[0], highlightRange[1]) : '';
  const after = highlightRange ? snippet.slice(highlightRange[1]) : '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: tokens.bgColors.raised }]}
    >
      <View style={styles.rowHeader}>
        <Icon name="Book" size={11} color={tokens.textColors.muted} />
        <Text style={styles.rowPage}>
          {hit.pdfPageNumber !== null
            ? `Page ${hit.pdfPageNumber}`
            : `Page ${hit.pageIndex + 1}`}
        </Text>
      </View>
      <Text style={styles.rowSnippet}>
        {before}
        {match.length > 0 && <Text style={styles.rowSnippetHighlight}>{match}</Text>}
        {after}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.bgColors.surface,
  },
  field: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.primary,
    paddingVertical: 0,
  },
  emptyZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  emptyTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    marginTop: 6,
  },
  emptyBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
  emptyMono: {
    fontFamily: tokens.fonts.uiMedium,
    color: tokens.textColors.secondary,
  },
  statusZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
    gap: 6,
  },
  errorText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.error,
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.md,
    paddingBottom: 40,
  },
  resultsCount: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.textColors.subtle,
    marginBottom: 8,
  },
  row: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii.md,
    marginBottom: 8,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowPage: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.muted,
    letterSpacing: 0.3,
  },
  rowSnippet: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.primary,
  },
  rowSnippetHighlight: {
    backgroundColor: 'rgba(255, 200, 80, 0.4)',
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
  },
});
