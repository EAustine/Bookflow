// M0 spike 2 stub — expo-document-picker
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// Real web implementation is an <input type="file"> plus drag-and-drop.
export const getDocumentAsync = async () => ({ canceled: true, assets: null });
export default {};
