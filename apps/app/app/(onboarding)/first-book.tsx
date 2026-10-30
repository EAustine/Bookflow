import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { OnboardingFirstBookScreen } from '~/features/auth';
import { supabase } from '~/lib/supabase';

export default function FirstBook() {
  const router = useRouter();

  /**
   * Leaving here is what "finished onboarding" means, so record it.
   *
   * `profiles.onboarding_complete` had no writer anywhere — not in the
   * app, not in an edge function, not in a migration beyond the
   * `default false` in 0001. Both readers route on it (session restore
   * in `app/_layout.tsx` and the magic-link callback in
   * `app/auth/callback.tsx`), so every user was sent back through
   * onboarding on every single sign-in.
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
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { error } = await supabase
          .from('profiles')
          .update({ onboarding_complete: true })
          .eq('id', session.user.id);
        if (error) {
          console.warn('[onboarding] completion write failed:', error.message);
        }
      } catch (err) {
        console.warn('[onboarding] completion write threw:', err);
      }
    })();
    router.replace('/(tabs)/library');
  }, [router]);

  return <OnboardingFirstBookScreen onContinue={done} onSkip={done} />;
}
