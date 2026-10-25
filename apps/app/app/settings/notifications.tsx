/**
 * Notification preferences.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { NotificationsScreen } from '~/features/account';

export default function Route() {
  const router = useRouter();
  return <NotificationsScreen onBack={() => router.back()} />;
}
