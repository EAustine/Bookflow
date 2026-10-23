import { Stack } from 'expo-router';

/**
 * Onboarding stack.
 *
 * `gestureEnabled: false` — swiping back out of onboarding would strand
 * a signed-in user on a screen the session-restore branch had already
 * decided they were past. Progress forward or not at all.
 */
export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
  );
}
