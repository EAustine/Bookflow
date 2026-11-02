/**
 * Alerts on web — the queue behind `alert()`. The dialog that draws
 * them is `components/AlertHost`.
 *
 * See `alert.ts` for why this adapter exists; the short version is that
 * `react-native-web`'s `Alert.alert` is `static alert() {}`, so 30 calls
 * were drawing nothing at all.
 *
 * ## An imperative call needs somewhere to land
 *
 * `alert()` is called from async handlers, catch blocks and
 * module-level helpers — places with no React tree to render into. So
 * it enqueues, and the host subscribes.
 *
 * Alerts **queue rather than replace**. Two failures in one handler are
 * two things the user has to read, and the second arriving should not
 * erase the first.
 *
 * Anything raised before the host mounts is held and delivered on
 * subscribe, because a failure at module-eval time is exactly the kind
 * that alerts early. `RootErrorBoundary` exists for the same reason.
 */

import type { AlertRequest } from './alert';

let listener: ((request: AlertRequest) => void) | null = null;

/** Raised before a host subscribed. Delivered in order on subscribe. */
const pending: AlertRequest[] = [];

export const alert: typeof import('./alert').alert = (
  title,
  message,
  buttons,
) => {
  // RN shows a lone "OK" when a caller passes no buttons, and most of
  // the 30 call sites rely on it, so the default lives here rather than in
  // every one of them.
  const request: AlertRequest = {
    title,
    message,
    buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
  };
  if (listener) listener(request);
  else pending.push(request);
};

export const subscribeToAlerts: typeof import('./alert').subscribeToAlerts = (
  onAlert,
) => {
  listener = onAlert;
  if (pending.length > 0) {
    for (const request of pending.splice(0, pending.length)) onAlert(request);
  }
  return () => {
    // Only if it is still ours. A second host mounting and unmounting
    // should not silence the first one's subscription.
    if (listener === onAlert) listener = null;
  };
};
