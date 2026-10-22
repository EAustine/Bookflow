/**
 * Relative imports carry `.js` extensions: tsc with `module: preserve`
 * emits them verbatim, and Node ESM refuses extensionless specifiers.
 * Metro and bundlers accept them, so this costs nothing on the app side.
 *
 * @bookflow/tokens — the single source for design tokens (§11).
 *
 * `tokens.ts` moved here from `apps/app/src/design/tokens.ts` byte for
 * byte in M1. `apps/app/src/design/tokens.ts` is now a re-export, so the
 * 59 files importing `~/design/tokens` are untouched and M1 can claim
 * zero visual change honestly.
 */
export * from './tokens.js';
export * from './breakpoints.js';
