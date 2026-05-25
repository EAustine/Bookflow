/**
 * YouDrillScreens — drill-in destinations from the You tab.
 *
 * Each screen is the target of a `ListRow` in `YouScreen`'s settings
 * sections. They share a common shell (back button + title + scrollable
 * body) so adding a new one is mostly defining the body. Real
 * persistence lives in the reader store (`useReaderStore`) for the
 * preferences screens; the feedback / help screens are
 * self-contained.
 *
 * Architecture choice: one file rather than six, because each screen
 * is small (under 100 lines of JSX) and they share styling primitives.
 * Splitting into per-file would mean six near-identical headers and
 * style sheets without much benefit.
 */

import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, Text } from '~/components';
import { tokens } from '~/design/tokens';
import {
  PLAYBACK_SPEEDS,
  TRANSLATION_LANGUAGE_LABELS,
  type ReaderFontFamily,
  type ReaderTheme,
  type TranslationLanguage,
  useReaderStore,
} from '~/stores/readerStore';
import { VOICE_OPTIONS } from '~/lib/aiAudio';
import { presentPaywall, ENTITLEMENT_PRO } from '~/lib/revenuecat';
import { SUPPORT_EMAIL } from '~/lib/legalUrls';
import { useBackHandler } from '~/lib/useBackHandler';

// ─── Shell (back-and-title header used by every drill-in) ────────────────────

function DrillHeader({ title, onBack }: { title: string; onBack: () => void }) {
  // Route Android hardware-back to the same callback the in-screen
  // chevron uses. Without this, the user is dumped to the OS / app
  // exit instead of back to the You tab home. Mounting this inside
  // the shared header means every drill-in screen that uses
  // DrillHeader gets back-button support automatically — no per-screen
  // wiring required.
  useBackHandler(() => {
    onBack();
    return true;
  });
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={8}
        style={styles.backBtn}
      >
        <Icon name="ArrowLeft" size={18} color={tokens.textColors.primary} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

// ─── Reading display ─────────────────────────────────────────────────────────

const FONT_OPTIONS: Array<{ id: ReaderFontFamily; label: string; sample: string }> = [
  { id: 'serif', label: 'Literata (serif)', sample: 'Aa' },
  { id: 'sans', label: 'System (sans)', sample: 'Aa' },
  { id: 'lexend', label: 'Lexend', sample: 'Aa' },
];

const THEME_OPTIONS: Array<{ id: ReaderTheme; label: string; bg: string; fg: string }> = [
  { id: 'light', label: 'Light', bg: '#FAF7F2', fg: '#1A1A1A' },
  { id: 'sepia', label: 'Sepia', bg: '#F5EDD8', fg: '#3D2B1F' },
  { id: 'dark', label: 'Dark', bg: '#1A1F1B', fg: '#E8E5DC' },
];

export function ReadingDisplayScreen({ onBack }: { onBack: () => void }) {
  const fontFamily = useReaderStore((s) => s.fontFamily);
  const setFontFamily = useReaderStore((s) => s.setFontFamily);
  const fontSize = useReaderStore((s) => s.fontSize);
  const setFontSize = useReaderStore((s) => s.setFontSize);
  const theme = useReaderStore((s) => s.theme);
  const setTheme = useReaderStore((s) => s.setTheme);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Reading display" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Section label="Font">
          {FONT_OPTIONS.map((opt) => (
            <RadioRow
              key={opt.id}
              label={opt.label}
              selected={fontFamily === opt.id}
              onPress={() => setFontFamily(opt.id)}
            />
          ))}
        </Section>

        <Section label="Size">
          <View style={styles.sizeRow}>
            <Pressable
              accessibilityLabel="Decrease size"
              onPress={() => setFontSize(Math.max(14, fontSize - 1))}
              style={({ pressed }) => [styles.sizeBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.sizeBtnLabel}>A−</Text>
            </Pressable>
            <Text style={styles.sizeValue}>{fontSize}px</Text>
            <Pressable
              accessibilityLabel="Increase size"
              onPress={() => setFontSize(Math.min(28, fontSize + 1))}
              style={({ pressed }) => [styles.sizeBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.sizeBtnLabel}>A+</Text>
            </Pressable>
          </View>
        </Section>

        <Section label="Theme">
          {THEME_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => setTheme(opt.id)}
              style={({ pressed }) => [
                styles.themeRow,
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={[styles.themeSwatch, { backgroundColor: opt.bg }]}>
                <Text style={[styles.themeSwatchLetter, { color: opt.fg }]}>Aa</Text>
              </View>
              <Text style={styles.themeLabel}>{opt.label}</Text>
              {theme === opt.id && (
                <Icon name="Check" size={16} color={tokens.colors.forest[800]} />
              )}
            </Pressable>
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Default playback speed ──────────────────────────────────────────────────

export function PlaybackSpeedScreen({ onBack }: { onBack: () => void }) {
  const defaultPlaybackSpeed = useReaderStore((s) => s.defaultPlaybackSpeed);
  const setDefaultPlaybackSpeed = useReaderStore(
    (s) => s.setDefaultPlaybackSpeed,
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Default playback speed" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperCopy}>
          The starting speed for new listening sessions. You can still
          cycle through speeds per session from the listen screen.
        </Text>
        <Section label="Speed">
          {PLAYBACK_SPEEDS.map((speed) => (
            <RadioRow
              key={speed}
              label={`${speed}×`}
              hint={
                speed === 1
                  ? 'Normal'
                  : speed < 1
                    ? 'Slower'
                    : 'Faster — good for revisits'
              }
              selected={Math.abs(defaultPlaybackSpeed - speed) < 0.01}
              onPress={() => setDefaultPlaybackSpeed(speed)}
            />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Default voice ───────────────────────────────────────────────────────────

export function DefaultVoiceScreen({ onBack }: { onBack: () => void }) {
  const defaultVoiceId = useReaderStore((s) => s.defaultVoiceId);
  const setDefaultVoiceId = useReaderStore((s) => s.setDefaultVoiceId);

  // Same plan gate as the per-book VoiceSheet on the Listen screen:
  // free voices are pickable; Pro voices show but are locked until the
  // user upgrades. Real entitlement plumbing isn't wired (RevenueCat
  // returns 'free' for everyone today), so this is currently a hard
  // gate — when the entitlement plumbing lands, swap this constant
  // for the live tier from useEntitlement().
  const isPro = false;
  const freeVoices = VOICE_OPTIONS.filter((v) => v.tier === 'free');
  const proVoices = VOICE_OPTIONS.filter((v) => v.tier === 'pro');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Default voice" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperCopy}>
          The voice we use for new listening sessions. You can override it
          per book from the listen screen.
        </Text>

        <Section label="Free">
          {freeVoices.map((voice) => (
            <RadioRow
              key={voice.id}
              label={voice.label}
              hint={voice.description}
              selected={defaultVoiceId === voice.id}
              onPress={() => setDefaultVoiceId(voice.id)}
            />
          ))}
        </Section>

        <Section label="Pro voices">
          {proVoices.map((voice) => (
            <RadioRow
              key={voice.id}
              label={voice.label}
              hint={voice.description}
              selected={isPro && defaultVoiceId === voice.id}
              locked={!isPro}
              onPress={() => {
                if (isPro) setDefaultVoiceId(voice.id);
              }}
            />
          ))}
        </Section>

        {!isPro && (
          <View style={styles.upsellCard}>
            <View style={styles.upsellTextCol}>
              <Text style={styles.upsellTitle}>Unlock all voices</Text>
              <Text style={styles.upsellSub}>
                4 premium voices plus faster audio on Standard.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade"
              // RevenueCat's native paywall — handles platform IAP
              // sheets and entitlement activation. The call is
              // fire-and-forget here because the user's resulting
              // entitlement is read separately by useCustomerInfo
              // / useEntitlement on the next render.
              onPress={() => {
                void presentPaywall({
                  requiredEntitlement: ENTITLEMENT_PRO,
                }).catch(() => {
                  // Disabled / mis-configured builds throw inside
                  // presentPaywall. Swallow so the button stays
                  // press-safe; the upsell card itself is the only
                  // surface where this matters and we don't want a
                  // crash if RevenueCat isn't set up.
                });
              }}
              style={({ pressed }) => [
                styles.upsellBtn,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.upsellBtnLabel}>Upgrade</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Translation language ────────────────────────────────────────────────────

export function TranslationLanguageScreen({ onBack }: { onBack: () => void }) {
  const translationLanguage = useReaderStore((s) => s.translationLanguage);
  const setTranslationLanguage = useReaderStore((s) => s.setTranslationLanguage);

  // Stable list order: keep English at the top (the "no-op" target),
  // then alphabetical by label so users can scan to their language.
  const ordered = (Object.keys(TRANSLATION_LANGUAGE_LABELS) as TranslationLanguage[])
    .sort((a, b) => {
      if (a === 'en') return -1;
      if (b === 'en') return 1;
      return TRANSLATION_LANGUAGE_LABELS[a].localeCompare(
        TRANSLATION_LANGUAGE_LABELS[b],
      );
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Translation language" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperCopy}>
          The language we translate words and sentences into when you tap
          a word or long-press a sentence in the reader.
        </Text>
        <Section label="Languages">
          {ordered.map((id) => (
            <RadioRow
              key={id}
              label={TRANSLATION_LANGUAGE_LABELS[id]}
              selected={translationLanguage === id}
              onPress={() => setTranslationLanguage(id)}
            />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

/**
 * Notifications drill-in. The OS-level permission flow + push tokens
 * aren't wired yet — this screen just persists the user's preference
 * locally. When real notifications land, the toggles already reflect
 * the right intent.
 */
export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [reminder, setReminder] = useState(true);
  const [warnings, setWarnings] = useState(true);
  const [updates, setUpdates] = useState(false);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Notifications" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Section label="Reminders">
          <ToggleRow
            label="Daily reading reminder"
            sublabel="A nudge at 8:00 PM to keep your streak alive"
            value={reminder}
            onChange={setReminder}
          />
        </Section>
        <Section label="Account">
          <ToggleRow
            label="Usage warnings"
            sublabel="When you're approaching your monthly limit"
            value={warnings}
            onChange={setWarnings}
          />
          <ToggleRow
            label="Product updates"
            sublabel="New features and announcements"
            value={updates}
            onChange={setUpdates}
          />
        </Section>
        <Text style={styles.footnote}>
          Push notifications require allowing Bookflow to send you alerts in
          your phone settings. Open Settings → Notifications → Bookflow to
          adjust.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Help & FAQ ──────────────────────────────────────────────────────────────

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'How does the audio listening work?',
    a: 'We turn the book\'s text into spoken audio using ElevenLabs voices. The mini player shows you which page is playing and you can scrub like a podcast.',
  },
  {
    q: 'Why does my book take a moment to import?',
    a: 'When you upload an EPUB or PDF we extract the text, split it into reader pages, pull out images, and prepare the search index. For most books this takes 5–30 seconds.',
  },
  {
    q: 'Can I read in a language other than English?',
    a: 'You can translate any word or sentence into your chosen language using the AI tools in the reader. The reader text itself stays in the source language.',
  },
  {
    q: 'How do highlights work?',
    a: 'Tap a word to look it up; long-press a sentence to translate or save it. Saved words and sentences live in the Highlights screen for review.',
  },
  {
    q: 'My book failed to process — what now?',
    a: 'Long-press the book in your library to retry processing or delete and re-upload. Scanned-PDF imports aren\'t supported yet — books need selectable text.',
  },
];

export function HelpScreen({ onBack }: { onBack: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Help & FAQ" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperCopy}>
          Quick answers to common questions. Still stuck? Tap "Send
          feedback" from the You tab and we'll get back to you.
        </Text>
        <Section label="Frequently asked">
          {FAQ.map((item, idx) => {
            const isOpen = open === idx;
            return (
              <Pressable
                key={item.q}
                onPress={() => setOpen(isOpen ? null : idx)}
                style={({ pressed }) => [
                  styles.faqRow,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.faqHeader}>
                  <Text style={styles.faqQ}>{item.q}</Text>
                  <Icon
                    name={isOpen ? 'X' : 'Plus'}
                    size={14}
                    color={tokens.textColors.muted}
                  />
                </View>
                {isOpen && <Text style={styles.faqA}>{item.a}</Text>}
              </Pressable>
            );
          })}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Send feedback ───────────────────────────────────────────────────────────

export function SendFeedbackScreen({ onBack }: { onBack: () => void }) {
  // The whole screen is a hand-off — we don't collect feedback in
  // the app, we just surface the support email and let the user
  // reach us from wherever they normally email from. Reasons:
  //   1. A textarea inside the app is a worse compose surface than
  //      the user's actual mail app (no attachments, no autosave,
  //      no record in their Sent folder, no formatting).
  //   2. An "Open mail app" button doesn't help on Android devices
  //      with no native mail client (Gmail-web users) — the only
  //      reliable affordance is "copy the address". One-action UI
  //      beats two stacked actions with different reliability.
  //   3. Server-side ingestion via an edge function is on the
  //      roadmap for v10 — until then, this is the simplest path
  //      that always works.
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      setCopied(true);
      // Reset the affordance after a beat so a subsequent tap still
      // reads as a real action ("Copied" → "Tap to copy" cycle).
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard set is essentially infallible on modern Android /
      // iOS; if it ever fails, the user can long-press the visible
      // address to select + copy manually.
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <DrillHeader title="Send feedback" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.helperCopy}>
          Help us make Bookflow better — bug reports, feature ideas, or
          anything on your mind. We read everything and reply within a
          couple of days.
        </Text>

        <Pressable
          onPress={handleCopyEmail}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${SUPPORT_EMAIL} to clipboard`}
          style={({ pressed }) => [
            styles.emailCard,
            pressed && { opacity: 0.85 },
          ]}
        >
          {/* Two-column row. Left column stacks the email address
              above its "Tap to copy" hint; the icon on the right is
              vertically centered against that whole stack (via the
              parent row's alignItems: 'center'), so it reads as
              "this whole card is the action" rather than belonging
              only to the email line. */}
          <View style={styles.emailCardLeft}>
            <Text style={styles.emailCardValue} numberOfLines={1}>
              {SUPPORT_EMAIL}
            </Text>
            <Text style={styles.emailCardHint}>
              {copied ? 'Copied to clipboard' : 'Tap to copy'}
            </Text>
          </View>
          <Icon
            name={copied ? 'Check' : 'Copy'}
            size={18}
            color={
              copied
                ? tokens.colors.forest[700]
                : tokens.textColors.muted
            }
          />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Shared primitives ───────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function RadioRow({
  label,
  hint,
  selected,
  locked,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  /** When true the row dims and shows a lock icon in place of the
   * radio dot. Tap is disabled so the row can't be selected. Used by
   * the Default voice screen to gate Pro voices on free plans. */
  locked?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      style={({ pressed }) => [
        styles.radioRow,
        locked && { opacity: 0.55 },
        pressed && !locked && { opacity: 0.85 },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!locked }}
    >
      <View style={styles.radioLabelCol}>
        <Text style={styles.radioLabel}>{label}</Text>
        {hint && <Text style={styles.radioHint}>{hint}</Text>}
      </View>
      {locked ? (
        <Icon name="Lock" size={14} color={tokens.textColors.subtle} />
      ) : (
        <View style={[styles.radioDot, selected && styles.radioDotSelected]}>
          {selected && <View style={styles.radioDotInner} />}
        </View>
      )}
    </Pressable>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabelCol}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {sublabel && <Text style={styles.toggleSublabel}>{sublabel}</Text>}
      </View>
      <CustomToggle value={value} onChange={onChange} />
    </View>
  );
}

/**
 * Custom toggle that matches the rest of the app (Settings screen,
 * Reading display options). The native iOS `Switch` looked out of
 * place — different proportions, no shadow on the knob, system-blue
 * focus tint that fought the forest accent. This is a Pressable
 * shaped like a 44×26 capsule with a cream knob that slides between
 * the two ends; same shape and palette the Settings toggle uses.
 */
function CustomToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[
        styles.customToggleTrack,
        {
          backgroundColor: value
            ? tokens.colors.forest[800]
            : tokens.colors.ink[200],
        },
      ]}
    >
      <View
        style={[
          styles.customToggleKnob,
          value ? styles.customToggleKnobRight : styles.customToggleKnobLeft,
        ]}
      />
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.bgColors.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.borderColors.subtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: tokens.fonts.display,
    fontSize: 17,
    fontWeight: '500',
    color: tokens.textColors.primary,
    textAlign: 'center',
  },
  headerSpacer: { width: 36 },

  body: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 22,
  },
  helperCopy: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    marginBottom: -4,
  },

  section: { gap: 10 },
  sectionLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.textColors.muted,
  },
  sectionBody: {
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },

  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
    gap: 12,
  },
  radioLabelCol: { flex: 1, gap: 2 },
  radioLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  radioHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  radioDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: tokens.borderColors.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDotSelected: { borderColor: tokens.colors.forest[800] },
  radioDotInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.colors.forest[800],
  },

  sizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  sizeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: tokens.borderColors.subtle,
    backgroundColor: tokens.bgColors.canvas,
  },
  sizeBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    color: tokens.textColors.primary,
  },
  sizeValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
  },

  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
  },
  themeSwatch: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.borderColors.subtle,
  },
  themeSwatchLetter: {
    fontFamily: tokens.fonts.display,
    fontSize: 16,
    fontWeight: '500',
  },
  themeLabel: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
  },
  toggleLabelCol: { flex: 1, gap: 2 },
  toggleLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  toggleSublabel: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },

  // Custom toggle — matches the Settings-screen toggle shape (44×26
  // capsule, cream knob with shadow, forest fill when on, ink[200]
  // when off). Native iOS Switch was visually inconsistent; this
  // shape is what the rest of the app uses for boolean controls.
  customToggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    flexShrink: 0,
  },
  customToggleKnob: {
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
  customToggleKnobRight: { right: 3 },
  customToggleKnobLeft: { left: 3 },

  faqRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.borderColors.subtle,
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQ: {
    flex: 1,
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    color: tokens.textColors.primary,
  },
  faqA: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.textColors.muted,
    marginTop: 8,
  },

  // ── Send feedback ──────────────────────────────────────────────
  // The email handoff card. Tappable surface that copies the
  // address so a user without a mail app can still grab it for
  // paste into Gmail / Outlook / web mail.
  //
  // Layout: row with the email + hint stacked on the left and the
  // copy icon on the right. The row's alignItems: 'center' vertically
  // centers the icon against the full stack, so it sits at the
  // visual midpoint of the email line and the "Tap to copy" hint
  // rather than aligning to just the email row.
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  emailCardLeft: {
    flex: 1,
    gap: 4,
  },
  emailCardValue: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 15,
    color: tokens.textColors.primary,
  },
  emailCardHint: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    color: tokens.textColors.muted,
  },
  submitBtn: {
    backgroundColor: tokens.colors.forest[800],
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
  errorMsg: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.warn,
  },
  successMsg: {
    fontFamily: tokens.fonts.ui,
    fontSize: 13,
    color: tokens.colors.forest[700],
  },

  footnote: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 18,
    color: tokens.textColors.subtle,
    marginTop: 4,
  },

  // Upsell card — shown beneath the Pro voices section when the user
  // is on the free plan. Matches the visual treatment of the same
  // card on the Listen-screen VoiceSheet so the two surfaces nudge
  // toward upgrade consistently.
  upsellCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tokens.bgColors.surface,
    borderRadius: 12,
    padding: 14,
  },
  upsellTextCol: { flex: 1, gap: 2 },
  upsellTitle: {
    fontFamily: tokens.fonts.display,
    fontSize: 14,
    fontWeight: '500',
    color: tokens.textColors.primary,
  },
  upsellSub: {
    fontFamily: tokens.fonts.ui,
    fontSize: 12,
    lineHeight: 17,
    color: tokens.textColors.muted,
  },
  upsellBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: tokens.colors.forest[800],
  },
  upsellBtnLabel: {
    fontFamily: tokens.fonts.uiMedium,
    fontSize: 13,
    fontWeight: '500',
    color: tokens.colors.cream[50],
  },
});
