/**
 * Alerts — native side, which is React Native's own.
 *
 * ## Why this adapter exists
 *
 * `Alert.alert` is **a no-op on web**. `react-native-web` ships
 * `class Alert { static alert() {} }`: an empty function, no dialog, no
 * warning, no error. The app had 30 `Alert.alert` calls across
 * seven files, so in the web build every one of those confirmations and
 * every one of those error messages was silently swallowed. A user who
 * pressed "Delete account" got nothing at all, and so did a user whose
 * purchase failed.
 *
 * That has been true since M4a made the web bundle load, and nothing
 * caught it because an empty function does not throw, does not log and
 * does not fail a build.
 *
 * ## The split is platform, not width
 *
 * §4: "iOS alert on tablets, web dialog on desktop". That reads like a
 * size rule and is not one — the Figma frames put a native alert on
 * Compact, Medium and Expanded and draw a 400 `dialog` only on Desktop,
 * which are the tablet frames and the web frame respectively. There is
 * no native alert on the web at any width, so the branch belongs here,
 * beside `focusVisible` and for the same reason `useSizeClass`
 * documents: some traits are about being on the web, not about being
 * wide.
 *
 * Native therefore keeps the OS alert at every size, which is what the
 * frames draw and what the platform's users expect.
 *
 * ## The shape is RN's
 *
 * `alert(title, message?, buttons?)` on purpose: the migration of 30
 * call sites was a change of import, not a rewrite. RN's fourth
 * `options` argument is left out because nothing passed it.
 *
 * ## Why the dialog is not in here
 *
 * The web dialog is `components/AlertHost`, not a `.web` sibling of
 * this file. An adapter sits at the bottom of the stack and the design
 * system sits above it, so `platform/*` importing `Modal` and `Button`
 * would turn the arrow around. What crosses the boundary instead is
 * `subscribeToAlerts`, which carries no UI.
 */

import { Alert } from 'react-native';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
};

export function alert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  Alert.alert(title, message, buttons);
}

/** What a host receives. Web only; nothing on native produces one. */
export type AlertRequest = {
  title: string;
  message?: string;
  /** Never empty: a caller that passes none gets RN's lone "OK". */
  buttons: AlertButton[];
};

/**
 * Web only. `AlertHost` calls this and native hands it nothing to do,
 * because the OS draws the alert itself and `alert` above never
 * reaches a listener. Returns its own unsubscribe, so the host's
 * effect can clean up without a platform branch.
 */
export function subscribeToAlerts(
  _onAlert: (request: AlertRequest) => void,
): () => void {
  return () => {};
}
