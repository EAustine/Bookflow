/**
 * The app's on-disk store on web — not implemented yet, and honest
 * about it. See `fileCache.ts` for the contract.
 *
 * §8's web implementation for this row is the Cache API or IndexedDB,
 * and that is real work: an origin-private store, a quota the browser
 * can evict from without asking, and object URLs minted and released
 * around playback. It belongs to whichever milestone brings offline
 * reading and listening to web, not to M4, whose job is to get every
 * native-only import behind an adapter so the bundle resolves.
 *
 * So this reports "nothing stored" rather than throwing. The whole
 * download feature already has to handle a device with nothing cached
 * — that is its first-run state — so web lands on paths the app
 * already has: Downloads shows 0 B, playback takes the streaming URL,
 * and the reader's offline fallback finds no cached pages and fetches.
 *
 * `download` and `writeText` are the two that cannot pretend. They
 * reject, because silently accepting a write and storing nothing would
 * tell the user their book is available offline when it is not — a
 * promise the product would then break on a train. The download
 * orchestrator surfaces a failure, which is the truth.
 *
 * Everything here changes when the real implementation lands; nothing
 * that calls it has to.
 */

const UNSUPPORTED =
  'Offline storage is not available in the browser yet. ' +
  'Downloads work in the Bookflow app.';

export const ensureDir: typeof import('./fileCache').ensureDir = async () => {};

export const exists: typeof import('./fileCache').exists = async () => false;

export const uriFor: typeof import('./fileCache').uriFor = async () => null;

export const sizeOf: typeof import('./fileCache').sizeOf = async () => 0;

export const readText: typeof import('./fileCache').readText = async () => null;

export const readTextAt: typeof import('./fileCache').readTextAt = async () =>
  null;

export const writeText: typeof import('./fileCache').writeText = async () => {
  throw new Error(UNSUPPORTED);
};

export const download: typeof import('./fileCache').download = async () => {
  throw new Error(UNSUPPORTED);
};

export const remove: typeof import('./fileCache').remove = async () => {};
