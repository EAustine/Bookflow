/**
 * withAndroidSplashIcon — make the Android 12+ splash use the Bookflow
 * logomark instead of the launcher icon.
 *
 * Why this exists
 * ---------------
 * `app.json` configures the splash through the legacy top-level `splash`
 * key. Expo's prebuild treats that as a legacy config and emits a
 * `Theme.App.SplashScreen` that sets only `android:windowBackground`. On
 * Android 12+ the system splash therefore falls back to the **launcher
 * icon**, and the `splashscreen_logo` drawables that prebuild generates
 * from `assets/splash-icon.png` ship in the APK unused. (F-42.)
 *
 * This adds the platform attributes the legacy path leaves out. They are
 * the `android:`-prefixed ones rather than the androidx compat names,
 * because the generated theme inherits from `AppTheme`, not from
 * `Theme.SplashScreen` — the compat attributes would be ignored.
 *
 * `android/` is gitignored and regenerated, so this has to be a config
 * plugin: editing the generated styles.xml by hand would be wiped by the
 * next `expo prebuild`.
 */
const { withAndroidStyles } = require('@expo/config-plugins');

const SPLASH_THEME = 'Theme.App.SplashScreen';

/** Replace an item if present, otherwise append it. */
function upsert(items, name, value) {
  const existing = items.find((i) => i.$ && i.$.name === name);
  if (existing) existing._ = value;
  else items.push({ $: { name }, _: value });
}

module.exports = function withAndroidSplashIcon(config) {
  return withAndroidStyles(config, (cfg) => {
    const styles = cfg.modResults.resources.style || [];
    const theme = styles.find((s) => s.$ && s.$.name === SPLASH_THEME);
    if (!theme) {
      throw new Error(
        `withAndroidSplashIcon: no <style name="${SPLASH_THEME}"> in styles.xml. ` +
          'Expo normally generates it from the splash config in app.json.',
      );
    }
    theme.item = theme.item || [];

    // The icon itself — the drawable prebuild generates from
    // assets/splash-icon.png, which was unused until now.
    upsert(theme.item, 'android:windowSplashScreenAnimatedIcon', '@drawable/splashscreen_logo');
    // Keep the cream field behind it rather than inheriting a system colour.
    upsert(theme.item, 'android:windowSplashScreenBackground', '@color/splashscreen_background');
    // Show the icon even when the system would otherwise skip it.
    upsert(theme.item, 'android:windowSplashScreenBehavior', 'icon_preferred');

    return cfg;
  });
};
