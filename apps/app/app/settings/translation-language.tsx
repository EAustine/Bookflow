/**
 * Translation language. Reached from both You and Settings.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { TranslationLanguageScreen } from '~/screens/YouDrillScreens';

export default function Route() {
  const router = useRouter();
  return <TranslationLanguageScreen onBack={() => router.back()} />;
}
