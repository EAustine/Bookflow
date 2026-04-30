import { create } from 'zustand';

export type ReaderFontFamily = 'serif' | 'sans' | 'lexend';
export type ReaderTheme = 'light' | 'sepia' | 'dark';
export type ReaderPreset = 'standard' | 'comfortable' | 'max';

export type ReaderSettings = {
  preset: ReaderPreset;
  fontSize: number;
  fontFamily: ReaderFontFamily;
  theme: ReaderTheme;
};

const PRESET_CONFIGS: Record<ReaderPreset, Pick<ReaderSettings, 'fontSize' | 'fontFamily'>> = {
  standard:    { fontSize: 20, fontFamily: 'serif' },
  comfortable: { fontSize: 22, fontFamily: 'serif' },
  max:         { fontSize: 24, fontFamily: 'lexend' },
};

const DEFAULT: ReaderSettings = {
  preset: 'standard',
  fontSize: 20,
  fontFamily: 'serif',
  theme: 'light',
};

type ReaderStore = ReaderSettings & {
  setPreset: (preset: ReaderPreset) => void;
  setFontSize: (size: number) => void;
  setFontFamily: (family: ReaderFontFamily) => void;
  setTheme: (theme: ReaderTheme) => void;
  reset: () => void;
};

export const useReaderStore = create<ReaderStore>((set) => ({
  ...DEFAULT,
  setPreset: (preset) => set({ preset, ...PRESET_CONFIGS[preset] }),
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
  setTheme: (theme) => set({ theme }),
  reset: () => set(DEFAULT),
}));
