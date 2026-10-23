/**
 * Boot route.
 *
 * Renders nothing. The root layout holds the splash over the whole tree
 * until session restore answers, then `router.replace()`s to the real
 * destination. This file exists because Expo Router needs an `index`
 * for `/`, not because anything should be seen here.
 */
export default function Index() {
  return null;
}
