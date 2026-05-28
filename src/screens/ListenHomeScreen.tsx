/**
 * ListenHomeScreen — the Listen tab's home view.
 *
 * Branches on `isPlaying`:
 *   - true  → renders ListenNowPlayingScreen (active hero card, scrub bar,
 *             recently listened, this-month stats).
 *   - false → renders the "nothing playing" empty state, nudging the user
 *             toward the Library so they can pick a book.
 *
 * The bottom TabBar lives here (not inside ListenNowPlayingScreen) so it's
 * always visible regardless of branch — same pattern as LibraryScreen,
 * DiscoverScreen, and YouScreen.
 *
 * react-native-track-player isn't wired yet, so for now App.tsx hardcodes
 * `isPlaying=false`. When the player is integrated, swap that for a real
 * subscription to the playback state and the now-playing branch lights up
 * automatically.
 */

import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, TabBar, type TabKey, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { Book } from '~/types/book';
import {
  ListenNowPlayingScreen,
  type ListenNowPlayingScreenProps,
} from '~/screens/ListenNowPlayingScreen';

// ─── Props ────────────────────────────────────────────────────────────────────

export type ListenHomeScreenProps = {
  /** True when audio is actively playing or paused-with-track-loaded. */
  isPlaying: boolean;
  /** All now-playing props. Ignored when `isPlaying=false`. */
  nowPlaying?: Omit<ListenNowPlayingScreenProps, 'onOpenProfile'>;
  onTabChange: (tab: TabKey) => void;
  /** Tapped from the empty state's "Browse library" CTA. */
  onBrowseLibrary?: () => void;
  /**
   * The user's most recently read/listened book, used to power the
   * "Resume listening" affordance when there's no live audio session.
   * Tap → starts a session on that book at its persisted page index.
   * `null` falls back to the generic empty state.
   */
  lastListenedBook?: Book | null;
  /** Called with the book when the user taps the resume card. */
  onResumeListening?: (book: Book) => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ListenHomeScreen({
  isPlaying,
  nowPlaying,
  onTabChange,
  onBrowseLibrary,
  lastListenedBook,
  onResumeListening,
}: ListenHomeScreenProps) {
  // Active path: defer to the dedicated now-playing surface, then add a
  // TabBar underneath. ListenNowPlayingScreen already wraps in its own
  // SafeAreaView so we just stack the TabBar below it.
  if (isPlaying && nowPlaying) {
    return (
      <View style={styles.root}>
        <View style={styles.flexFill}>
          <ListenNowPlayingScreen
            {...nowPlaying}
            onOpenProfile={() => onTabChange('you')}
          />
        </View>
        <TabBar activeTab="listen" onChange={onTabChange} />
      </View>
    );
  }

  // Idle state — the user has no active audio session. If we know the
  // book they last opened (read or listened), surface a "Resume
  // listening" hero card so a single tap restores the session. Falls
  // back to the generic empty state for first-time users.
  if (lastListenedBook && onResumeListening) {
    const lastReadPage =
      (lastListenedBook as { last_read_page?: number }).last_read_page ?? 0;
    const progressPercent = lastListenedBook.progressPercent ?? 0;
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.resumeWrap}>
          <Text style={styles.eyebrow}>Last session</Text>
          <Pressable
            onPress={() => onResumeListening(lastListenedBook)}
            style={({ pressed }) => [
              styles.resumeCard,
              pressed && { opacity: 0.92 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Resume listening to ${lastListenedBook.title}`}
          >
            <View
              style={[
                styles.resumeCover,
                { backgroundColor: lastListenedBook.coverColor },
              ]}
            >
              <Text style={styles.resumeCoverInitial}>
                {lastListenedBook.title.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.resumeBody}>
              <Text style={styles.resumeTitle} numberOfLines={2}>
                {lastListenedBook.title}
              </Text>
              {lastListenedBook.author ? (
                <Text style={styles.resumeAuthor} numberOfLines={1}>
                  {lastListenedBook.author}
                </Text>
              ) : null}
              <View style={styles.resumeProgressTrack}>
                <View
                  style={[
                    styles.resumeProgressFill,
                    { width: `${Math.min(100, Math.max(0, progressPercent))}%` },
                  ]}
                />
              </View>
              <Text style={styles.resumeMeta}>
                Page {lastReadPage + 1} · {progressPercent}% complete
              </Text>
            </View>
            <View style={styles.resumePlayBubble}>
              <Icon
                name="Headphones"
                size={16}
                color={tokens.colors.cream[50]}
                strokeWidth={1.75}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={onBrowseLibrary ?? (() => onTabChange('library'))}
            style={({ pressed }) => [styles.secondaryCta, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <Icon name="Book" size={13} color={tokens.colors.forest[800]} strokeWidth={1.75} />
            <Text style={styles.secondaryCtaLabel}>Pick a different book</Text>
          </Pressable>
        </View>
        <TabBar activeTab="listen" onChange={onTabChange} />
      </SafeAreaView>
    );
  }

  // First-time / no-history empty state.
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.emptyWrap}>
        <View style={styles.iconBubble}>
          <Icon
            name="Headphones"
            size={36}
            color={tokens.colors.forest[800]}
            strokeWidth={1.5}
          />
        </View>
        <Text style={styles.title}>Nothing playing</Text>
        <Text style={styles.sub}>
          Pick a book from your library, then tap the headphones to start
          listening. We&apos;ll keep your place across devices.
        </Text>

        <Pressable
          onPress={onBrowseLibrary ?? (() => onTabChange('library'))}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
        >
          <Icon name="Book" size={14} color={tokens.colors.cream[50]} strokeWidth={1.75} />
          <Text style={styles.ctaLabel}>Browse library</Text>
        </Pressable>
      </View>
      <TabBar activeTab="listen" onChange={onTabChange} />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bgColors.canvas },
  flexFill: { flex: 1 },

  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconBubble: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 24,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 26,
    maxWidth: 320,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
  },
  ctaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Resume-listening hero card. Shown on the Listen tab when there's
  // no live session but the user has a book they were previously
  // reading. Tap → restart that session.
  resumeWrap: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 36,
    gap: 18,
  },
  eyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
  },
  resumeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 14,
  },
  resumeCover: {
    width: 56,
    height: 80,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeCoverInitial: {
    fontFamily: tokens.fonts.display,
    fontSize: 28,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  resumeBody: {
    flex: 1,
    gap: 4,
  },
  resumeTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 19,
  },
  resumeAuthor: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  resumeProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: tokens.borderColors.subtle,
    marginTop: 6,
    overflow: 'hidden',
  },
  resumeProgressFill: {
    height: 3,
    backgroundColor: tokens.colors.forest[800],
  },
  resumeMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.subtle,
    marginTop: 4,
  },
  resumePlayBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  secondaryCtaLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },
});
