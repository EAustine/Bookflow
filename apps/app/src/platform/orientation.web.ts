/**
 * Web has no orientation lock to apply — a browser window is whatever
 * size the user makes it, and §1 of the responsive brief lets web rotate
 * freely anyway. See `orientation.ts` for the native policy.
 */
export async function applyOrientationPolicy(): Promise<void> {
  // Intentionally empty.
}
