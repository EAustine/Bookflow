/**
 * Clipboard on web — `navigator.clipboard` (§8). See `clipboard.ts`
 * for the native side and why the surface is one function.
 *
 * Two constraints native never makes you think about:
 *
 * 1. **Secure context.** The Async Clipboard API is absent outside
 *    https (and localhost), so `navigator.clipboard` can be
 *    `undefined` rather than merely failing. Reading `.writeText` off
 *    it would then throw a TypeError whose message says nothing useful
 *    in a console, hence the explicit check.
 * 2. **User gesture.** The browser only honours a write during one.
 *    Every call site is already a tap handler, so this holds today —
 *    but a future caller that copies on a timer or on mount will be
 *    rejected here and work fine on native, which is exactly the kind
 *    of divergence worth having written down.
 *
 * Both surface as a rejected promise, which is the same contract the
 * native side has and what all four callers already catch.
 *
 * The signature is annotated against the native module's own so tsc
 * checks the two sides agree; nothing else compares them, and
 * `import type` erases, so naming `./clipboard` here costs the web
 * bundle nothing.
 */

export const copyText: typeof import('./clipboard').copyText = async (value) => {
  if (!navigator.clipboard) {
    throw new Error(
      'Clipboard unavailable: the Async Clipboard API needs a secure context (https or localhost).',
    );
  }
  await navigator.clipboard.writeText(value);
};
