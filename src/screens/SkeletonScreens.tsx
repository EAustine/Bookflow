import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Skeleton, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Library loading skeleton ─────────────────────────────────────────────────

export function LibrarySkeleton() {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.libHeader}>
        <Skeleton width={90} height={28} borderRadius={6} />
        <View style={styles.libHeaderActions}>
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
          <Skeleton width={36} height={36} borderRadius={18} />
        </View>
      </View>

      {/* "Continue reading" section label */}
      <Skeleton width={110} height={10} borderRadius={99} style={styles.libSectionLabel} />

      {/* Continue card */}
      <View style={styles.libContinueCard}>
        <Skeleton width={56} height={82} borderRadius={6} />
        <View style={styles.libContinueInfo}>
          <Skeleton width="80%" height={14} borderRadius={99} />
          <Skeleton width="55%" height={11} borderRadius={99} />
          <Skeleton width="65%" height={10} borderRadius={99} />
          <Skeleton width="100%" height={3} borderRadius={2} />
          <View style={styles.libContinueBtns}>
            <Skeleton width={72} height={30} borderRadius={6} />
            <Skeleton width={56} height={30} borderRadius={6} />
          </View>
        </View>
      </View>

      {/* "All books" section header */}
      <View style={styles.libListLabel}>
        <Skeleton width={80} height={13} borderRadius={99} />
        <Skeleton width={50} height={11} borderRadius={99} />
      </View>

      {/* Book rows */}
      <View style={styles.libBooks}>
        {BOOK_ROW_WIDTHS.map((widths, i) => (
          <View
            key={i}
            style={[styles.libBookRow, i < BOOK_ROW_WIDTHS.length - 1 && styles.libBookRowBorder]}
          >
            <Skeleton width={36} height={54} borderRadius={4} />
            <View style={styles.libBookInfo}>
              <Skeleton width={widths.title} height={13} borderRadius={99} />
              <Skeleton width={widths.author} height={10} borderRadius={99} />
              {widths.progress && (
                <Skeleton width="100%" height={2} borderRadius={1} />
              )}
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const BOOK_ROW_WIDTHS = [
  { title: '75%' as const, author: '45%' as const, progress: true },
  { title: '65%' as const, author: '50%' as const, progress: true },
  { title: '80%' as const, author: '38%' as const, progress: false },
];

// ─── Reader loading skeleton ──────────────────────────────────────────────────

export function ReaderSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <SafeAreaView style={styles.readerSafe} edges={['top', 'left', 'right', 'bottom']}>
      {/* Header — back button is real, title is skeleton */}
      <View style={styles.readerHeader}>
        <View style={styles.readerHeaderBtn}>
          <Skeleton width={32} height={32} borderRadius={16} />
        </View>
        <View style={styles.readerTitleBlock}>
          <Skeleton width={130} height={13} borderRadius={99} />
          <Skeleton width={90} height={10} borderRadius={99} style={{ marginTop: 5 }} />
        </View>
        <View style={styles.readerHeaderActions}>
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={28} height={28} borderRadius={6} />
        </View>
      </View>

      {/* Chapter label + title */}
      <View style={styles.readerBody}>
        <Skeleton width={80} height={10} borderRadius={99} style={styles.readerChapterLabel} />
        <Skeleton width={220} height={22} borderRadius={6} style={styles.readerChapterTitle} />

        {/* Paragraphs — varied widths for realism */}
        {PARA_LINES.map((para, pi) => (
          <View key={pi} style={styles.readerPara}>
            {para.map((w, li) => (
              <Skeleton key={li} width={w as `${number}%`} height={14} borderRadius={4} />
            ))}
          </View>
        ))}
      </View>

      {/* Progress bar */}
      <View style={styles.readerProgress}>
        <Skeleton width="100%" height={3} borderRadius={2} style={styles.readerProgressBar} />
        <View style={styles.readerProgressMeta}>
          <Skeleton width={55} height={9} borderRadius={99} />
          <Skeleton width={90} height={9} borderRadius={99} />
        </View>
      </View>

      {/* Action bar — mirrors the real text-mode ReaderScreen ActionBar
       * exactly: 5 items (Listen / AI tools / Search / Highlights /
       * Reading options), 44×44 circular icon backgrounds, label
       * underneath. Listen is rendered "live" because the user can tap
       * it immediately even while the page is loading; the other four
       * tabs are skeleton placeholders sized roughly to their final
       * label widths so the transition into the loaded state doesn't
       * jolt their position. Keep this list in sync with the ACTIONS
       * array in ReaderScreen.tsx → ActionBar. */}
      <View style={styles.readerActionBar}>
        <View style={styles.readerActionItem}>
          <View style={styles.readerListenBtn}>
            <Icon name="Headphones" size={18} color={tokens.colors.cream[50]} strokeWidth={1.5} />
          </View>
          <Text style={styles.readerActionLabel}>Listen</Text>
        </View>
        {[
          { key: 'AI tools', labelWidth: 42 },
          { key: 'Search', labelWidth: 36 },
          { key: 'Highlights', labelWidth: 52 },
          { key: 'Reading options', labelWidth: 80 },
        ].map(({ key, labelWidth }) => (
          <View key={key} style={styles.readerActionItem}>
            <Skeleton width={44} height={44} borderRadius={22} />
            <Skeleton width={labelWidth} height={9} borderRadius={99} style={{ marginTop: 6 }} />
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const PARA_LINES: string[][] = [
  ['100%', '100%', '88%', '100%', '72%'],
  ['100%', '94%', '100%', '80%'],
  ['100%', '100%', '60%'],
  ['100%', '90%'],
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Library
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  libHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
  },
  libHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  libSectionLabel: {
    marginHorizontal: 20,
    marginBottom: 10,
    marginTop: 4,
  },
  libContinueCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 22,
  },
  libContinueInfo: {
    flex: 1,
    paddingTop: 4,
    gap: 8,
  },
  libContinueBtns: {
    flexDirection: 'row',
    gap: 7,
  },
  libListLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  libBooks: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    overflow: 'hidden',
  },
  libBookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
    minHeight: 70,
  },
  libBookRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  libBookInfo: {
    flex: 1,
    gap: 7,
  },

  // Reader
  readerSafe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  readerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: tokens.borderColors.subtle,
  },
  readerHeaderBtn: {
    flexShrink: 0,
  },
  readerTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  readerHeaderActions: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  readerBody: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    overflow: 'hidden',
  },
  readerChapterLabel: {
    marginBottom: 12,
  },
  readerChapterTitle: {
    marginBottom: 20,
  },
  readerPara: {
    gap: 9,
    marginBottom: 18,
  },
  readerProgress: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    flexShrink: 0,
  },
  readerProgressBar: {
    marginBottom: 5,
  },
  readerProgressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  readerActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 0.5,
    borderTopColor: tokens.borderColors.subtle,
    flexShrink: 0,
  },
  readerActionItem: {
    alignItems: 'center',
  },
  readerListenBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  readerActionLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    fontWeight: '500',
    color: tokens.textColors.muted,
    marginTop: 5,
  },
});
