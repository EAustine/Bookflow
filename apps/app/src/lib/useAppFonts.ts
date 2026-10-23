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
 */
import { useFonts } from 'expo-font';
import {
  Fraunces_400Regular_Italic,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { Geist_400Regular, Geist_500Medium } from '@expo-google-fonts/geist';
import { Lexend_400Regular } from '@expo-google-fonts/lexend';
import { Literata_400Regular } from '@expo-google-fonts/literata';

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
