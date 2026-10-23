/**
 * Root layout — the top of the Expo Router tree.
 *
 * Takes over the four things `App.tsx` did before any screen rendered:
 * load fonts, mount the provider stack, restore the session, and hold
 * the splash until both the animation and the restore have finished.
 *
 * The split in §5 of docs/ARCHITECTURE.md is the point: **restore
 * decides where, the splash decides when.** `App.tsx` already worked
 * that way (F-37) — restore parked a destination in `postSplashStage`
 * and the splash timer performed the move. That shape is preserved
 * here rather than reinvented, because it is the fix for a real bug:
 * before it, a fast session restore cut the splash off at 1.25s and the
 * breath animation never ran.
 *
 * Route tree: docs/M2_ROUTE_MAP.md
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SplashScreen } from '~/screens/SplashScreen';
import { RootErrorBoundary } from '~/components/RootErrorBoundary';
import { AudioSessionProvider } from '~/lib/audioSession';
import { ToastHost } from '~/components/ToastHost';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '~/lib/supabase';
import { useAppFonts } from '~/lib/useAppFonts';

/**
 * Last-resort ceiling on the splash. Every branch of session restore
 * sets a destination, so this should never fire — it is here so a boot
 * path nobody anticipated degrades to "sign in again" rather than to a
 * logo breathing forever.
 */
const SESSION_RESTORE_CEILING_MS = 8000;

/**
 * Cap the profile lookup the same way `estimateDownload` does. A hung
 * query would otherwise hold the splash open past its own timer, and we
 * already know enough to let the user in.
 */
const PROFILE_LOOKUP_TIMEOUT_MS = 4000;

/** Where boot decided to go. `null` until restore answers. */
type Destination = '/(auth)/welcome' | '/(onboarding)/intent' | '/(tabs)/library';

export default function RootLayout() {
  const router = useRouter();
  const fontsLoaded = useAppFonts();

  const [destination, setDestination] = useState<Destination | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const onSplashComplete = useCallback(() => setSplashDone(true), []);

  // The hand-off. Both conditions must hold: a destination to go to, and
  // a splash that has finished saying what it had to say.
  useEffect(() => {
    if (!splashDone || !destination) return;
    router.replace(destination);
  }, [splashDone, destination, router]);

  /**
   * Session restore. Decides the destination and nothing else.
   *
   * Every branch sets one, including the failures: a user who never gets
   * one would sit on the splash indefinitely. Profile fetch failures and
   * timeouts fall through to Library — RLS enforces the row filter, so a
   * missing or errored profile should not strand someone we already know
   * is signed in. Better to let them in and surface any DB issue
   * downstream.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) {
          setDestination('/(auth)/welcome');
          return;
        }

        const lookup = supabase
          .from('profiles')
          .select('onboarding_complete')
          .eq('id', session.user.id)
          .single();
        const timeout = new Promise<{ data: null; error: { message: string } }>(
          (resolve) =>
            setTimeout(
              () => resolve({ data: null, error: { message: 'timeout' } }),
              PROFILE_LOOKUP_TIMEOUT_MS,
            ),
        );
        const { data: profile, error } = await Promise.race([lookup, timeout]);
        if (cancelled) return;
        if (error) {
          console.warn('[boot] profile lookup failed:', error.message);
        }

        setDestination(
          profile?.onboarding_complete ? '/(tabs)/library' : '/(onboarding)/intent',
        );
      } catch (err) {
        console.warn('[boot] session restore threw:', err);
        if (!cancelled) setDestination('/(auth)/welcome');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => setDestination((prev) => prev ?? '/(auth)/welcome'),
      SESSION_RESTORE_CEILING_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          {/*
            AudioSessionProvider sits ABOVE BottomSheetModalProvider so
            bottom sheets — which render through the modal provider's
            portal, OUTSIDE the React tree where they are declared — can
            still see the audio context via `useAudioSession()`. Without
            this the per-book VoiceSheet on Listen crashed with
            "useAudioSession must be used inside <AudioSessionProvider>"
            the instant the user tapped the voice picker.

            Safe to mount this early because its inner `useAudio` is
            dormant while `book === null`, and the only mount-time work
            is reading a few Zustand values synchronously.
          */}
          <AudioSessionProvider>
            <BottomSheetModalProvider>
              {/* The splash covers the whole tree until the hand-off.
                  Rendering it over `<Slot />` rather than instead of it
                  lets the destination route mount and settle behind the
                  animation, so the transition has nothing to wait for. */}
              <Slot />
              {!splashDone && <SplashScreen onComplete={onSplashComplete} />}
              <StatusBar style="dark" />
            </BottomSheetModalProvider>
          </AudioSessionProvider>
          {/* Outside AudioSessionProvider and the modal provider, exactly
              as App.tsx had it: toasts must paint above bottom sheets,
              and the modal provider's portal would otherwise cover them. */}
          <ToastHost />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
