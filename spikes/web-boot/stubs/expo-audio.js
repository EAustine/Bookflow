// M0 spike 2 stub — expo-audio
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// §8: web audio is HTMLAudioElement + Media Session.
export const createAudioPlayer = () => {
  throw new Error('[stub] expo-audio on web — §8 audio adapter uses HTMLAudioElement');
};
export const useAudioPlayer = () => { throw new Error('[stub] useAudioPlayer on web'); };
export const useAudioPlayerStatus = () => ({ playing: false, currentTime: 0, duration: 0 });
export const setAudioModeAsync = async () => {};
export const setIsAudioActiveAsync = async () => {};
export const AudioModule = {};
export default {};
