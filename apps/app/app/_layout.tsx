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
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, ToastAndroid } from "react-native";
import { useBackHandler } from "~/lib/useBackHandler";
import { Slot, useRouter, usePathname } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { SplashScreen, setupRevenueCatAuthSync } from "~/features/auth";
import { RootErrorBoundary } from "~/components/RootErrorBoundary";
import { AudioSessionProvider } from "~/features/listen";
import { ToastHost } from "~/components/ToastHost";
import { QueryProvider } from "~/core/query";
import { StatusBar } from "expo-status-bar";
import { supabase } from "~/lib/supabase";
import { useAppFonts } from "~/lib/useAppFonts";
import { applyOrientationPolicy } from "~/platform/orientation";
import { configureRevenueCat } from "~/features/billing";
import {
  useDailyReminderSync,
  useNotificationPermission,
  useStreakWarningSync,
} from "~/lib/notifications";
import { useReaderStore } from "~/stores/readerStore";
import {
  initialBootHandoffPhase,
  nextBootHandoff,
  type BootHandoffPhase,
} from "@bookflow/shared";

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

/** How long a first back press stays "armed" for a confirming second one. */
const BACK_TO_EXIT_WINDOW_MS = 2000;

/** Where boot decided to go. `null` until restore answers. */
type Destination =
  "/(auth)/welcome" | "/(onboarding)/intent" | "/(tabs)/library";

export default function RootLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const fontsLoaded = useAppFonts();

  // A cold start from a magic link opens `/auth/callback` directly. That
  // route owns navigation from then on: it exchanges the token and routes
  // to Library or onboarding, or renders the "link expired" screen.
  //
  // Session restore must not race it, and must not act on what it
  // decided before the exchange either. Both failure modes and the fix
  // are in `bootHandoff.ts`; this flag is the input it turns on.
  //
  // `usePathname`, not `useSegments`: with typed routes the segments
  // tuple is a union whose shortest member has no index 1.
  const onAuthCallback = pathname.startsWith('/auth/callback');

  const [destination, setDestination] = useState<Destination | null>(null);
  const [splashDone, setSplashDone] = useState(false);
  const onSplashComplete = useCallback(() => setSplashDone(true), []);

  // Orientation policy: phones portrait, tablets and web free (§1 of
  // the responsive brief). Runs once, before anything has laid out, and
  // never again — the device does not change category mid-session.
  useEffect(() => {
    void applyOrientationPolicy();
  }, []);

  /**
   * RevenueCat identity. **Here, not in `SignedInShell`** — this has to
   * be live before any screen can open a paywall, and the shell only
   * mounts once you are already signed in.
   *
   * This ran nowhere at all between the M2 router cutover and now. Both
   * calls lived in `App.tsx`, which the cutover orphaned, and the shell
   * imported them without calling either. `configureRevenueCat` is what
   * sets the module's `configured` flag, and every other billing
   * function returns early without it — so `Purchases.logIn` never ran,
   * no customer was ever created, and nobody could subscribe or be
   * granted an entitlement.
   *
   * Order matters: configure first, because login guards on it.
   * `setupRevenueCatAuthSync` then logs in with the Supabase user id on
   * session restore and on every `SIGNED_IN`, and returns its own
   * unsubscribe. Both are no-ops on web until M4b's billing adapter.
   */
  useEffect(() => {
    configureRevenueCat();
    return setupRevenueCatAuthSync();
  }, []);

  /**
   * Daily reading reminder and streak nudge — same story, same cause.
   * Both hooks were called only from `App.tsx`, so since the cutover
   * Settings has been writing a reminder time that nothing acted on.
   *
   * `useNotificationPermission` only *reads* the permission
   * (`getPermissionsAsync`); it never prompts. And both syncs schedule
   * only when the toggle is on **and** permission is already granted,
   * so launching the app can neither raise a prompt nor schedule
   * anything the user did not ask for.
   */
  const reminderEnabled = useReaderStore((s) => s.notifReminderOn);
  const reminderHour = useReaderStore((s) => s.notifReminderHour);
  const reminderMinute = useReaderStore((s) => s.notifReminderMinute);
  const streakWarningEnabled = useReaderStore((s) => s.notifStreakWarningOn);
  const { granted: notifGranted } = useNotificationPermission();
  useDailyReminderSync(
    reminderEnabled,
    reminderHour,
    reminderMinute,
    notifGranted,
  );
  useStreakWarningSync(
    streakWarningEnabled,
    reminderHour,
    reminderMinute,
    notifGranted,
  );

  /**
   * Android hardware back, last resort. Restored from `App.tsx`, which
   * the M2 cutover orphaned: `SignedInShell` has been importing
   * `useBackHandler` ever since without calling it, so for the whole of
   * that period a single back press at a tab home killed the app with
   * no warning. Ten screens register their own handlers; nothing sat
   * underneath them.
   *
   * Subscriptions are LIFO, so this belongs at the root, which mounts
   * first and therefore runs last. It fires only when no screen has
   * consumed the press. First press warns and opens a two second
   * window; a second press inside it exits. The hook is already a
   * no-op off Android, so web and iOS need no guard here.
   */
  const lastBackPressRef = useRef(0);
  useBackHandler(() => {
    const now = Date.now();
    if (now - lastBackPressRef.current < BACK_TO_EXIT_WINDOW_MS) {
      BackHandler.exitApp();
      return true;
    }
    lastBackPressRef.current = now;
    if (Platform.OS === "android") {
      ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
    }
    // Consume it, so the OS does not also exit on this first press.
    return true;
  });

  /**
   * The hand-off. Both conditions must hold: a destination to go to,
   * and a splash that has finished saying what it had to say — plus the
   * magic-link case, which is why the decision is a tested state
   * machine in `@bookflow/shared` rather than two `if`s here.
   *
   * The short version: restore picks a destination *before* the
   * callback has exchanged anything, so on a link cold start it parks
   * Welcome, and that value has to be **discarded, not deferred**.
   * Deferring it while the callback route was on screen is what shipped
   * — and because leaving the route is itself a change of input, the
   * hand-off re-ran the instant the callback succeeded and replaced a
   * freshly signed-in user with Welcome. `bootHandoff.ts` has the full
   * history and the phases; its spec replays both bugs.
   */
  const handoffPhase = useRef<BootHandoffPhase>(initialBootHandoffPhase);
  useEffect(() => {
    const next = nextBootHandoff(handoffPhase.current, {
      splashDone,
      destination,
      onAuthCallback,
    });
    handoffPhase.current = next.phase;
    if (next.action.kind === "navigate") router.replace(next.action.to);
  }, [splashDone, destination, router, onAuthCallback]);

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
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) {
          setDestination("/(auth)/welcome");
          return;
        }

        const lookup = supabase
          .from("profiles")
          .select("onboarding_complete")
          .eq("id", session.user.id)
          .single();
        const timeout = new Promise<{ data: null; error: { message: string } }>(
          (resolve) =>
            setTimeout(
              () => resolve({ data: null, error: { message: "timeout" } }),
              PROFILE_LOOKUP_TIMEOUT_MS,
            ),
        );
        const { data: profile, error } = await Promise.race([lookup, timeout]);
        if (cancelled) return;
        if (error) {
          // A failed or slow lookup tells us nothing about onboarding, so
          // it must not be read as "not onboarded". It used to fall
          // through to the shared line below, where `profile` is null and
          // `profile?.onboarding_complete` is undefined — so a signed-in
          // user with a full library was sent back through onboarding
          // because one query took longer than 4s. Seen on the emulator:
          // "[boot] profile lookup failed: timeout" and then the intent
          // screen. The comment on this effect already said failures
          // should fall through to Library; only the code disagreed.
          console.warn("[boot] profile lookup failed:", error.message);
          setDestination("/(tabs)/library");
          return;
        }

        setDestination(
          profile?.onboarding_complete
            ? "/(tabs)/library"
            : "/(onboarding)/intent",
        );
      } catch (err) {
        console.warn("[boot] session restore threw:", err);
        if (!cancelled) setDestination("/(auth)/welcome");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(
      () => setDestination((prev) => prev ?? "/(auth)/welcome"),
      SESSION_RESTORE_CEILING_MS,
    );
    return () => clearTimeout(timer);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <RootErrorBoundary>
      <QueryProvider>
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
      </QueryProvider>
    </RootErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
