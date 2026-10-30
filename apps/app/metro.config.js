/**
 * Metro config — exists for the web bundle (architecture M4a).
 *
 * Expo 55 needs no config to build native, and this project had none.
 * It has one now for a single reason: **native-only packages have no
 * web implementation**, and without a mapping the web bundle does not
 * resolve at all. M0 spike 2 measured it — `expo export --platform web`
 * fails on the first one it reaches:
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
 * extension and needs no help from here.
 *
 * What remains is the deep-import catch-all below, which cannot be
 * solved by an adapter because the imports come from inside
 * dependencies. `eslint.config.js` is what now keeps the package-name
 * case from coming back: rule 4 is an error there, so a native-only
 * import outside `platform/` fails CI rather than quietly needing a
 * row in this file.
 *
 * Native resolution is untouched: the override only fires for
 * `platform === 'web'`.
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

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
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
