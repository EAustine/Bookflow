import { useRouter } from 'expo-router';
import { OnboardingIntentScreen } from '~/screens/OnboardingIntentScreen';

export default function Intent() {
  const router = useRouter();
  const next = () => router.push('/(onboarding)/first-book');
  // Skip and continue go the same place. The intent itself is not
  // persisted here — App.tsx did not persist it either, and M2 is not
  // the place to start. Recorded as an M3 question.
  return <OnboardingIntentScreen onContinue={next} onSkip={next} />;
}
