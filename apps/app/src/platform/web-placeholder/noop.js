/**
 * No-op web placeholders — architecture M4a.
 *
 * The sibling `placeholder.js` throws when called, which is right for
 * a package that owes web a real adapter. **These three do not owe web
 * anything**: §8 gives `notifications`, `shareIntent` and `haptics` the
 * web implementation "no-op at launch", so doing nothing *is* the
 * adapter, and throwing would be wrong rather than loud.
 *
 * It is also the difference between a page that loads and one that
 * does not. `SignedInShell` calls `installNotificationHandler()` at
 * module evaluation time — deliberately, so the handler is in place
 * before a notification can arrive during cold start — and
 * `useShareIntent()` runs during the shell's first render. A throwing
 * placeholder in either spot kills the bundle before any screen
 * mounts, which is the blocker again wearing a better error message.
 *
 * Where a caller destructures the result, the shape has to be real;
 * `overrides` is for those.
 */

function noop(pkg, overrides = {}) {
  const cache = new Map();

  const nothing = (prop) => {
    const key = String(prop);
    if (!cache.has(key)) {
      const fn = function webNoop() {
        return undefined;
      };
      Object.defineProperty(fn, 'name', { value: `${pkg}.${key}` });
      cache.set(key, fn);
    }
    return cache.get(key);
  };

  const handler = {
    get(_target, prop) {
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (typeof prop === 'symbol') return undefined;
      if (Object.prototype.hasOwnProperty.call(overrides, prop)) {
        return overrides[prop];
      }
      return nothing(prop);
    },
    apply: () => undefined,
    construct: () => ({}),
  };

  const proxy = new Proxy(function () {}, handler);
  return proxy;
}

module.exports = noop;
