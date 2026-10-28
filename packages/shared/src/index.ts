/**
 * These packages emit CommonJS. Metro reads the TypeScript source
 * directly (via the `./src` export), and Node reads `dist/`; extensionless
 * relative imports resolve in both. ESM output was tried first and does
 * not: tsc emits the specifier verbatim, so `./format.js` would have to
 * be written in source, and Metro then looks for a literal format.js
 * that does not exist.
 *
 * @bookflow/shared — types and pure logic shared by the app, the reader
 * engine and the edge functions (§4).
 *
 * Nothing here may import React, React Native, or any platform package.
 * The import-boundary lint rule enforces that.
 */
export * from './format';
export * from './playback';
export * from './offline-queue';
export * from './pageDisplay';
export * from './readerPosition';
export type * from './database';
