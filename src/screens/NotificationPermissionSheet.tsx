import { forwardRef, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Icon, type IconName, Text } from '~/components';
import { tokens } from '~/design/tokens';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotifTrigger = 'session' | 'chapter' | 'toggle';

export type NotificationPermissionSheetProps = {
  trigger: NotifTrigger;
  sessionMinutes?: number;
  bookTitle?: string;
  chapterNum?: number;
  onGrant: () => void;
  onDismiss: () => void;
};

type TriggerConfig = {
  badgeIcon: IconName;
  badgeText: string;
  triggerIcon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  sub: string;
  previewBody: string;
  primaryLabel: string;
  secondaryLabel: string;
  disclosureSuffix: string;
};

// ─── Trigger configurations ───────────────────────────────────────────────────

function buildConfig(
  trigger: NotifTrigger,
  sessionMinutes: number,
  bookTitle: string,
  chapterNum: number,
): TriggerConfig {
  switch (trigger) {
    case 'session':
      return {
        badgeIcon: 'Clock',
        badgeText: `${sessionMinutes} minutes just now`,
        triggerIcon: 'Bell',
        iconBg: tokens.colors.forest[50],
        iconColor: tokens.colors.forest[800],
        title: 'Nice — keep that streak going',
        sub: `${sessionMinutes} minutes of reading done. A daily reminder helps you build the habit. You set the time, we'll do the nudging.`,
        previewBody: `Time for today's reading. You're on Chapter 4 of ${bookTitle}. 📖`,
        primaryLabel: 'Yes, remind me',
        secondaryLabel: 'Not now',
        disclosureSuffix: 'We only send what you allow.',
      };
    case 'chapter':
      return {
        badgeIcon: 'Check',
        badgeText: `Chapter ${chapterNum} finished`,
        triggerIcon: 'Star',
        iconBg: tokens.colors.amber[200],
        iconColor: tokens.colors.warn,
        title: `Chapter ${chapterNum} done — keep the momentum`,
        sub: `That's the first chapter of ${bookTitle}. A daily reminder makes it easier to come back. You choose when.`,
        previewBody: `Chapter ${chapterNum + 1} of ${bookTitle} is waiting. Pick up where you left off. 📖`,
        primaryLabel: 'Yes, remind me',
        secondaryLabel: 'Not now',
        disclosureSuffix: 'Only the notifications you allow will be sent.',
      };
    case 'toggle':
      return {
        badgeIcon: 'Bell',
        badgeText: 'Daily reminder turned on',
        triggerIcon: 'Bell',
        iconBg: tokens.colors.forest[50],
        iconColor: tokens.colors.forest[800],
        title: 'One more step to activate it',
        sub: "Bookflow needs iOS permission to send notifications. Here's exactly what you'll receive:",
        previewBody: `Time for your daily reading. You're on Chapter 4 of ${bookTitle}. 📖`,
        primaryLabel: 'Grant permission',
        secondaryLabel: 'Cancel',
        disclosureSuffix: "We only send what you've turned on in Settings — nothing else.",
      };
  }
}

// ─── Sheet ────────────────────────────────────────────────────────────────────

export const NotificationPermissionSheet = forwardRef<
  BottomSheetModal,
  NotificationPermissionSheetProps
>(function NotificationPermissionSheet(
  {
    trigger,
    sessionMinutes = 12,
    bookTitle = 'The Great Gatsby',
    chapterNum = 1,
    onGrant,
    onDismiss,
  },
  ref,
) {
  const config = buildConfig(trigger, sessionMinutes, bookTitle, chapterNum);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
        onPress={onDismiss}
      />
    ),
    [onDismiss],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
      handleStyle={styles.handleWrap}
      onDismiss={onDismiss}
    >
      <BottomSheetView style={styles.content}>
        {/* Context badge */}
        <View style={styles.triggerBadge}>
          <Icon name={config.badgeIcon} size={12} color={tokens.colors.forest[800]} strokeWidth={1.5} />
          <Text style={styles.triggerBadgeText}>{config.badgeText}</Text>
        </View>

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: config.iconBg }]}>
          <Icon name={config.triggerIcon} size={26} color={config.iconColor} strokeWidth={1.5} />
        </View>

        {/* Title + subtitle */}
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.sub}>{config.sub}</Text>

        {/* Notification preview */}
        <View style={styles.notifPreview}>
          <View style={styles.notifAppIcon}>
            <Icon name="Book" size={18} color={tokens.colors.cream[50]} strokeWidth={1.5} />
          </View>
          <View style={styles.notifContent}>
            <Text style={styles.notifAppName}>BOOKFLOW</Text>
            <Text style={styles.notifBody}>{config.previewBody}</Text>
            <View style={styles.notifTimeRow}>
              <Text style={styles.notifTime}>Every day at 8:00 PM</Text>
              {/* "Change" button removed — there's no time picker
                  wired yet, so the reminder time is locked to 8 PM
                  for everyone. Re-add when the picker lands. */}
            </View>
          </View>
        </View>

        {/* Honest disclosure */}
        <Text style={styles.disclosure}>
          <Text style={styles.disclosureBold}>Bookflow will ask iOS for permission next. </Text>
          {config.disclosureSuffix}
        </Text>

        {/* Primary CTA */}
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
          onPress={onGrant}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnLabel}>{config.primaryLabel}</Text>
        </Pressable>

        {/* Secondary CTA */}
        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.7 }]}
          onPress={onDismiss}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnLabel}>{config.secondaryLabel}</Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  bg: { backgroundColor: tokens.bgColors.canvas },
  handle: {
    backgroundColor: tokens.colors.ink[300],
    width: 32,
  },
  handleWrap: { paddingBottom: 0 },
  content: {
    paddingHorizontal: 22,
    paddingBottom: 28,
    paddingTop: 4,
  },

  // Context badge
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: tokens.colors.forest[50],
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 18,
  },
  triggerBadgeText: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Icon
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },

  // Copy
  title: {
    fontFamily: tokens.fonts.display,
    fontSize: 21,
    fontWeight: '500',
    color: tokens.textColors.primary,
    lineHeight: 27,
    marginBottom: 6,
  },
  sub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 21,
    marginBottom: 20,
  },

  // Notification preview card
  notifPreview: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  notifAppIcon: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifContent: { flex: 1 },
  notifAppName: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.02,
    color: tokens.textColors.disabled,
    marginBottom: 3,
  },
  notifBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.primary,
    lineHeight: 19,
    marginBottom: 6,
  },
  notifTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.disabled,
  },
  notifChange: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[800],
  },

  // Disclosure
  disclosure: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.disabled,
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 20,
  },
  disclosureBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // CTAs
  primaryBtn: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  primaryBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  secondaryBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },
});
