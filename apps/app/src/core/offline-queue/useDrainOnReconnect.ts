/**
 * Drain the offline queue when the device comes back online.
 *
 * A queue nothing drains is a queue that loses writes politely instead
 * of loudly, so this is the piece that makes the rest worth having.
 *
 * Three triggers, because any one alone leaves a gap:
 *
 *   **Reconnect.** The obvious one.
 *   **Foreground.** Android kills backgrounded apps; the connectivity
 *     event that mattered may have fired while the process was dead.
 *   **Mount.** Covers a cold start with signal already present, where
 *     neither of the other two ever fires.
 *
 * The retry timer is deliberately absent. Backoff already schedules
 * retries, and polling on top of it would defeat the backoff — the
 * point of waiting five minutes is not to ask again in thirty seconds.
 */
import { useEffect } from 'react';
import { AppState, NativeModules } from 'react-native';
import { drain } from './index';

export function useDrainOnReconnect(): void {
  useEffect(() => {
    // Cold start with signal already up.
    void drain();

    // NetInfo is probed the same defensive way `useNetworkState` does:
    // the native module is missing from older dev clients, and
    // importing it unconditionally throws "NativeModule.RNCNetInfo is
    // null" rather than degrading.
    let unsubscribeNet: (() => void) | undefined;
    if (NativeModules?.RNCNetInfo) {
      try {
        const NetInfo = require('@react-native-community/netinfo').default;
        unsubscribeNet = NetInfo.addEventListener(
          (state: { isConnected: boolean | null }) => {
            if (state.isConnected) void drain();
          },
        );
      } catch (err) {
        console.warn('[offline-queue] NetInfo unavailable:', err);
      }
    }

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void drain();
    });

    return () => {
      unsubscribeNet?.();
      appStateSub.remove();
    };
  }, []);
}
