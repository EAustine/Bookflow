/**
 * ComingSoonScreen — placeholder for tabs whose content hasn't been built
 * yet (Discover, Listen). Renders the page header, an honest empty state
 * explaining what will live there, and the shared TabBar so the user can
 * navigate away.
 *
 * Per CLAUDE.md "honest empty/edge states" — explain what still works and
 * what's coming, no fake teaser.
 */

import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, TabBar, type TabKey, Text } from '~/components';
import { tokens } from '~/design/tokens';

type Tab = Exclude<TabKey, 'library' | 'you'>;

const COPY: Record<
  Tab,
  { title: string; icon: 'Compass' | 'Headphones'; subtitle: string; body: string }
> = {
  discover: {
    title: 'Discover',
    icon: 'Compass',
    subtitle: 'Browse books, coming soon',
    body:
      "Public-domain library, hand-picked collections, and recommendations based on what you're already reading. We'll surface this once your library has a few books in it.",
  },
  listen: {
    title: 'Listen',
    icon: 'Headphones',
    subtitle: 'A dedicated audio mode is on the way',
    body:
      "A focused listening view with sleep timer, playback queue, and synced word-level highlighting. For now, hit Listen on any book in your library to start playback.",
  },
};

export type ComingSoonScreenProps = {
  tab: Tab;
  onTabChange: (tab: TabKey) => void;
};

export function ComingSoonScreen({ tab, onTabChange }: ComingSoonScreenProps) {
  const copy = COPY[tab];
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text variant="display-md">{copy.title}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name={copy.icon} size={32} color={tokens.textColors.muted} />
        </View>
        <Text variant="heading-md" align="center" style={styles.subtitle}>
          {copy.subtitle}
        </Text>
        <Text variant="body-sm" color="muted" align="center" style={styles.bodyText}>
          {copy.body}
        </Text>
      </View>
      <TabBar activeTab={tab} onChange={onTabChange} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  header: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.md,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space['2xl'],
    gap: tokens.space.md,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: tokens.radii['3xl'],
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space.sm,
  },
  subtitle: {
    fontFamily: tokens.fonts.display,
  },
  bodyText: {
    maxWidth: 320,
  },
});
