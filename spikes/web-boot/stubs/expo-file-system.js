// M0 spike 2 stub — expo-file-system
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// Web equivalent is the Cache API / IndexedDB (§8 fileCache).
export const documentDirectory = null;
export const cacheDirectory = null;
export const getInfoAsync = async () => ({ exists: false, isDirectory: false });
export const makeDirectoryAsync = async () => {};
export const readAsStringAsync = async () => '';
export const writeAsStringAsync = async () => {};
export const deleteAsync = async () => {};
export const downloadAsync = async () => ({ uri: '', status: 404 });
export const createDownloadResumable = () => ({ downloadAsync: async () => null, pauseAsync: async () => {}, resumeAsync: async () => null });
export const readDirectoryAsync = async () => [];
export const copyAsync = async () => {};
export const moveAsync = async () => {};
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };
export default {};
