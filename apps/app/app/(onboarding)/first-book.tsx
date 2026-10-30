import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  OnboardingFirstBookScreen,
  persistOnboardingComplete,
  updateProfileRow,
} from '~/features/auth';
import { supabase } from '~/lib/supabase';

export default function FirstBook() {
  const router = useRouter();

  /**
   * Leaving here is what "finished onboarding" means, so record it.
   *
   * This restores a write the M2 router cutover lost, rather than
   * adding a new one. `persistOnboardingComplete` lived in `App.tsx`,
   * which the cutover orphaned, so the flag stopped being written the
   * moment routing moved. Both readers still route on it (session
   * restore in `app/_layout.tsx` and the magic-link callback in
   * `app/auth/callback.tsx`), so since then every user has been sent
   * back through onboarding on every sign-in. Same cause as the
   * RevenueCat and reminder calls the same cutover stranded.
   *
   * Production bears it out: of 28 profiles, exactly 14 carry the flag
   * and 14 do not, split by whether the account onboarded before the
   * cutover or after it.
   *
   * It stayed hidden because the root layout caps its profile lookup at
   * 4s and a timeout falls through to Library: a slow lookup landed you
   * in the app by accident and a fast one put you back in onboarding,
   * which made it look intermittent rather than total.
   *
   * `replace`, not `push`: onboarding is finished, so Library becomes
   * the root of history. Back from Library must exit the app rather
   * than re-entering a flow the user has completed.
   */
  const done = useCallback(() => {
    // Fire-and-forget, and the navigation does not wait on it. A failed
    // write should cost someone a repeated onboarding, not a button
    // that does nothing — the same call restore already makes, where
    // the failure branch errs towards letting people in.
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;
      await persistOnboardingComplete(updateProfileRow, session.user.id);
    })();
    router.replace('/(tabs)/library');
  }, [router]);

  return <OnboardingFirstBookScreen onContinue={done} onSkip={done} />;
}
