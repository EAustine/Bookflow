/**
 * Clipboard — the §8 adapter for `expo-clipboard`.
 *
 * §8 singles this package out as the most-used native-only dependency
 * in the app, which is why it earns a row despite looking incidental.
 *
 * The surface is one function because that is all any caller has ever
 * needed: put a string on the clipboard. Nothing in the app reads the
 * clipboard back, so there is no `paste` here waiting to go stale, and
 * no reason to re-export the package's shape wholesale — an adapter
 * that mirrors its native implementation is not an adapter, it is an
 * alias, and the web side could not honour it.
 *
 * `clipboard.web.ts` is the sibling Metro resolves for the web build.
 */

import * as Clipboard from 'expo-clipboard';

/**
 * Copy `value` to the system clipboard.
 *
 * Rejects if the platform refuses. Every call site already treats that
 * as benign and recoverable — the user can still select the visible
 * text by hand — so this deliberately does not swallow the error and
 * report success.
 */
export async function copyText(value: string): Promise<void> {
  await Clipboard.setStringAsync(value);
}
