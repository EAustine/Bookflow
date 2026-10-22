// M0 spike 2 stub — expo-speech
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// window.speechSynthesis is the real web path.
export const speak = () => {};
export const stop = async () => {};
export const isSpeakingAsync = async () => false;
export const getAvailableVoicesAsync = async () => [];
export default {};
