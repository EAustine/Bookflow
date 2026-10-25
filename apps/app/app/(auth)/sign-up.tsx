import { useRouter } from 'expo-router';
import { SignInScreen } from '~/features/auth';

export default function SignUp() {
  const router = useRouter();
  return (
    <SignInScreen
      variant="signup"
      onBack={() => router.back()}
      onSwitchVariant={() => router.replace('/(auth)/sign-in')}
      onComplete={() => {}}
    />
  );
}
