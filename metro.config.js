// M0 spike 2 — web boot.
//
// Throwaway: this file exists to find out what stops the app bundling for
// web, not to be the permanent answer. The real fix is §8's platform
// adapters, where each native-only package is reached through an
// interface with a .native.ts and a .web.ts. This maps them to stubs in
// one place so the blockers surface one run at a time, and so the list
// of what M4 actually has to adapt is written down rather than guessed.
//
// Delete this with the rest of the spike.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Packages that have no web implementation. Each one is a real adapter in
// §8 — except expo-clipboard, which §8 was missing until Phase 0.
const WEB_STUBS = {
  'react-native-pdf': 'react-native-pdf.js',
  'react-native-purchases': 'react-native-purchases.js',
  'expo-share-intent': 'expo-share-intent.js',
  'expo-notifications': 'expo-notifications.js',
  'expo-document-picker': 'expo-document-picker.js',
  'expo-image-picker': 'expo-image-picker.js',
  'expo-file-system': 'expo-file-system.js',
  'expo-speech': 'expo-speech.js',
  'expo-audio': 'expo-audio.js',
  'expo-clipboard': 'expo-clipboard.js',
};

const STUB_DIR = path.resolve(__dirname, 'spikes/web-boot/stubs');

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    const stub = WEB_STUBS[moduleName];
    if (stub) {
      return { type: 'sourceFile', filePath: path.join(STUB_DIR, stub) };
    }
    // Some packages reach into RN internals that simply do not exist in
    // react-native-web. Catch them by path rather than by package name,
    // because the import comes from inside the dependency.
    if (moduleName.startsWith('react-native/Libraries/')) {
      return { type: 'sourceFile', filePath: path.join(STUB_DIR, 'rn-internal.js') };
    }
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
