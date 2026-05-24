import { useCallback, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomSheet, type BottomSheetRef, Icon, type IconName, Text } from '~/components';
import { tokens } from '~/design/tokens';
import { useReaderStore, TRANSLATION_LANGUAGE_LABELS } from '~/stores/readerStore';
import { VOICE_OPTIONS } from '~/lib/aiAudio';
import {
  DefaultVoiceScreen,
  PlaybackSpeedScreen,
  ReadingDisplayScreen,
  TranslationLanguageScreen,
} from '~/screens/YouDrillScreens';
import { useBackHandler } from '~/lib/useBackHandler';

const WARN = tokens.colors.warn;
const WARN_BG = tokens.colors.warnBg;
const WARN_BORDER = tokens.colors.warnBorder;

// ─── Props ────────────────────────────────────────────────────────────────────

export type SettingsScreenProps = {
  onBack: () => void;
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export function SettingsScreen({ onBack }: SettingsScreenProps) {
  // Simulate OS notification permission state. True = granted, false = denied.
  const [osNotifGranted] = useState(true);
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

  const notifSheetRef = useRef<BottomSheetRef>(null);

  function handleNotifToggle(setter: (v: boolean) => void, newValue: boolean) {
    if (newValue && !osNotifGranted) {
      notifSheetRef.current?.present();
      return;
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
      'Clears cached library + Discover lists and the last-listened pointer. Your books and progress stay put — only the local cache is dropped.',
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
        <SubHeader onBack={onBack} />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Reading & audio */}
          <SectionBlock label="Reading & audio">
            <SettingsRow
              iconName="TextSize"
              label="Reading display"
              hint={readingHint}
              onPress={() => setView('reading')}
            />
            <RowDivider />
            <SettingsRow
              iconName="Microphone"
              label="Default voice"
              hint={voiceHint}
              onPress={() => setView('voice')}
            />
            <RowDivider />
            <SettingsRow
              iconName="Clock"
              label="Default playback speed"
              hint={speedHint}
              onPress={() => setView('speed')}
            />
            <RowDivider />
            <SettingsRow
              iconName="Phone"
              label="Resume after calls"
              sublabel="Auto-resume audio after phone calls"
              trailing={
                <Toggle
                  value={resumeAfterCalls}
                  onChange={setResumeAfterCalls}
                />
              }
            />
          </SectionBlock>

          {/* Language & translation */}
          <SectionBlock label="Language & translation">
            <SettingsRow
              iconName="Globe"
              label="App language"
              sublabel="Only English is supported for now"
              hint="English"
            />
            <RowDivider />
            <SettingsRow
              iconName="Globe"
              label="Translation target"
              sublabel="Language used for word/sentence translations"
              hint={translationHint}
              onPress={() => setView('language')}
            />
          </SectionBlock>

          {/* Notifications */}
          <SectionBlock label="Notifications">
            {!osNotifGranted && (
              <NotifDeniedBanner />
            )}
            <View style={!osNotifGranted && styles.dimmed} pointerEvents={osNotifGranted ? 'auto' : 'none'}>
              <SettingsRow
                iconName="Bell"
                label="Daily reading reminder"
                sublabel="8:00 PM every day"
                trailing={
                  <View style={styles.reminderTrailing}>
                    <View style={[styles.timeChip, !osNotifGranted && styles.timeChipDimmed]}>
                      <Text style={styles.timeChipLabel}>8:00 PM</Text>
                    </View>
                    <Toggle
                      value={reminderOn}
                      onChange={(v) => handleNotifToggle(setReminderOn, v)}
                      dimmed={!osNotifGranted}
                    />
                  </View>
                }
              />
              <RowDivider />
              <SettingsRow
                iconName="AlertTriangle"
                label="Usage warnings"
                sublabel="When limits are approaching"
                trailing={
                  <Toggle
                    value={warningsOn}
                    onChange={(v) => handleNotifToggle(setWarningsOn, v)}
                    dimmed={!osNotifGranted}
                  />
                }
              />
              <RowDivider />
              <SettingsRow
                iconName="Sparkles"
                label="Product updates"
                sublabel="New features and announcements"
                trailing={
                  <Toggle
                    value={updatesOn}
                    onChange={(v) => handleNotifToggle(setUpdatesOn, v)}
                    dimmed={!osNotifGranted}
                  />
                }
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
            <SettingsRow
              iconName="Trash"
              label={clearingCache ? 'Clearing…' : 'Clear cache'}
              sublabel="Resets cached library + Discover lists. Books and progress stay."
              onPress={clearingCache ? undefined : handleClearCache}
            />
          </SectionBlock>
        </ScrollView>
      </SafeAreaView>

      <BottomSheet ref={notifSheetRef}>
        <NotifPermissionSheet onAllow={() => notifSheetRef.current?.dismiss()} onDismiss={() => notifSheetRef.current?.dismiss()} />
      </BottomSheet>
    </>
  );
}

// ─── Sub-header ───────────────────────────────────────────────────────────────

function SubHeader({ onBack }: { onBack: () => void }) {
  // Hardware-back on the main Settings screen pops back to the You
  // tab home. Sub-drill-ins (ReadingDisplay, DefaultVoice, etc.)
  // render their own DrillHeader, which subscribes LIFO above this
  // one — so when a sub-drill-in is mounted, ITS back handler fires
  // first and routes back to the Settings home, not skipping past it.
  useBackHandler(() => {
    onBack();
    return true;
  });
  return (
    <View style={styles.subHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
      >
        <Icon name="ArrowLeft" size={16} color={tokens.textColors.secondary} />
      </Pressable>
      <Text style={styles.subHeaderTitle}>Settings</Text>
    </View>
  );
}

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

// ─── Settings row ─────────────────────────────────────────────────────────────

function SettingsRow({
  iconName,
  label,
  sublabel,
  hint,
  trailing,
  onPress,
}: {
  iconName: IconName;
  label: string;
  sublabel?: string;
  hint?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.settingsRow}>
      <View style={styles.rowIconBg}>
        <Icon name={iconName} size={14} color={tokens.textColors.secondary} />
      </View>
      <View style={styles.rowContent}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel && <Text style={styles.rowSublabel}>{sublabel}</Text>}
      </View>
      <View style={styles.rowTrailing}>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
        {trailing ?? (onPress && <Icon name="ChevronRight" size={13} color={tokens.colors.ink[300]} />)}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [pressed && { backgroundColor: tokens.bgColors.raised }]}
      >
        {content}
      </Pressable>
    );
  }
  return content;
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  dimmed,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  dimmed?: boolean;
}) {
  const trackColor = dimmed
    ? tokens.colors.ink[300]
    : value
    ? tokens.colors.forest[800]
    : tokens.colors.ink[200];

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.toggle, { backgroundColor: trackColor }, dimmed && { opacity: 0.5 }]}
    >
      <View style={[styles.toggleKnob, value ? styles.toggleKnobRight : styles.toggleKnobLeft]} />
    </Pressable>
  );
}

// ─── Storage row (custom layout) ─────────────────────────────────────────────

function StorageRow() {
  const USED = 124;
  const TOTAL = 360;
  const pct = Math.round((USED / TOTAL) * 100);

  // Read-only row — there's no "downloaded audio" management surface
  // to drill into yet, so the wrapper is a plain View instead of a
  // tap target. The progress bar + total is informational.
  return (
    <View style={styles.settingsRow}>
      <View style={styles.rowIconBg}>
        <Icon name="Music" size={14} color={tokens.textColors.secondary} />
      </View>
      <View style={styles.storageContent}>
        <Text style={styles.rowLabel}>Downloaded audio</Text>
        <View style={styles.storageBarRow}>
          <View style={styles.storageTrack}>
            <View style={[styles.storageFill, { width: `${pct}%` }]} />
          </View>
          <Text style={styles.storageMeta}>{USED} MB of {TOTAL} MB</Text>
        </View>
      </View>
      {/* Chevron removed alongside the Pressable — the row isn't
          drillable until there's a downloads management screen. */}
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
            <Text style={styles.notifPreviewTime}>Every day at 8:00 PM</Text>
            {/* "Change" button removed — until we ship the time
                picker the reminder time is locked at 8 PM. */}
          </View>
        </View>
      </View>

      <Text style={styles.notifDisclosure}>
        <Text style={styles.notifDisclosureBold}>Bookflow will ask iOS for permission next. </Text>
        We only send what you allow — daily reminder, usage warnings, product updates. You control
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

  // Sub-header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  subHeaderTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
    color: tokens.textColors.primary,
    flex: 1,
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
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: tokens.bgColors.canvas,
  },
  rowIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: tokens.bgColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowContent: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  rowSublabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.colors.ink[400],
    marginTop: 1,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  rowHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.ink[400],
  },

  // Toggle
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    flexShrink: 0,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tokens.colors.cream[50],
    position: 'absolute',
    top: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobRight: { right: 3 },
  toggleKnobLeft: { left: 3 },

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

  // Storage row
  storageContent: {
    flex: 1,
    gap: 6,
  },
  storageBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  storageTrack: {
    flex: 1,
    height: 4,
    backgroundColor: tokens.colors.cream[200],
    borderRadius: 2,
    overflow: 'hidden',
  },
  storageFill: {
    height: '100%',
    backgroundColor: tokens.colors.amber[500],
    borderRadius: 2,
  },
  storageMeta: {
    fontFamily: tokens.fonts.ui,
    fontSize: 11,
    color: tokens.textColors.muted,
    flexShrink: 0,
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
    fontWeight: '500',
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
  notifChangeBtn: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    color: tokens.colors.forest[800],
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
