/**
 * Playback speed catalog.
 *
 * `PLAYBACK_SPEEDS` is the set the store persists and three screens
 * render. `SPEED_CATALOG` is the copy shown in the speed sheet. They
 * lived in two files and drifted once already — a 3× entry shipped in
 * the sheet that the store could not store.
 *
 * Both live here now, with `speedCatalogCoversStore()` as a runtime
 * check to go with the compile-time one. M1 adds the test.
 */
export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type Speed = (typeof PLAYBACK_SPEEDS)[number];

export type SpeedDef = {
  value: Speed;
  display: string;
  label: string;
  description: string;
};

export const SPEED_CATALOG: SpeedDef[] = [
  { value: 0.5,  display: '0.5×',  label: 'Slow',       description: 'Half speed — useful for unfamiliar accents or dense passages.' },
  { value: 0.75, display: '0.75×', label: 'Leisurely',  description: 'A relaxed pace, slower than natural speech.' },
  { value: 1,    display: '1×',    label: 'Normal',     description: 'Natural narration speed — exactly how the audio was recorded.' },
  { value: 1.25, display: '1.25×', label: 'Brisk',      description: '1.25× — slightly faster than natural speech. Most people find this easy to follow while listening.' },
  { value: 1.5,  display: '1.5×',  label: 'Fast',       description: '1.5× — noticeably faster. Comprehension stays high once your ear adjusts.' },
  { value: 1.75, display: '1.75×', label: 'Quick',      description: 'Fast pace — best for re-listening or when content is familiar.' },
  { value: 2,    display: '2×',    label: 'Rapid',      description: 'Twice natural speed. Great for review; harder for first listens.' },
];

/** Every persisted speed has catalog copy, and the catalog invents none. */
export function speedCatalogCoversStore(): boolean {
  const catalog = new Set(SPEED_CATALOG.map((s) => s.value));
  const store = new Set<number>(PLAYBACK_SPEEDS);
  if (catalog.size !== store.size) return false;
  for (const v of store) if (!catalog.has(v as Speed)) return false;
  return true;
}
