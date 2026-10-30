/**
 * Share intent on web — nothing, which is §8's web implementation for
 * this row and not a shortfall: a browser tab is not a share target,
 * and the Web Share Target API needs an installed PWA with a manifest
 * declaring it. If that ever ships, this file is where it lands.
 *
 * Doing nothing still has to be done carefully. The hook runs during
 * the shell's first render and the caller drives an effect from its
 * result, so both values have to be stable across renders — a fresh
 * `[]` or a fresh closure each time would re-run that effect forever.
 * Module constants rather than `useMemo`, because there is nothing to
 * recompute.
 */

import type { SharedFile } from './shareIntent';

const NONE: SharedFile[] = [];
const clear = () => {};

export const useSharedFiles: typeof import('./shareIntent').useSharedFiles =
  () => ({ files: NONE, clear });
