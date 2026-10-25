/**
 * Reading display. Reached from BOTH You and Settings — one route now,
 * which is the point of the duplication finding in the route map.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { ReadingDisplayScreen } from '~/features/account';

export default function Route() {
  const router = useRouter();
  return <ReadingDisplayScreen onBack={() => router.back()} />;
}
