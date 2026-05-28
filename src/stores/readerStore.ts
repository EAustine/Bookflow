import { create } from 'zustand';

export type ReaderFontFamily = 'serif' | 'sans' | 'lexend';
export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderPreset = 'standard' | 'comfortable' | 'max';
/**
 * Translation language preference. Mirrors the language the AI tools'
 * sentence/word translate flow targets. The reader store owns this
 * because translation is reader-facing — the You screen drill-in just
 * exposes a picker over the same value.
 */
export type TranslationLanguage =
  | 'en'  // English (no-op when source is English)
  | 'es'  // Spanish
  | 'fr'  // French
  | 'de'  // German
  | 'it'  // Italian
  | 'pt'  // Portuguese
  | 'tw'  // Twi
  | 'sw'  // Swahili
  | 'yo'  // Yoruba
  | 'zh'  // Chinese (Simplified)
  | 'ja'  // Japanese
  | 'ko'; // Korean

export const TRANSLATION_LANGUAGE_LABELS: Record<TranslationLanguage, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  tw: 'Twi',
  sw: 'Swahili',
  yo: 'Yoruba',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
  ko: 'Korean',
};

export type ReaderSettings = {
  preset: ReaderPreset;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  theme: ReaderTheme;
  autoHide: boolean;
  translationLanguage: TranslationLanguage;
  /**
   * User's preferred default ElevenLabs voice. The audio session reads
   * this on session start so a user who picked "Adam" once gets Adam
   * for every new book they listen to. Stays in this store (rather
   * than its own) so all reader-adjacent preferences live together.
   */
  defaultVoiceId: string;
  /**
   * Default playback rate (0.5–2.0) for new audio sessions. Same set
   * the per-session control cycles through; persisting it means the
   * user's "I always listen at 1.25x" preference sticks across books.
   */
  defaultPlaybackSpeed: number;
  /**
   * When a phone call interrupts playback, resume automatically on
   * hang-up. Toggle-only — not wired to the audio session yet (call
   * interruption handling is OS-level), but the user preference is
   * captured so we honour it the moment the plumbing lands.
   */
  resumeAfterCalls: boolean;
  /**
   * Notification preferences. Persisted as-is even when the OS
   * notification permission isn't granted so the moment the user
   * flips iOS-level permission on, the right alert types fire
   * without needing a re-toggle.
   */
  notifReminderOn: boolean;
  notifWarningsOn: boolean;
  notifUpdatesOn: boolean;
};

const PRESET_CONFIGS: Record<ReaderPreset, Pick<ReaderSettings, 'fontSize' | 'fontFamily'>> = {
  standard:    { fontSize: 20, fontFamily: 'serif' },
  comfortable: { fontSize: 22, fontFamily: 'serif' },
  max:         { fontSize: 24, fontFamily: 'lexend' },
};

/**
 * Allowed audiobook-style playback speeds. The Listen-screen speed
 * cycle uses the same set, so the user always has the same options
 * across surfaces.
 */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

const DEFAULT: ReaderSettings = {
  preset: 'standard',
  fontSize: 20,
  fontFamily: 'serif',
  theme: 'light',
  autoHide: false,
  translationLanguage: 'tw',
  defaultVoiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel — same as aiAudio.DEFAULT_VOICE
  defaultPlaybackSpeed: 1,
  resumeAfterCalls: true,
  notifReminderOn: true,
  notifWarningsOn: true,
  notifUpdatesOn: false,
};

type ReaderStore = ReaderSettings & {
  setPreset: (preset: ReaderPreset) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: ReaderFontFamily) => void;
  setTheme: (theme: ReaderTheme) => void;
  setAutoHide: (v: boolean) => void;
  setTranslationLanguage: (lang: TranslationLanguage) => void;
  setDefaultVoiceId: (voiceId: string) => void;
  setDefaultPlaybackSpeed: (speed: number) => void;
  setResumeAfterCalls: (v: boolean) => void;
  setNotifReminderOn: (v: boolean) => void;
  setNotifWarningsOn: (v: boolean) => void;
  setNotifUpdatesOn: (v: boolean) => void;
  reset: () => void;
};

export const useReaderStore = create<ReaderStore>((set) => ({
  ...DEFAULT,
  setPreset: (preset) => set({ preset, ...PRESET_CONFIGS[preset] }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setTheme: (theme) => set({ theme }),
  setAutoHide: (autoHide) => set({ autoHide }),
  setTranslationLanguage: (translationLanguage) => set({ translationLanguage }),
  setDefaultVoiceId: (defaultVoiceId) => set({ defaultVoiceId }),
  setDefaultPlaybackSpeed: (defaultPlaybackSpeed) => set({ defaultPlaybackSpeed }),
  setResumeAfterCalls: (resumeAfterCalls) => set({ resumeAfterCalls }),
  setNotifReminderOn: (notifReminderOn) => set({ notifReminderOn }),
  setNotifWarningsOn: (notifWarningsOn) => set({ notifWarningsOn }),
  setNotifUpdatesOn: (notifUpdatesOn) => set({ notifUpdatesOn }),
  reset: () => set(DEFAULT),
}));
