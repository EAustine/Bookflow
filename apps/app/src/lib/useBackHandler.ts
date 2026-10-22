import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Subscribe to the Android hardware back button.
 *
 * Returning `true` from the handler consumes the press — the system
 * does NOT also pop the activity / exit the app. Returning `false`
 * lets the press propagate (other subscribers, then the default OS
 * behaviour which on root is "kill the app").
 *
 * BackHandler subscriptions are LIFO: the most recently subscribed
 * handler fires first. The pattern used in Bookflow is:
 *   - Each sub-screen (Settings, Help, Send feedback, etc.) registers
 *     a handler that calls its own `onBack` callback and returns true.
 *     This re-uses the same back-affordance that the in-screen header
 *     button already wires up.
 *   - The root `App.tsx` registers a handler at the very top of the
 *     subscription stack as a last resort. It fires only when no
 *     sub-screen has handled the press — i.e., the user is on a tab
 *     home — and shows a "Press back again to exit" toast.
 *
 * Handler stability: callers don't need to memoize the handler. We
 * mirror it into a ref so the subscription itself is mounted exactly
 * once per component lifecycle, but the latest handler closure is
 * always what runs. Without this, an inline `() => setView('home')`
 * prop would cause re-subscription on every parent render and
 * occasionally race the BackHandler internals.
 *
 * No-op on iOS (no hardware back button). The hook still mounts and
 * unmounts cleanly so call sites don't need a Platform check.
 */
export function useBackHandler(handler: () => boolean): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => handlerRef.current(),
    );
    return () => subscription.remove();
  }, []);
}
