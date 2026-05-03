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
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function ListenHomeScreen({
  isPlaying,
  nowPlaying,
  onTabChange,
  onBrowseLibrary,
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

  // Empty state.
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
});
