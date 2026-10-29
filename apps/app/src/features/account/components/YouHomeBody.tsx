/**
 * YouHomeBody — the You tab's own content: profile, plan, the three
 * row groups and the version footer.
 *
 * One body at every size. It is You home on the phone and on tablet
 * portrait, and above Medium it is the **master** that stays beside the
 * open page — Figma draws the same stack at 600 and at 440, and §8
 * leaves a separate wide You home out on purpose because of it. The
 * container sets the width; nothing here branches on size class.
 *
 * `openPage` is what makes that work: above Compact a row sets the
 * tab's own page state, and on Compact it calls the shell's router
 * handler. Same inversion `LibraryScreen` uses for its master rows.
 *
 * Extracted from `YouScreen` in M6.
 */

import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Icon, ListRow, Text } from '~/components';
import { tokens } from '~/design/tokens';
import type { YouPage, YouPlan, YouProfile } from '../types';
import { PlanCard } from './PlanCard';
import { SettingsDivider, SettingsSection } from './SettingsSection';

export type YouHomeBodyProps = {
  profile: YouProfile;
  plan: YouPlan;
  /** Opens a page. Routes on Compact, local state above it. */
  openPage: (page: YouPage) => () => void;
  /**
   * The page the detail pane is showing, so its row carries the
   * `bg/accent-muted` fill. Null below Expanded, where no page is open
   * alongside home.
   */
  activePage: YouPage | null;
  onBuyCredits: () => void;
  onSignOut: () => void;
  onUpgrade: () => void;
  onManagePlan: () => void;
  readingHint: string;
  voiceHint: string;
  languageHint: string;
  appVersion: string;
};

export function YouHomeBody({
  profile,
  plan,
  openPage,
  activePage,
  onBuyCredits,
  onSignOut,
  onUpgrade,
  onManagePlan,
  readingHint,
  voiceHint,
  languageHint,
  appVersion,
}: YouHomeBodyProps) {
  return (
    <>
      <PageHeader />
      <ProfileHeader profile={profile} onPress={openPage('account')} />
      <PlanCard plan={plan} onUpgrade={onUpgrade} onManage={onManagePlan} />

      <SettingsSection label="Reading">
        <ListRow
          leadingIcon="TextSize"
          label="Reading display"
          hint={readingHint}
          drillsInto
          active={activePage === 'reading'}
          onPress={openPage('reading')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="Microphone"
          label="Default voice"
          hint={voiceHint}
          drillsInto
          active={activePage === 'voice'}
          onPress={openPage('voice')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="Globe"
          label="Translation language"
          hint={languageHint}
          drillsInto
          active={activePage === 'language'}
          onPress={openPage('language')}
        />
      </SettingsSection>

      <SettingsSection label="Account">
        <ListRow
          leadingIcon="User"
          label="Account & subscription"
          drillsInto
          active={activePage === 'account'}
          onPress={openPage('account')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="CreditCard"
          label="Buy credits"
          hint="AI + audio top-ups"
          drillsInto
          onPress={onBuyCredits}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="Settings"
          label="Settings"
          drillsInto
          active={activePage === 'settings'}
          onPress={openPage('settings')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="Bell"
          label="Notifications"
          drillsInto
          active={activePage === 'notifications'}
          onPress={openPage('notifications')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="Logout"
          label="Sign out"
          destructive
          onPress={onSignOut}
        />
      </SettingsSection>

      <SettingsSection label="Support">
        <ListRow
          leadingIcon="HelpCircle"
          label="Help & FAQ"
          drillsInto
          active={activePage === 'help'}
          onPress={openPage('help')}
        />
        <SettingsDivider />
        <ListRow
          leadingIcon="MessageCircle"
          label="Send feedback"
          drillsInto
          active={activePage === 'feedback'}
          onPress={openPage('feedback')}
        />
      </SettingsSection>

      <Text
        variant="body-xs"
        color="disabled"
        align="center"
        style={styles.versionFooter}
      >
        {appVersion}
      </Text>
    </>
  );
}

function PageHeader() {
  return (
    <View style={styles.pageHeader}>
      <Text variant="display-md">You</Text>
    </View>
  );
}

// ============================================================================
// PROFILE HEADER (tappable card)
// ============================================================================

function ProfileHeader({
  profile,
  onPress,
}: {
  profile: YouProfile;
  onPress: () => void;
}) {
  const initials = getInitials(profile.name, profile.email);
  // Mirrors AccountScreen's ProfileSection — render the avatar
  // image when present, fall back to initials when the URL is null
  // OR the Image element fails to load (broken signed URL, stale
  // cache, missing object). The `console.warn` on failure tells us
  // the exact URL that broke so we can debug the storage / RLS
  // configuration without guessing.
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showImage = !!profile.avatarUrl && !avatarLoadFailed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${profile.name}, ${profile.email}. Account and subscription`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileCard,
        pressed && { backgroundColor: tokens.bgColors.raised },
      ]}
    >
      <View style={styles.avatar}>
        {showImage ? (
          <Image
            key={profile.avatarUrl ?? 'no-avatar'}
            source={{ uri: profile.avatarUrl ?? undefined }}
            style={styles.avatarImage}
            resizeMode="cover"
            onError={(e) => {
              console.warn(
                '[avatar/you] failed to load',
                profile.avatarUrl,
                e.nativeEvent?.error,
              );
              setAvatarLoadFailed(true);
            }}
            onLoad={() => setAvatarLoadFailed(false)}
          />
        ) : (
          <Text style={styles.avatarText}>{initials}</Text>
        )}
      </View>
      <View style={styles.profileMeta}>
        <Text variant="heading-sm" numberOfLines={1}>
          {profile.name}
        </Text>
        <Text variant="body-sm" color="muted" numberOfLines={1}>
          {profile.email}
        </Text>
      </View>
      <View style={styles.chevronCircle}>
        <Icon name="ChevronRight" size={16} color={tokens.textColors.subtle} />
      </View>
    </Pressable>
  );
}

/**
 * Up to two initials. Falls back to the first 1-2 chars of the email's
 * local part if the name is empty (e.g. a fresh signup before profile
 * is filled).
 */
function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    const initials = parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
    if (initials) return initials;
  }
  const local = email.split('@')[0] ?? '';
  return local.slice(0, 2).toUpperCase() || '·';
}

const styles = StyleSheet.create({
  pageHeader: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: tokens.space.lg,
    paddingBottom: tokens.space.md,
  },
  profileCard: {
    marginHorizontal: tokens.space.lg,
    marginBottom: tokens.space.lg,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: tokens.radii['2xl'],
    padding: tokens.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 52,
    height: 52,
  },
  avatarText: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: tokens.colors.cream[50],
  },
  profileMeta: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: tokens.bgColors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionFooter: {
    paddingTop: tokens.space.sm,
    paddingHorizontal: tokens.space.lg,
  },
});
