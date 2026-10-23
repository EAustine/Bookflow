import { Stack } from 'expo-router';

/**
 * Pre-auth stack.
 *
 * Headers off: every screen in this group draws its own back control
 * (the circular `ArrowLeft` button), and a native header on top of that
 * would be a second back affordance in a different style.
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
