/**
 * The app's font load, in one place.
 *
 * Extracted from `App.tsx` in M2 so the Expo Router root layout can own
 * it. Same seven faces, unchanged.
 *
 * Seven, not more: Expo Google Fonts registers **each weight as its own
 * family**, so `fonts.display` resolving to `Fraunces_600SemiBold` means
 * that exact family has to be loaded here or the text silently falls
 * back. A family listed in `~/design/tokens` and missing from this list
 * is the failure mode — it renders, just not in the face you asked for.
 *
 * ## Why each weight is imported from its own subpath
 *
 * Each `@expo-google-fonts/*` barrel does an eager top-level
 * `require()` of **every** weight it ships: 18 for Fraunces, 16 for
 * Literata. Metro puts an asset in the bundle because something in the
 * graph requires it, and a named import from the barrel still evaluates
 * the barrel, so asking for three Fraunces faces shipped all eighteen.
 * The export carried 52 `.ttf` files, 6.7 MB, for the seven below.
 *
 * Each weight also has its own entry point — one require of one file,
 * typed — so the subpath import costs nothing in clarity and is the
 * difference between seven font files and fifty-two. Keep it that way:
 * one barrel import anywhere in the graph brings the whole family back,
 * which is how 45 unused faces survived until M4c.
 */
import { useFonts } from 'expo-font';
import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Lexend_400Regular } from '@expo-google-fonts/lexend/400Regular';
import { Literata_400Regular } from '@expo-google-fonts/literata/400Regular';

export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Fraunces_400Regular_Italic,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Lexend_400Regular,
    Literata_400Regular,
  });
  return loaded;
}
