import { useEffect, useState } from 'react';

/**
 * Flag a long-running operation as "slow" once it crosses a
 * threshold — usually so the screen can surface a banner letting
 * the user know the wait is on the network, not the app, and
 * offering a manual retry.
 *
 * We don't have a true online/offline signal in the project today
 * (expo-network / @react-native-community/netinfo aren't installed,
 * and adding either is a native rebuild). This hook is a useful
 * approximation: any operation that takes longer than the threshold
 * is almost always a connection problem in practice (slow upstream,
 * dropped Wi-Fi, captive portal). Telling the user
 * "it's taking longer than usual — check your connection" hits the
 * cases users care about without needing a real connectivity API.
 *
 * Usage:
 *
 *   const { loading } = useSomeRequest();
 *   const isSlow = useSlowOp(loading);   // true once `loading` has
 *                                        // been true for > 5s
 *   {isSlow && <SlowNetworkBanner onRetry={refetch} />}
 *
 * Resets to false the moment `active` flips back to false, so the
 * banner disappears as soon as the request completes (success OR
 * error).
 */
export function useSlowOp(active: boolean, thresholdMs = 5000): boolean {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (!active) {
      setIsSlow(false);
      return;
    }
    const id = setTimeout(() => setIsSlow(true), thresholdMs);
    return () => clearTimeout(id);
  }, [active, thresholdMs]);

  return isSlow;
}
