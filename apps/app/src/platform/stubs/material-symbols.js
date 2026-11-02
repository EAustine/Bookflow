/**
 * A stub for `@expo-google-fonts/material-symbols`, which Bookflow does
 * not use and which nothing in `apps/app` or `packages/` names.
 *
 * `metro.config.js` resolves that package, and every subpath of it,
 * to this file on every platform.
 *
 * ## Why a dependency's font is ours to delete
 *
 * This is the M4c problem one level down — an eager barrel require
 * pulling a whole family in for nothing — except the barrel is inside a
 * dependency, so the fix `useAppFonts.ts` uses (name the one weight by
 * subpath) is not available here. The chain, unconditional at every
 * step:
 *
 *   expo-router/build/exports.js
 *     -> layouts/withLayoutContext.js
 *     -> native-tabs/NativeTabTrigger.js
 *     -> native-tabs/utils/materialIconConverter.android.js
 *     -> expo-symbols  (build/index.js)
 *     -> build/SymbolView.js, whose first line is
 *        `import { useFonts } from '@expo-google-fonts/material-symbols'`
 *     -> the barrel, which eagerly requires all SEVEN weights.
 *
 * `withLayoutContext` is reached from expo-router's main entry, so this
 * is not a dev-only screen the app happens never to visit — importing
 * `expo-router` at all is enough, and every route does. The android
 * export carried all seven faces, 954-983 KB each, 6.7 MB in total,
 * next to an 8 MB bundle.
 *
 * Only android. `utils.ios.ts` and `materialImageSource.ios.ts` are
 * noops expo wrote "to improve tree shaking", and the non-android
 * `materialIconConverter.js` does not import expo-symbols at all, so
 * iOS and web never resolve the font. That is why the web payload
 * budget stayed green while 6.7 MB shipped to Ama's Android phone.
 *
 * ## Why removing it breaks nothing
 *
 * The two things that reach this module cannot run:
 *
 *   - `SymbolView` draws Material glyphs as text. Bookflow's icons are
 *     Tabler, through `~/components/Icon`, and nothing imports
 *     `expo-symbols`.
 *   - `unstable_getMaterialSymbolSourceAsync` is called only from the
 *     `loader` of a `NativeTabsTriggerPromiseIcon`, which expo-router
 *     constructs only for a `<NativeTabs.Trigger md="...">`. Bookflow
 *     has no NativeTabs; `app/(tabs)/_layout.tsx` is a `<Slot>` inside
 *     SignedInShell.
 *
 * ## Why nothing here throws on the way in
 *
 * Both consumers READ a property of this module at load time:
 * `expo-symbols/build/android/weights/regular/index.js` puts
 * `MaterialSymbols_400Regular` in an object field, and `SymbolView.js`
 * imports `useFonts`. So every name the real barrel exports has to
 * exist here, and reading one must not throw — the same rule
 * `web-placeholder/placeholder.js` follows, for the same reason: a stub
 * that throws on import is the original failure with a nicer message.
 *
 * `useFonts` throws when CALLED, because a call means something really
 * does want Material Symbols, and the honest answer then is that the
 * font is not in the bundle rather than a silently blank glyph.
 */

// The seven the barrel exports. Each is a `require()` of one .ttf in
// the real package; here each is read into a field and never used.
// `null` and not a thrower, because a field cannot throw on read and a
// function sitting in it would only look callable to the next reader.
const WEIGHTS = [
  'MaterialSymbols_100Thin',
  'MaterialSymbols_200ExtraLight',
  'MaterialSymbols_300Light',
  'MaterialSymbols_400Regular',
  'MaterialSymbols_500Medium',
  'MaterialSymbols_600SemiBold',
  'MaterialSymbols_700Bold',
];

const stub = {
  // Metro and Babel read this to decide how to shape the import.
  __esModule: true,
  // `export { default as __metadata__ } from './metadata.json'`.
  __metadata__: {},
  useFonts() {
    throw new Error(
      '@expo-google-fonts/material-symbols is stubbed out of the bundle. ' +
        'Nothing in Bookflow uses Material Symbols, and expo-router pulls ' +
        'the barrel in through expo-symbols, which cost 6.7 MB of the ' +
        'android export for an icon set the app never draws. If a screen ' +
        'now genuinely needs one, drop the mapping in metro.config.js and ' +
        'import the single weight by subpath, as useAppFonts.ts does.',
    );
  },
};

for (const name of WEIGHTS) {
  stub[name] = null;
}

module.exports = stub;
