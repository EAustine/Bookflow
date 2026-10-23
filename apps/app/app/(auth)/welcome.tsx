import { useRouter } from 'expo-router';
import { WelcomeScreen } from '~/screens/WelcomeScreen';

export default function Welcome() {
  const router = useRouter();
  return (
    <WelcomeScreen
      onGetStarted={() => router.push('/(auth)/sign-up')}
      onSignIn={() => router.push('/(auth)/sign-in')}
    />
  );
}
