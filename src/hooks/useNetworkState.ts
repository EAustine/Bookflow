import { useCallback, useEffect, useState } from 'react';
import { NativeModules } from 'react-native';

/**
 * Returns the current network connectivity state.
 *
 * Backed by `@react-native-community/netinfo` when its native module is
 * present in the running binary. We probe `NativeModules.RNCNetInfo` first
 * and only `require()` netinfo when it's there — on a dev client built
 * before this dependency was added, the native module is null and merely
 * *loading* netinfo's JS throws (Metro also surfaces that to LogBox before
 * any try/catch can swallow it). Guarding on the native module avoids
 * touching netinfo at all on such clients; real detection activates
 * automatically in the next native build that bundles it.
 *
 * Note: offline audio playback does NOT depend on this flag — the player
 * prefers a locally-downloaded file whenever one exists (see
 * `audioDownloads.getLocalAudio`), regardless of reported connectivity.
 * This hook drives the offline *banners* and the "streaming unavailable"
 * affordances, and keeps downloaded books playable when offline.
 */
export function useNetworkState(): {
  isConnected: boolean;
  /**
   * Re-probe connectivity now. Backs the offline banner's Retry, which
   * previously received a no-op handler and so rendered a button that
   * did nothing (F-12). Resolves to the freshly-read value; safe to
   * call on a build without netinfo linked, where it is a no-op that
   * resolves to the last known state.
   */
  refresh: () => Promise<boolean>;
} {
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    // Bail unless netinfo's native module is actually linked in this build.
    // netinfo itself reads this same global, so if it's null, requiring the
    // library would throw "NativeModule.RNCNetInfo is null".
    if (!NativeModules || !NativeModules.RNCNetInfo) return;

    let unsubscribe: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NetInfo = require('@react-native-community/netinfo').default;
      // Seed from the current state, then subscribe to future changes.
      NetInfo.fetch()
        .then((state: { isConnected: boolean | null }) => {
          setIsConnected(state.isConnected ?? true);
        })
        .catch(() => {
          /* transient — keep last known value */
        });
      unsubscribe = NetInfo.addEventListener(
        (state: { isConnected: boolean | null }) => {
          setIsConnected(state.isConnected ?? true);
        },
      );
    } catch {
      // Defensive — unreachable given the native-module guard above.
    }
    return () => {
      try {
        unsubscribe?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!NativeModules || !NativeModules.RNCNetInfo) return isConnected;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const NetInfo = require('@react-native-community/netinfo').default;
      const state: { isConnected: boolean | null } = await NetInfo.fetch();
      const next = state.isConnected ?? true;
      setIsConnected(next);
      return next;
    } catch {
      return isConnected;
    }
  }, [isConnected]);

  return { isConnected, refresh };
}
