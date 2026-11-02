/**
 * Metro config — the resolver overrides no adapter can replace.
 *
 * Expo 55 needs no config to build native, and this project had none.
 * It has one now because of the web bundle (architecture M4a):
 * **native-only packages have no web implementation**, and without a
 * mapping the web bundle does not resolve at all. M0 spike 2 measured
 * it — `expo export --platform web` fails on the first one it reaches:
 *
 *   Importing native-only module "react-native/Libraries/Utilities/
 *   codegenNativeComponent" on web from react-native-pdf
 *
 * M4a mapped each one to a placeholder that threw when *called*,
 * never when loaded, so every screen still rendered and only a path
 * that genuinely needed a native package failed. M4b replaced them
 * with the §8 adapters one at a time, and **that list is now empty**:
 * every native-only package the app reaches has a `platform/<name>.ts`
 * with a `.web.ts` sibling, so Metro picks the web implementation by
 * extension and needs no help from here. `eslint.config.js` is what
 * keeps the package-name case from coming back: rule 4 is an error
 * there, so a native-only import outside `platform/` fails CI rather
 * than quietly needing a row in this file.
 *
 * Two overrides are left, and what they have in common is that both
 * reach *inside dependencies*, where neither an adapter nor a lint rule
 * on our own imports can get at them:
 *
 *   1. The `react-native/Libraries/` deep-import catch-all, web only.
 *   2. `@expo-google-fonts/material-symbols` → a stub, every platform.
 *      expo-router requires it transitively and the android export
 *      carried 6.7 MB of font for it. The whole argument, and the
 *      require chain, is in `src/platform/stubs/material-symbols.js`.
 *
 * So native resolution is no longer untouched — (2) applies there, and
 * android is the only platform that ever resolved the font.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const PLACEHOLDERS = path.resolve(__dirname, 'src/platform/web-placeholder');

/**
 * Every package M4a listed here now has an adapter, so there is no
 * package-name mapping left:
 *
 *   `expo-clipboard` → `src/platform/clipboard.ts`
 *   `expo-document-picker` → `src/platform/files.ts`
 *   `expo-speech` → `src/platform/speech.ts`
 *   `expo-share-intent` → `src/platform/shareIntent.ts`
 *   `expo-image-picker` → `src/platform/imagePicker.ts`
 *   `expo-notifications` → `src/platform/notifications.ts`
 *   `expo-file-system` → `src/platform/fileCache.ts` (plus `readBytes`
 *       on the `files` adapter)
 *   `expo-audio` → `src/platform/audio.ts`
 *   `react-native-pdf`, `react-native-webview` →
 *       `src/platform/readerHost.tsx`
 *   `react-native-purchases`, `react-native-purchases-ui` →
 *       `src/platform/billing.ts`
 *
 * `expo-haptics` and `expo-secure-store` were on the list and never
 * installed, so their entries mapped a specifier that never appears.
 * §8 keeps its rows for them as intent.
 */

/**
 * The font family Bookflow never draws. `expo-symbols` reaches the
 * barrel from `SymbolView`, `expo-router` reaches `expo-symbols` from
 * `withLayoutContext`, and the barrel eagerly requires all seven
 * weights — 6.7 MB of the android export, against an 8 MB bundle.
 *
 * Matched as the package and as a prefix, because the two importers
 * disagree: `SymbolView.js` names the root and
 * `android/weights/regular/index.js` names `/400Regular`. Catching one
 * and not the other would leave a weight behind.
 */
const MATERIAL_SYMBOLS = '@expo-google-fonts/material-symbols';
const MATERIAL_SYMBOLS_STUB = path.resolve(
  __dirname,
  'src/platform/stubs/material-symbols.js',
);

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  /**
   * Unconditional, unlike everything below it. Only android resolves
   * the font today — iOS and web take expo's own noop paths — but
   * Bookflow draws Tabler icons on every platform, so there is no
   * platform where this font is wanted, and a `platform === 'android'`
   * guard would quietly ship 6.7 MB the day that changes upstream.
   */
  if (
    moduleName === MATERIAL_SYMBOLS ||
    moduleName.startsWith(`${MATERIAL_SYMBOLS}/`)
  ) {
    return { type: 'sourceFile', filePath: MATERIAL_SYMBOLS_STUB };
  }

  if (platform === 'web') {
    /**
     * The catch-all the spike found necessary. These deep imports come
     * from *inside* dependencies — `react-native-pdf` reaching for
     * `react-native/Libraries/Utilities/codegenNativeComponent` — so
     * they cannot be caught by package name, and a dependency added
     * later would reintroduce the failure without it.
     *
     * On web `react-native` is `react-native-web`, which has no
     * `Libraries/` tree of its own, so nothing legitimate resolves
     * through here.
     */
    if (moduleName.startsWith('react-native/Libraries/')) {
      return {
        type: 'sourceFile',
        filePath: path.join(PLACEHOLDERS, 'placeholder.js'),
      };
    }
  }

  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
