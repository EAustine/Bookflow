import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  OnboardingIntentScreen,
  persistOnboardingIntent,
  updateProfileRow,
  type OnboardingIntent,
} from '~/features/auth';
import { supabase } from '~/lib/supabase';

export default function Intent() {
  const router = useRouter();

  /**
   * Continue and Skip go to the same screen and differ only in what
   * they record: the chosen intent, or an explicit `null` meaning the
   * user was asked and declined.
   *
   * The write is restored from `App.tsx`, where `persistOnboardingIntent`
   * lived until the M2 router cutover orphaned the file. The comment
   * that stood here said "App.tsx did not persist it either", which was
   * simply wrong, and on that basis the column has been null for every
   * account created since. `OnboardingIntentScreen` has meanwhile gone
   * on claiming the intent "is stored on profile".
   *
   * Fire and forget, and navigation does not wait on it: onboarding is
   * a soft signal and a network hiccup must not strand anyone on a
   * button that appears dead.
   */
  const go = useCallback(
    (intent: OnboardingIntent | null) => {
      void (async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;
        await persistOnboardingIntent(
          updateProfileRow,
          session.user.id,
          intent,
        );
      })();
      router.push('/(onboarding)/first-book');
    },
    [router],
  );

  return (
    <OnboardingIntentScreen
      onContinue={(intent) => go(intent)}
      onSkip={() => go(null)}
    />
  );
}
