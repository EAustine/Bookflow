/**
 * InReaderSearchHeader + helpers — in-chapter search UI for the Reader.
 *
 * Per /docs/specs/b4_01_reader_microinteractions.html.
 *
 * Exports two pieces:
 *   - <InReaderSearchHeader> — replaces the normal reader header with a
 *     search field + Cancel button, plus the results-count nav bar below it.
 *   - <HighlightedText> — renders a paragraph with all matches wrapped in
 *     amber-200, and the active match in amber-500.
 *
 * Search is scoped to the current chapter only — scope shown in the count bar.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Header ──────────────────────────────────────────────────────────────────

export type InReaderSearchHeaderProps = {
  query: string;
  onChangeQuery: (q: string) => void;
  onCancel: () => void;
  onClear: () => void;
  resultCount: number;
  activeIndex: number; // 0-based; UI shows activeIndex+1
  chapterLabel: string; // e.g. "Chapter 4"
  onPrev: () => void;
  onNext: () => void;
};

export function InReaderSearchHeader({
  query,
  onChangeQuery,
  onCancel,
  onClear,
  resultCount,
  activeIndex,
  chapterLabel,
  onPrev,
  onNext,
}: InReaderSearchHeaderProps) {
  const showCount = query.length > 0;
  const safeIndex = resultCount > 0 ? activeIndex + 1 : 0;

  return (
    <>
      {/* Search field row */}
      <View style={styles.headerRow}>
        <View style={styles.fieldWrap}>
          <Icon name="Search" size={13} color={tokens.colors.forest[800]} strokeWidth={1.5} />
          <TextInput
            style={styles.field}
            value={query}
            onChangeText={onChangeQuery}
            placeholder="Search this chapter…"
            placeholderTextColor={tokens.textColors.disabled}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              onPress={onClear}
              style={styles.clearBtn}
              hitSlop={8}
              accessibilityLabel="Clear search"
            >
              <Icon name="X" size={8} color={tokens.colors.cream[50]} strokeWidth={3} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
          <Text style={styles.cancelLabel}>Cancel</Text>
        </Pressable>
      </View>

      {/* Results count + nav */}
      {showCount && (
        <View style={styles.navBar}>
          <Text style={styles.countLabel}>
            {resultCount > 0
              ? `${safeIndex} of ${resultCount} · ${chapterLabel}`
              : `No matches · ${chapterLabel}`}
          </Text>
          <View style={styles.navBtns}>
            <Pressable
              style={[styles.navBtn, resultCount === 0 && styles.navBtnDisabled]}
              onPress={onPrev}
              disabled={resultCount === 0}
              hitSlop={6}
              accessibilityLabel="Previous match"
            >
              <Icon name="ChevronDown" size={11} color={tokens.textColors.secondary} strokeWidth={2} />
            </Pressable>
            <Pressable
              style={[styles.navBtn, resultCount === 0 && styles.navBtnDisabled]}
              onPress={onNext}
              disabled={resultCount === 0}
              hitSlop={6}
              accessibilityLabel="Next match"
            >
              <Icon name="ChevronDown" size={11} color={tokens.textColors.secondary} strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

// ─── Highlighted text ────────────────────────────────────────────────────────

export type HighlightedTextProps = {
  /** Full paragraph or block of text. */
  text: string;
  /** Search query — case-insensitive. Empty disables highlighting. */
  query: string;
  /**
   * Match index of the currently-active hit, counted across the whole document.
   * Pass the offset of this paragraph's first match within the global count
   * via `globalMatchOffset`.
   */
  activeIndex: number;
  globalMatchOffset?: number;
  textStyle?: object;
};

/**
 * Splits text into segments around case-insensitive matches and renders each
 * match in amber-200, with the active one in amber-500.
 */
export function HighlightedText({
  text,
  query,
  activeIndex,
  globalMatchOffset = 0,
  textStyle,
}: HighlightedTextProps) {
  const segments = useMemo(() => {
    if (!query) return [{ text, isMatch: false, matchIndex: -1 }];
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    const out: { text: string; isMatch: boolean; matchIndex: number }[] = [];
    let cursor = 0;
    let local = 0;
    while (cursor < text.length) {
      const found = lower.indexOf(q, cursor);
      if (found === -1) {
        out.push({ text: text.slice(cursor), isMatch: false, matchIndex: -1 });
        break;
      }
      if (found > cursor) {
        out.push({ text: text.slice(cursor, found), isMatch: false, matchIndex: -1 });
      }
      out.push({
        text: text.slice(found, found + query.length),
        isMatch: true,
        matchIndex: globalMatchOffset + local,
      });
      local += 1;
      cursor = found + query.length;
    }
    return out;
  }, [text, query, globalMatchOffset]);

  return (
    <Text style={textStyle}>
      {segments.map((seg, i) =>
        seg.isMatch ? (
          <Text
            key={i}
            style={
              seg.matchIndex === activeIndex ? styles.matchActive : styles.match
            }
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Counts case-insensitive matches across an array of paragraphs. */
export function countMatches(paragraphs: string[], query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  let count = 0;
  for (const p of paragraphs) {
    const lower = p.toLowerCase();
    let cursor = 0;
    while (true) {
      const i = lower.indexOf(q, cursor);
      if (i === -1) break;
      count += 1;
      cursor = i + query.length;
    }
  }
  return count;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  fieldWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 10,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: tokens.colors.forest[800],
  },
  field: {
    flex: 1,
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
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
  },
  cancelLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Nav bar
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: tokens.bgColors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  countLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  navBtns: {
    flexDirection: 'row',
    gap: 4,
  },
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: tokens.bgColors.canvas,
    borderWidth: 0.5,
    borderColor: tokens.colors.ink[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.4 },

  // Highlights
  match: {
    backgroundColor: tokens.colors.amber[200],
  },
  matchActive: {
    backgroundColor: tokens.colors.amber[500],
    fontWeight: '500',
  },
});
