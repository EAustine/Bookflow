/**
 * Send feedback.
 *
 * Imports from `YouDrillScreens`, NOT `~/screens/SendFeedbackScreen`.
 * Two components share that name: the standalone file is a full compose
 * form requiring an `onSubmit`, and it is imported by nothing — the app
 * ships the YouDrillScreens version, which hands off to the user's mail
 * app instead. Picking the standalone one here would have changed
 * behaviour on a milestone whose rule is that nothing changes.
 * Logged as F-46.
 *
 * `onBack` is `router.back()` rather than a fixed destination: with one
 * canonical route reachable from two parents, "back" has to mean the
 * history entry the user actually came from. A hard-coded target would
 * send half of them to the wrong screen.
 */
import { useRouter } from 'expo-router';
import { SendFeedbackScreen } from '~/features/account';

export default function Route() {
  const router = useRouter();
  return <SendFeedbackScreen onBack={() => router.back()} />;
}
