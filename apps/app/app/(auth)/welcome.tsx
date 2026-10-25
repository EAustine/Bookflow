import { useRouter } from 'expo-router';
import { WelcomeScreen } from '~/features/auth';

export default function Welcome() {
  const router = useRouter();
  return (
    <WelcomeScreen
      onGetStarted={() => router.push('/(auth)/sign-up')}
      onSignIn={() => router.push('/(auth)/sign-in')}
    />
  );
}
