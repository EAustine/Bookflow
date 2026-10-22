// M0 spike 2 stub — expo-clipboard
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// navigator.clipboard is the real web path. §8 had no clipboard row
// until Phase 0 added one; this is the most-used native-only package in
// the app at four call sites.
export const setStringAsync = async (s) => {
  if (navigator.clipboard) { await navigator.clipboard.writeText(s); return true; }
  return false;
};
export const getStringAsync = async () =>
  (navigator.clipboard ? navigator.clipboard.readText() : '');
export default {};
