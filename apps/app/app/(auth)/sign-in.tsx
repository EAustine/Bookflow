import { useRouter } from 'expo-router';
import { SignInScreen } from '~/features/auth';

export default function SignIn() {
  const router = useRouter();
  return (
    <SignInScreen
      variant="signin"
      onBack={() => router.back()}
      // `replace`, not `push`: sign-in and sign-up are two faces of one
      // screen, so toggling between them should not stack history. Push
      // would make back walk a chain of alternating variants.
      onSwitchVariant={() => router.replace('/(auth)/sign-up')}
      // The magic link arrives out of band; there is nothing to navigate
      // to here. The deep link into /(auth)/callback is what advances.
      onComplete={() => {}}
    />
  );
}
