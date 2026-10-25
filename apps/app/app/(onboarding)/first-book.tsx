import { useRouter } from 'expo-router';
import { OnboardingFirstBookScreen } from '~/features/auth';

export default function FirstBook() {
  const router = useRouter();
  // `replace`, not `push`: onboarding is finished, so Library becomes
  // the root of history. Back from Library must exit the app rather
  // than re-entering a flow the user has completed.
  const done = () => router.replace('/(tabs)/library');
  return <OnboardingFirstBookScreen onContinue={done} onSkip={done} />;
}
