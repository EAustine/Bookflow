/**
 * Default playback speed. Settings only.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { PlaybackSpeedScreen } from '~/features/account';

export default function Route() {
  const router = useRouter();
  return <PlaybackSpeedScreen onBack={() => router.back()} />;
}
