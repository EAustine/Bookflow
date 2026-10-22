// M0 spike 2 stub — react-native/Libraries/* internals
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// Packages that reach into RN internals cannot work on web at all. This
// resolves the import so bundling proceeds; touching it throws.
module.exports = new Proxy({}, {
  get(_t, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return () => null;
    throw new Error(`[stub] react-native internal "${String(prop)}" is not available on web`);
  },
});
