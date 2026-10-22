/**
 * These packages emit CommonJS. Metro reads the TypeScript source
 * directly (via the `./src` export), and Node reads `dist/`; extensionless
 * relative imports resolve in both. ESM output was tried first and does
 * not: tsc emits the specifier verbatim, so `./format.js` would have to
 * be written in source, and Metro then looks for a literal format.js
 * that does not exist.
 *
 * @bookflow/tokens — the single source for design tokens (§11).
 *
 * `tokens.ts` moved here from `apps/app/src/design/tokens.ts` byte for
 * byte in M1. `apps/app/src/design/tokens.ts` is now a re-export, so the
 * 59 files importing `~/design/tokens` are untouched and M1 can claim
 * zero visual change honestly.
 */
export * from './tokens';
export * from './breakpoints';
