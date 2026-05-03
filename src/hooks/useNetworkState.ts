import { useState } from 'react';

/**
 * Returns the current network connectivity state.
 *
 * ──── STUB ────
 * Always reports "connected". To wire up real detection, install
 * @react-native-community/netinfo and replace this body:
 *
 *   import NetInfo from '@react-native-community/netinfo';
 *   const [isConnected, setIsConnected] = useState(true);
 *   useEffect(() => {
 *     return NetInfo.addEventListener(state => {
 *       setIsConnected(state.isConnected ?? true);
 *     });
 *   }, []);
 *
 * Flip the default to `false` below to preview offline UI during development.
 */
export function useNetworkState(): { isConnected: boolean } {
  const [isConnected] = useState(true);
  return { isConnected };
}
