/**
 * Share intent — the §8 adapter over `expo-share-intent`: files handed
 * to Bookflow from the OS share sheet, by the iOS Share Extension or an
 * Android intent filter.
 *
 * The native config for the extension itself lives in `app.json` →
 * plugins → `expo-share-intent` (an iOS Share Extension target, and an
 * Android intent-filter for application/epub+zip and application/pdf).
 * Changes there need a new EAS build, which is why the adapter is only
 * the JS half of this.
 *
 * The hook answers one question — "has the OS handed us files, and when
 * I am done with them, how do I say so" — rather than mirroring the
 * package's `{ hasShareIntent, shareIntent, resetShareIntent, error }`.
 * The caller used exactly two of those four and had to null-check its
 * way through `shareIntent.files` to reach anything; an empty array
 * says the same thing without the dance.
 */

import { useMemo } from 'react';
import { useShareIntent } from 'expo-share-intent';

/**
 * A file the OS gave us. Deliberately nullable where the platform is:
 * a share can arrive with no filename and no declared type, and
 * pretending otherwise pushes the guesswork into the caller silently
 * rather than visibly.
 */
export type SharedFile = {
  uri: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
};

export function useSharedFiles(): {
  files: SharedFile[];
  /** Tell the OS layer the share has been consumed. */
  clear: () => void;
} {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    resetOnBackground: true,
  });

  // Memoised because the caller drives an effect off this array, and a
  // fresh array identity every render would re-run it every render.
  const files = useMemo<SharedFile[]>(() => {
    if (!hasShareIntent || !shareIntent.files) return [];
    return shareIntent.files.map((file) => ({
      uri: file.path,
      name: file.fileName ?? null,
      mimeType: file.mimeType ?? null,
      size: file.size ?? null,
    }));
  }, [hasShareIntent, shareIntent]);

  return { files, clear: resetShareIntent };
}
