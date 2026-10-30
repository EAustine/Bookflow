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
 * Each package resolves to a placeholder that throws when *called*,
 * never when loaded, so every screen still renders and only a path
 * that genuinely needs a native package fails. M4b replaces them one
 * at a time with the §8 adapters, and this list shrinks to nothing.
 *
 * Native resolution is untouched: the override only fires for
 * `platform === 'web'`.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const PLACEHOLDERS = path.resolve(__dirname, 'src/platform/web-placeholder');

/**
 * What is left of the §8 adapter list, plus the two the lint rule has
 * never had a row for: `react-native-webview` (named in §8's
 * reader-host prose but missing from that list) and
 * `react-native-purchases-ui` (arrived after the spike, with the
 * hosted paywall). Keep this in step with `NATIVE_ONLY` in
 * `eslint.config.js`.
 *
 * Migrated to a real adapter so far, and therefore absent below:
 * `expo-clipboard` → `src/platform/clipboard.ts`,
 * `expo-document-picker` → `src/platform/files.ts`,
 * `expo-speech` → `src/platform/speech.ts`,
 * `expo-share-intent` → `src/platform/shareIntent.ts`,
 * `expo-image-picker` → `src/platform/imagePicker.ts`,
 * `expo-notifications` → `src/platform/notifications.ts`,
 * `expo-file-system` → `src/platform/fileCache.ts` (plus `readBytes`
 * on the `files` adapter),
 * `expo-audio` → `src/platform/audio.ts`,
 * `react-native-pdf` and `react-native-webview` →
 * `src/platform/readerHost.tsx`.
 *
 * `expo-haptics` and `expo-secure-store` left without an adapter:
 * neither is a declared dependency and nothing imports either, so
 * their entries mapped a specifier that never appears. §8 keeps its
 * rows for them as intent; this list is for packages the code
 * actually reaches.
 */
const NATIVE_ONLY = new Set([
  'react-native-purchases',
  'react-native-purchases-ui',
]);

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (NATIVE_ONLY.has(moduleName)) {
      return {
        type: 'sourceFile',
        filePath: path.join(PLACEHOLDERS, `${moduleName}.js`),
      };
    }

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
