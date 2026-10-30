// §8: share intent is a no-op on web at launch. `useShareIntent()` runs
// during the shell's first render and its result is destructured, so
// the shape has to be real even though the behaviour is nothing.
module.exports = require('./noop')('expo-share-intent', {
  useShareIntent: () => ({
    hasShareIntent: false,
    shareIntent: { files: [], text: null, webUrl: null, type: null },
    resetShareIntent: () => {},
    error: null,
  }),
});
