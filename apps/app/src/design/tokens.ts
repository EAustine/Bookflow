/**
 * Re-export of @bookflow/tokens.
 *
 * The tokens themselves moved to `packages/tokens/src/tokens.ts` in M1,
 * byte for byte. This file stays so the 59 modules importing
 * `~/design/tokens` keep working and M1 can claim zero visual change
 * without touching 59 files to prove it.
 *
 * Rewriting those imports to `@bookflow/tokens` is a later, separate
 * change — mechanical, reviewable on its own, and not worth entangling
 * with a monorepo conversion.
 */
export * from '@bookflow/tokens/src';
