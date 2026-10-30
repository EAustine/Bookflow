import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BottomSheet,
  type BottomSheetRef,
  Icon,
  ListRow,
  Presenter,
  type PresenterRef,
  ReminderTimePicker,
  SubHeader,
  Text,
  Toggle,
} from '~/components';
import { tokens } from '~/design/tokens';
import { useReaderStore, TRANSLATION_LANGUAGE_LABELS } from '~/stores/readerStore';
import { VOICE_OPTIONS } from '~/features/listen';
import { useDownloadsStore } from '~/stores/downloadsStore';
import {
  deleteBookDownload,
  deleteAllDownloads,
  totalDownloadBytes,
  formatBytes,
} from '~/features/listen';
import { DefaultVoiceScreen, PlaybackSpeedScreen, ReadingDisplayScreen, TranslationLanguageScreen } from './YouDrillScreens';
import {
  fireReminderSetConfirmation,
  formatReminderTime,
  useNotificationPermission,
} from '~/lib/notifications';

const WARN = tokens.colors.warn;
const WARN_BG = tokens.colors.warnBg;
const WARN_BORDER = tokens.colors.warnBorder;

// ─── Props ────────────────────────────────────────────────────────────────────

export type SettingsScreenProps = {
  onBack?: () => void;
  /**
   * Drill-in handlers, wired to routes by `app/you/settings.tsx` in M2.
   *
   * Optional, each falling back to the internal `view` state, so the
   * screen still works standalone. Same shape `YouScreen` already used —
   * which is what let the route migration be additive instead of a
   * rewrite. The fallbacks are dead in the app now and are kept only
   * until the drill-ins are verified against a signed-in account.
   */
  onReadingDisplay?: () => void;
  onDefaultVoice?: () => void;
  onPlaybackSpeed?: () => void;
  onTranslationLanguage?: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SettingsScreen({
  onBack,
  onReadingDisplay,
  onDefaultVoice,
  onPlaybackSpeed,
  onTranslationLanguage,
}: SettingsScreenProps) {
  // Real OS permission state — replaces the v1 hardcode that just
  // pretended we always had permission. `granted` flips when the
  // user grants in the system prompt OR returns from app-settings
  // with the toggle flipped (the hook listens for foreground
  // returns). `request()` triggers the system prompt; `openSettings`
  // jumps to the OS app-settings page for users who declined once.
  const { granted: osNotifGranted, request: requestOsPermission } =
    useNotificationPermission();
  const [view, setView] = useState<
    'home' | 'reading' | 'voice' | 'speed' | 'language'
  >('home');

  // All preference state lives in the reader store so it persists
  // across screens (Settings, You → Default voice, etc) and survives
  // re-renders. Subscribing per-field keeps the re-render scope tight.
  const fontFamily = useReaderStore((s) => s.fontFamily);
  const fontSize = useReaderStore((s) => s.fontSize);
  const defaultVoiceId = useReaderStore((s) => s.defaultVoiceId);
  const defaultPlaybackSpeed = useReaderStore((s) => s.defaultPlaybackSpeed);
  const translationLanguage = useReaderStore((s) => s.translationLanguage);
  const resumeAfterCalls = useReaderStore((s) => s.resumeAfterCalls);
  const setResumeAfterCalls = useReaderStore((s) => s.setResumeAfterCalls);
  const reminderOn = useReaderStore((s) => s.notifReminderOn);
  const setReminderOn = useReaderStore((s) => s.setNotifReminderOn);
  const reminderHour = useReaderStore((s) => s.notifReminderHour);
  const setReminderHour = useReaderStore((s) => s.setNotifReminderHour);
  const reminderMinute = useReaderStore((s) => s.notifReminderMinute);
  const setReminderMinute = useReaderStore((s) => s.setNotifReminderMinute);
  const warningsOn = useReaderStore((s) => s.notifWarningsOn);
  const setWarningsOn = useReaderStore((s) => s.setNotifWarningsOn);
  const updatesOn = useReaderStore((s) => s.notifUpdatesOn);
  const setUpdatesOn = useReaderStore((s) => s.setNotifUpdatesOn);

  // Live trailing-hint labels for the drill-in rows.
  const readingHint = `${
    fontFamily === 'serif'
      ? 'Literata'
      : fontFamily === 'lexend'
        ? 'Lexend'
        : 'Sans'
  } · ${fontSize}px`;
  const voiceHint =
    VOICE_OPTIONS.find((v) => v.id === defaultVoiceId)?.label ?? 'Rachel';
  const speedHint = `${defaultPlaybackSpeed}×`;
  const translationHint = TRANSLATION_LANGUAGE_LABELS[translationLanguage];

  const notifSheetRef = useRef<PresenterRef>(null);
  const reminderTimeSheetRef = useRef<BottomSheetRef>(null);

  async function handleNotifToggle(
    setter: (v: boolean) => void,
    newValue: boolean,
  ) {
    if (newValue && !osNotifGranted) {
      // First-time on-flip without OS permission: try the system
      // prompt. If iOS has already shown the prompt once and the
      // user declined, requestPermissionsAsync returns silently
      // (status stays 'denied') — at which point we present the
      // explainer sheet so the user can open the OS settings.
      const granted = await requestOsPermission();
      if (!granted) {
        notifSheetRef.current?.present();
        return;
      }
    }
    setter(newValue);
  }

  // Clear cache — drop AsyncStorage entries we know we own. We don't
  // call AsyncStorage.clear() blindly because that would also wipe
  // the Supabase auth session (also stored there) and sign the user
  // out. Selective removal preserves auth + zustand-persisted state
  // while clearing the Library / Discover / audio-session caches.
  const [clearingCache, setClearingCache] = useState(false);
  const handleClearCache = useCallback(() => {
    Alert.alert(
      'Clear cache?',
      'Clears cached library + Discover lists and the last-listened pointer. Your books and progress stay put, and only the local cache is dropped.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setClearingCache(true);
            try {
              const allKeys = await AsyncStorage.getAllKeys();
              const ours = allKeys.filter(
                (k) =>
                  k.startsWith('@bookflow/library/') ||
                  k.startsWith('bookflow:discover:') ||
                  k === '@bookflow/audio/last-listened-book-id',
              );
              if (ours.length > 0) {
                await AsyncStorage.multiRemove(ours);
              }
              Alert.alert('Cache cleared', `Removed ${ours.length} cached item(s).`);
            } catch (err) {
              Alert.alert(
                'Cache clear failed',
                err instanceof Error ? err.message : 'Unknown error',
              );
            } finally {
              setClearingCache(false);
            }
          },
        },
      ],
    );
  }, []);

  if (view === 'reading') {
    return <ReadingDisplayScreen onBack={() => setView('home')} />;
  }
  if (view === 'voice') {
    return <DefaultVoiceScreen onBack={() => setView('home')} />;
  }
  if (view === 'speed') {
    return <PlaybackSpeedScreen onBack={() => setView('home')} />;
  }
  if (view === 'language') {
    return <TranslationLanguageScreen onBack={() => setView('home')} />;
  }

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <SubHeader title="Settings" onBack={onBack} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Reading & audio */}
          <SectionBlock label="Reading & audio">
            <ListRow
              leadingIcon="TextSize"
              label="Reading display"
              hint={readingHint}
              drillsInto
              onPress={onReadingDisplay ?? (() => setView('reading'))}
            />
            <RowDivider />
            <ListRow
              leadingIcon="Microphone"
              label="Default voice"
              hint={voiceHint}
              drillsInto
              onPress={onDefaultVoice ?? (() => setView('voice'))}
            />
            <RowDivider />
            <ListRow
              leadingIcon="Clock"
              label="Default playback speed"
              hint={speedHint}
              drillsInto
              onPress={onPlaybackSpeed ?? (() => setView('speed'))}
            />
            <RowDivider />
            <ListRow
              leadingIcon="Phone"
              label="Resume after calls"
              sublabel="Auto-resume audio after phone calls"
              toggle={{
                value: resumeAfterCalls,
                onChange: setResumeAfterCalls,
              }}
            />
          </SectionBlock>

          {/* Language & translation */}
          <SectionBlock label="Language & translation">
            <ListRow
              leadingIcon="Globe"
              label="App language"
              sublabel="Only English is supported for now"
              hint="English"
            />
            <RowDivider />
            <ListRow
              leadingIcon="Globe"
              label="Translation target"
              sublabel="Language used for word/sentence translations"
              hint={translationHint}
              drillsInto
              onPress={onTranslationLanguage ?? (() => setView('language'))}
            />
          </SectionBlock>

          {/* Notifications */}
          <SectionBlock label="Notifications">
            {!osNotifGranted && (
              <NotifDeniedBanner />
            )}
            <View style={!osNotifGranted && styles.dimmed} pointerEvents={osNotifGranted ? 'auto' : 'none'}>
              <ListRow
                leadingIcon="Bell"
                label="Daily reading reminder"
                sublabel={`${formatReminderTime(reminderHour, reminderMinute)} every day`}
                trailingElement={
                  <View style={styles.reminderTrailing}>
                    {/* Tappable time chip → opens the time picker sheet.
                        Reads the live `reminderHour` / `reminderMinute`
                        from the store so the label tracks whatever the
                        user last picked. Disabled (and dimmed) when
                        notifications aren't granted, matching the row's
                        pointerEvents gate. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Change reminder time"
                      disabled={!osNotifGranted}
                      onPress={() => reminderTimeSheetRef.current?.present()}
                      style={({ pressed }) => [
                        styles.timeChip,
                        !osNotifGranted && styles.timeChipDimmed,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={styles.timeChipLabel}>
                        {formatReminderTime(reminderHour, reminderMinute)}
                      </Text>
                    </Pressable>
                    <Toggle
                      value={reminderOn}
                      onChange={(v) => handleNotifToggle(setReminderOn, v)}
                      dimmed={!osNotifGranted}
                    />
                  </View>
                }
              />
              <RowDivider />
              <ListRow
                leadingIcon="AlertTriangle"
                label="Usage warnings"
                sublabel="When limits are approaching"
                toggle={{
                  value: warningsOn,
                  onChange: (v) => handleNotifToggle(setWarningsOn, v),
                  dimmed: !osNotifGranted,
                }}
              />
              <RowDivider />
              <ListRow
                leadingIcon="Sparkles"
                label="Product updates"
                sublabel="New features and announcements"
                toggle={{
                  value: updatesOn,
                  onChange: (v) => handleNotifToggle(setUpdatesOn, v),
                  dimmed: !osNotifGranted,
                }}
              />
            </View>
            {!osNotifGranted && (
              <Text style={styles.notifHelper}>
                Your preferences are saved. As soon as notifications are turned on, only the ones
                you've allowed above will be sent.
              </Text>
            )}
          </SectionBlock>

          {/* Storage */}
          <SectionBlock label="Storage">
            <StorageRow />
            <RowDivider />
            <ListRow
              leadingIcon="Trash"
              label={clearingCache ? 'Clearing…' : 'Clear cache'}
              sublabel="Resets cached library + Discover lists. Books and progress stay."
              sublabelLines={2}
              onPress={clearingCache ? undefined : handleClearCache}
            />
          </SectionBlock>
        </ScrollView>
      </SafeAreaView>

      {/* §4 System states draws this as "the sheet in a 440 dialog", which
          is what `kind="confirm"` gives it. Converted here rather than
          waiting for R-M8: Sign out sits two rows above it and already
          opens as a 440 modal, and two containers for two confirms at
          one window width is the thing that got the Discover
          remove-confirm converted alongside Library's. */}
      <Presenter kind="confirm" ref={notifSheetRef}>
        <NotifPermissionSheet onAllow={() => notifSheetRef.current?.dismiss()} onDismiss={() => notifSheetRef.current?.dismiss()} />
      </Presenter>

      {/* Still a sheet: the reminder time picker is in none of the 43
          You frames, so there is no wide container to match. Recorded
          rather than guessed at. */}
      <BottomSheet ref={reminderTimeSheetRef}>
        <ReminderTimePicker
          hour={reminderHour}
          minute={reminderMinute}
          onConfirm={(hour, minute) => {
            // Persist → the root layout's useDailyReminderSync hook sees the
            // new time and reschedules the OS notification automatically.
            setReminderHour(hour);
            setReminderMinute(minute);
            reminderTimeSheetRef.current?.dismiss();
            // Immediate confirmation so the user sees a notification
            // right away — the daily reminder itself won't fire until
            // that time of day, which would otherwise look like nothing
            // happened. Only when the reminder is actually on + granted.
            if (reminderOn && osNotifGranted) {
              void fireReminderSetConfirmation(hour, minute, osNotifGranted);
            }
          }}
        />
      </BottomSheet>
    </>
  );
}

// ─── Sub-header ───────────────────────────────────────────────────────────────


// ─── Section block ────────────────────────────────────────────────────────────

function SectionBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionEyebrow}>{label}</Text>
      <View style={styles.listGroup}>{children}</View>
    </View>
  );
}

function RowDivider() {
  return <View style={styles.rowDivider} />;
}

// ─── Storage row (custom layout) ─────────────────────────────────────────────

function StorageRow() {
  // Real offline-download usage. Subscribes to the downloads registry so the
  // size + per-book list update live as downloads progress / complete.
  const downloads = useDownloadsStore((s) => s.downloads);
  const entries = Object.values(downloads).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
  const hasAny = entries.length > 0;
  const storeBytes = entries.reduce((sum, e) => sum + (e.bytes || 0), 0);
  /**
   * Fallback for a device holding downloads the registry doesn't know
   * about — a cleared store, or a reinstall over existing files.
   * Reading the disk became async in M4b (so web can ever implement
   * it), so it lands a tick after first paint; `storeBytes` covers the
   * normal case synchronously and this only fills the gap.
   */
  const [diskBytes, setDiskBytes] = useState(0);
  useEffect(() => {
    if (storeBytes > 0) return;
    let cancelled = false;
    void totalDownloadBytes().then((bytes) => {
      if (!cancelled) setDiskBytes(bytes);
    });
    return () => {
      cancelled = true;
    };
  }, [storeBytes]);
  const totalBytes = storeBytes || diskBytes;

  const confirmRemoveAll = () => {
    Alert.alert(
      'Remove all downloads?',
      'Deletes all offline audio + text from this device. Your books and reading progress stay.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove all',
          style: 'destructive',
          onPress: () => void deleteAllDownloads(),
        },
      ],
    );
  };

  const confirmRemoveOne = (bookId: string, title: string) => {
    Alert.alert(
      'Remove download?',
      `Delete the offline copy of "${title || 'this book'}"? You can re-download it anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void deleteBookDownload(bookId),
        },
      ],
    );
  };

  return (
    <View>
      {/* Canonical row for the row part; the per-book download list
          below is a custom block this component owns. (F-30.) */}
      <ListRow
        leadingIcon="Music"
        label="Downloaded audio"
        sublabel={
          hasAny
            ? `${entries.length} book${entries.length > 1 ? 's' : ''} · ${formatBytes(totalBytes)}`
            : 'No audio downloaded yet'
        }
        trailingElement={
          hasAny ? (
            <Pressable
              accessibilityRole="button"
              onPress={confirmRemoveAll}
              hitSlop={8}
              style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
            >
              <Text style={styles.storageRemoveAll}>Remove all</Text>
            </Pressable>
          ) : undefined
        }
      />
      {entries.map((e) => (
        <View key={e.bookId} style={styles.downloadItem}>
          <View style={styles.downloadItemMeta}>
            <Text style={styles.downloadItemTitle} numberOfLines={1}>
              {e.title || 'Untitled'}
            </Text>
            <Text style={styles.downloadItemSub} numberOfLines={1}>
              {e.status === 'downloading'
                ? `Downloading… ${
                    e.totalPages > 0
                      ? Math.round((e.completedPages / e.totalPages) * 100)
                      : 0
                  }%`
                : e.status === 'error'
                ? e.error || 'Download failed. Open the book to retry'
                : formatBytes(e.bytes)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => confirmRemoveOne(e.bookId, e.title)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.downloadItemDelete,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Icon name="Trash" size={16} color={tokens.colors.error} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// ─── Notification denied banner ───────────────────────────────────────────────

function NotifDeniedBanner() {
  return (
    <View style={styles.notifBanner}>
      <Icon name="Bell" size={16} color={WARN} />
      <View style={styles.notifBannerText}>
        <Text style={styles.notifBannerTitle}>Notifications are off</Text>
        <Text style={styles.notifBannerSub}>
          Bookflow doesn't have iOS permission to send notifications. Your saved preferences will
          activate the moment you turn them on.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openSettings()}
          style={({ pressed }) => [styles.notifBannerBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.notifBannerBtnLabel}>Turn on in iOS Settings</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Notification permission sheet ───────────────────────────────────────────

function NotifPermissionSheet({
  onAllow,
  onDismiss,
}: {
  onAllow: () => void;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.notifSheet}>
      <View style={styles.notifSheetIcon}>
        <Icon name="Bell" size={26} color={tokens.colors.forest[800]} />
      </View>

      <Text style={styles.notifSheetTitle}>Stay on track with a daily nudge</Text>
      <Text style={styles.notifSheetSub}>
        A daily reminder helps you build a reading habit. You can always change the time or turn it
        off later.
      </Text>

      {/* Preview notification card */}
      <View style={styles.notifPreview}>
        <View style={styles.notifPreviewIcon}>
          <Icon name="BookOpen" size={18} color={tokens.colors.cream[50]} />
        </View>
        <View style={styles.notifPreviewText}>
          <Text style={styles.notifPreviewApp}>Bookflow · Now</Text>
          <Text style={styles.notifPreviewBody}>
            Time for your daily reading. You're on Chapter 4 of The Great Gatsby. 📖
          </Text>
          <View style={styles.notifPreviewTimeRow}>
            {/* Illustrative sample time in the permission-prompt
                preview. The real reminder time is user-editable via
                the time chip on the Settings row (tap → hour picker
                sheet). Kept as a static "8:00 PM" example here since
                this card is shown BEFORE the user has granted
                permission / picked a time. */}
            <Text style={styles.notifPreviewTime}>Every day at 8:00 PM</Text>
          </View>
        </View>
      </View>

      <Text style={styles.notifDisclosure}>
        <Text style={styles.notifDisclosureBold}>Bookflow will ask iOS for permission next. </Text>
        We only send what you allow: daily reminder, usage warnings, product updates. You control
        all of it in Settings.
      </Text>

      <View style={styles.notifCtas}>
        <Pressable
          accessibilityRole="button"
          onPress={onAllow}
          style={({ pressed }) => [styles.notifPrimary, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.notifPrimaryLabel}>Yes, remind me</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.notifSecondary, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.notifSecondaryLabel}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: tokens.bgColors.canvas,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: tokens.space['2xl'],
  },


  // Section block
  sectionBlock: {
    paddingHorizontal: tokens.space.lg,
    paddingTop: 18,
  },
  sectionEyebrow: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: tokens.colors.ink[400],
    marginBottom: 8,
  },
  listGroup: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
    marginBottom: 4,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: tokens.borderColors.subtle,
  },

  // Settings row


  // Reminder trailing
  reminderTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeChip: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tokens.borderColors.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeChipDimmed: { opacity: 0.5 },
  timeChipLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },

  // (Reminder time picker styles moved to the shared
  // ReminderTimePicker component in src/components.)

  storageRemoveAll: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    color: tokens.colors.error,
  },
  downloadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingLeft: 44,
  },
  downloadItemMeta: {
    flex: 1,
    gap: 2,
  },
  downloadItemTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.textColors.primary,
  },
  downloadItemSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
  },
  downloadItemDelete: {
    padding: 4,
  },

  // Dimmed state (OS notifications off)
  dimmed: { opacity: 0.5 },

  // Notification denied banner
  notifBanner: {
    marginBottom: 6,
    backgroundColor: WARN_BG,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: WARN_BORDER,
    padding: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  notifBannerText: { flex: 1 },
  notifBannerTitle: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: WARN,
    marginBottom: 3,
  },
  notifBannerSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    lineHeight: 16,
    marginBottom: 8,
  },
  notifBannerBtn: {
    alignSelf: 'flex-start',
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 7,
    backgroundColor: WARN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBannerBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 12,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },

  // Helper text (below dimmed rows)
  notifHelper: {
    fontFamily: tokens.fonts.ui,
    fontSize: 10,
    color: tokens.colors.ink[400],
    lineHeight: 15,
    fontStyle: 'italic',
    paddingTop: 6,
    paddingBottom: tokens.space.lg,
  },

  // Notification permission sheet
  notifSheet: {
    paddingHorizontal: tokens.space.lg,
    paddingBottom: tokens.space.xl,
  },
  notifSheetIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: tokens.colors.forest[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    marginTop: tokens.space.md,
  },
  notifSheetTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 20,
    color: tokens.textColors.primary,
    lineHeight: 26,
    marginBottom: 6,
  },
  notifSheetSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.muted,
    lineHeight: 20,
    marginBottom: 22,
  },
  notifPreview: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  notifPreviewIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  notifPreviewText: { flex: 1 },
  notifPreviewApp: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.textColors.muted,
    marginBottom: 3,
  },
  notifPreviewBody: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.textColors.primary,
    lineHeight: 18,
    marginBottom: 6,
  },
  notifPreviewTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notifPreviewTime: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
  },
  notifDisclosure: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
    lineHeight: 17,
    textAlign: 'center',
    marginBottom: 20,
  },
  notifDisclosureBold: {
    fontFamily: tokens.fonts.uiMedium,
    fontWeight: '500',
    color: tokens.textColors.secondary,
  },
  notifCtas: { gap: 8 },
  notifPrimary: {
    height: 50,
    borderRadius: 12,
    backgroundColor: tokens.colors.forest[800],
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifPrimaryLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  notifSecondary: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifSecondaryLabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 14,
    color: tokens.textColors.muted,
  },
});
