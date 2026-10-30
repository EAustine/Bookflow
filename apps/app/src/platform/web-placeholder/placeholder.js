/**
 * Web placeholders for native-only packages — architecture M4a.
 *
 * `metro.config.js` resolves each native-only package to one of these
 * on web, so the bundle resolves at all. M0 spike 2 proved this is the
 * whole of blocker 1; M4b replaces each with a real `.web.ts` adapter
 * from §8 and deletes the file beside it.
 *
 * **They throw when called, never when loaded.** A placeholder that
 * throws on import is just the blocker again with a nicer message —
 * the point is that every screen still renders, and only a path that
 * genuinely reaches a native package fails, loudly, at the moment it
 * does. So this is a Proxy: reading a property hands back a function,
 * and the function is what throws.
 *
 * That also covers components. `import Pdf from 'react-native-pdf'`
 * gets a function, which is a valid React component that throws when
 * React renders it — a call, not a load.
 */

function placeholder(pkg) {
  const cache = new Map();

  const thrower = (prop) => {
    const key = String(prop);
    if (!cache.has(key)) {
      const fn = function webPlaceholder() {
        throw new Error(
          `${pkg}.${key}() is native-only and has no web adapter yet. ` +
            'Architecture M4b replaces this placeholder with the §8 adapter. ' +
            'If you reached this from a screen that should work on web, that ' +
            'screen needs the adapter before the placeholder does.',
        );
      };
      // Named, so a stack says which package rather than "anonymous".
      Object.defineProperty(fn, 'name', { value: `${pkg}.${key}` });
      cache.set(key, fn);
    }
    return cache.get(key);
  };

  const handler = {
    get(_target, prop) {
      // Interop: Metro and Babel read these to decide how to import.
      // Answering keeps `import X from` and `import { X } from` both
      // working, and neither counts as a call.
      if (prop === '__esModule') return true;
      if (prop === 'default') return proxy;
      if (typeof prop === 'symbol') return undefined;
      return thrower(prop);
    },
    // A default-imported component is called; a class placeholder might
    // be constructed. Make both equally loud.
    apply: (_t, _this, args) => thrower('default').apply(null, args),
    construct: (_t, args) => thrower('default').apply(null, args),
  };

  const proxy = new Proxy(function () {}, handler);
  return proxy;
}

module.exports = placeholder;
