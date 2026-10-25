/**
 * Default voice. Reached from both You and Settings.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { DefaultVoiceScreen } from '~/features/account';

export default function Route() {
  const router = useRouter();
  return <DefaultVoiceScreen onBack={() => router.back()} />;
}
