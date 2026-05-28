/**
 * TranslateChapterScreen — page-translation result.
 *
 * Loads a single page's translated text via the `useTranslation`
 * hook (server-cached on (page_id, target_language)) and renders it
 * with the same Literata-flavoured typography as the reader so a
 * translated page reads like the original. Includes a language
 * picker chip row so the user can quickly retry into another
 * language without leaving the screen.
 *
 * Per the chapters → pages refactor this is one page at a time. A
 * future "translate range" view would reuse the multi-page form of
 * the edge function.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import {
  COMMON_LANGUAGES,
  useTranslation,
  type TranslationLanguage,
} from '~/lib/aiTranslate';
import { formatNetworkError } from '~/lib/networkErrors';
import { useBackHandler } from '~/lib/useBackHandler';

export type TranslateChapterScreenProps = {
  book: Book;
  /** 0-based DB page to translate. Defaults to book.last_read_page. */
  pageIndex?: number;
  /** Initial target language. Falls back to 'twi' if unset. */
  initialLanguage?: string;
  onBack: () => void;
  onShare?: () => void;
};

export function TranslateChapterScreen({
  book,
  pageIndex,
  initialLanguage,
  onBack,
  onShare,
}: TranslateChapterScreenProps) {
  // PageIndex is now state, not a derived constant — the bottom
  // page selector flips it without forcing the user to back out
  // and reopen Translate. Initial value comes from the prop, the
  // book's last-read pointer, or 0 as the final fallback.
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(
    () =>
      pageIndex ??
      (book as { last_read_page?: number }).last_read_page ??
      0,
  );
  const [targetLanguage, setTargetLanguage] = useState(initialLanguage ?? 'twi');

  const totalPages = book.totalPages || 0;
  const canGoPrev = currentPageIndex > 0;
  const canGoNext = totalPages > 0 && currentPageIndex < totalPages - 1;
  const goPrevPage = () => {
    if (!canGoPrev) return;
    setCurrentPageIndex((p) => Math.max(0, p - 1));
  };
  const goNextPage = () => {
    if (!canGoNext) return;
    setCurrentPageIndex((p) =>
      totalPages > 0 ? Math.min(totalPages - 1, p + 1) : p + 1,
    );
  };

  const state = useTranslation({
    bookId: book.id,
    pageIndex: currentPageIndex,
    targetLanguage,
  });

  // Route Android hardware-back through the same callback the
  // in-screen chevron uses so testers don't bounce to the root
  // "Press back again to exit" handler.
  useBackHandler(() => {
    onBack();
    return true;
  });

  const loading = state.status === 'loading';
  const failed = state.status === 'error';
  const translation = state.status === 'success' ? state.translation : null;
  // Mirror the AIToolsScreen / Practice error-message priority:
  //   1. Network-shaped raw messages → shared friendly mapper.
  //   2. Domain code → translateErrorMessage (handles
  //      missing_translation, page_too_short, etc).
  //   3. Other raw → friendly fallback via formatNetworkError.
  // Replaces the legacy `errorMessage ?? translateErrorMessage(code)`
  // ordering which leaked raw network errors when the AI client
  // threw mid-fetch.
  const errorMessage = (() => {
    if (state.status !== 'error') return null;
    const raw = state.errorMessage;
    if (raw && /network request failed|network error|failed to fetch|abort|timeout/i.test(raw)) {
      return formatNetworkError(raw, 'translating this page');
    }
    if (state.errorCode) {
      return translateErrorMessage(state.errorCode);
    }
    if (raw) {
      return formatNetworkError(raw, 'translating this page');
    }
    return null;
  })();

  const activeLabel =
    COMMON_LANGUAGES.find((l) => l.code === targetLanguage)?.label ??
    titleCase(targetLanguage);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Back"
        >
          <Icon name="ArrowLeft" size={14} color={tokens.textColors.secondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Page translation</Text>
          {/* Subtitle is now book title only — the page label moved to
              the bottom selector where prev/next live. Two affordances
              for "what page am I on" in the same screen was redundant. */}
          <Text style={styles.headerSub} numberOfLines={1}>
            {book.title}
          </Text>
        </View>
        <Pressable
          onPress={onShare ?? (() => {})}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityLabel="Share"
          disabled={!translation}
        >
          <Icon
            name="Upload"
            size={15}
            color={translation ? tokens.textColors.secondary : tokens.textColors.disabled}
          />
        </Pressable>
      </View>

      {/* Language picker — horizontal scrolling chips. Tapping a chip
          swaps the target and re-runs the hook (server cache covers
          repeat picks instantly). */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.langScroll}
        contentContainerStyle={styles.langRow}
      >
        {COMMON_LANGUAGES.map((lang) => (
          <LanguageChip
            key={lang.code}
            lang={lang}
            active={lang.code === targetLanguage}
            onPress={() => setTargetLanguage(lang.code)}
          />
        ))}
      </ScrollView>

      {/* Body */}
      {loading ? (
        <View style={styles.statusZone}>
          <ActivityIndicator size="small" color={tokens.colors.forest[800]} />
          <Text style={styles.statusLabel}>Translating to {activeLabel}…</Text>
        </View>
      ) : failed ? (
        <View style={styles.statusZone}>
          <Icon name="AlertCircle" size={28} color={tokens.colors.error} strokeWidth={1.5} />
          <Text style={styles.statusTitle}>Translation failed</Text>
          <Text style={styles.statusBody}>{errorMessage}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
            onPress={() => {
              // Forcing a re-render with the same key kicks the hook
              // back into loading; same trick we use in Summary.
              setTargetLanguage((l) => l);
            }}
          >
            <Icon name="Refresh" size={14} color={tokens.colors.cream[50]} />
            <Text style={styles.retryLabel}>Try again</Text>
          </Pressable>
        </View>
      ) : translation ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sourceNote}>
            <Icon name="Globe" size={12} color={tokens.textColors.disabled} strokeWidth={1.5} />
            <Text style={styles.sourceNoteText}>
              Translated to {activeLabel}
              {state.status === 'success' && state.cached ? ' · cached' : ''}
            </Text>
          </View>

          {translation
            .split(/\n{2,}/)
            .map((p) => p.trim())
            .filter(Boolean)
            .map((p, i) => (
              <Text key={i} style={styles.paragraph}>
                {p}
              </Text>
            ))}
        </ScrollView>
      ) : null}

      {/* Bottom page selector — three columns: prev / "Page X of Y" /
          next. Tapping prev or next changes the page state, which
          re-runs the translation hook. The client cache short-
          circuits the network on pages we've already translated this
          session, so flipping back and forth is instant. */}
      <View style={styles.pageNav}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          onPress={goPrevPage}
          disabled={!canGoPrev}
          style={({ pressed }) => [
            styles.pageNavBtn,
            !canGoPrev && styles.pageNavBtnDisabled,
            pressed && canGoPrev && { opacity: 0.7 },
          ]}
        >
          <Icon
            name="PlayerSkipBack"
            size={18}
            color={
              canGoPrev
                ? tokens.textColors.secondary
                : tokens.textColors.disabled
            }
          />
        </Pressable>
        <Text style={styles.pageNavLabel}>
          Page {currentPageIndex + 1}
          {totalPages > 0 ? ` of ${totalPages}` : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next page"
          onPress={goNextPage}
          disabled={!canGoNext}
          style={({ pressed }) => [
            styles.pageNavBtn,
            !canGoNext && styles.pageNavBtnDisabled,
            pressed && canGoNext && { opacity: 0.7 },
          ]}
        >
          <Icon
            name="PlayerSkipForward"
            size={18}
            color={
              canGoNext
                ? tokens.textColors.secondary
                : tokens.textColors.disabled
            }
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function LanguageChip({
  lang,
  active,
  onPress,
}: {
  lang: TranslationLanguage;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.langChip, active && styles.langChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.langChipLabel, active && styles.langChipLabelActive]}>
        {lang.label}
      </Text>
    </Pressable>
  );
}

function translateErrorMessage(code: string): string {
  switch (code) {
    case 'page_not_found':
      return "Couldn't find this page in the book. Try re-processing.";
    case 'page_too_short':
      return "This page doesn't have enough text to translate.";
    case 'target_language_invalid':
      return 'That language target isn\'t recognised. Pick one of the suggestions.';
    case 'server_misconfigured':
      return 'The translation service is temporarily unavailable.';
    case 'llm_failed':
      return 'The model couldn\'t complete the translation. Try again in a moment.';
    case 'request_failed':
    case 'function_failed':
      return 'Network issue talking to the translation service.';
    default:
      return 'Something went wrong with the translation.';
  }
}

function titleCase(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    gap: 8,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: tokens.bgColors.surface,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  headerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    marginTop: 1,
  },

  // The horizontal ScrollView would otherwise stretch to fill the column;
  // pinning flexGrow: 0 keeps it at its content height. alignItems: 'center'
  // on the row prevents chips from being stretched to the row's cross axis.
  langScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  langRow: {
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.md,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  langChip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.bgColors.surface,
  },
  langChipActive: {
    backgroundColor: tokens.colors.forest[800],
  },
  langChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  langChipLabelActive: {
    color: tokens.colors.cream[50],
  },

  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 40,
  },
  sourceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  sourceNoteText: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    letterSpacing: 0.2,
  },
  paragraph: {
    fontFamily: 'Literata_400Regular',
    fontSize: 17,
    lineHeight: 17 * 1.7,
    color: tokens.textColors.primary,
    marginBottom: 18,
  },

  statusZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  statusLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
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
    lineHeight: 19,
    color: tokens.textColors.muted,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: tokens.colors.forest[800],
    marginTop: 10,
  },
  retryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Bottom page selector — flush with the safe-area bottom, hairline
  // divider on top so it reads as part of the screen chrome rather
  // than floating over the content.
  pageNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space.xl,
    paddingVertical: tokens.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  pageNavBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  pageNavBtnDisabled: {
    opacity: 0.4,
  },
  pageNavLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.primary,
    letterSpacing: 0.2,
  },
});
