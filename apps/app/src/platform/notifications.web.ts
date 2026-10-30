/**
 * Local notifications on web — nothing, which is §8's web
 * implementation for this row.
 *
 * Deliberately not the Notifications API. A browser notification needs
 * a permission prompt the moment it is asked for, and every feature
 * behind this adapter is a *scheduled* one — a daily reading reminder,
 * a streak warning an hour later — which a page that is not running
 * cannot deliver. Doing it properly means a service worker and the
 * Push API, and prompting for a permission whose promise we could not
 * keep is worse than not prompting.
 *
 * So `isAvailable()` is false, and the app's existing "this platform
 * cannot notify" branches carry web for free: the Settings toggle
 * still renders, it just explains itself rather than scheduling
 * something that will never fire. That is the same path a dev-client
 * build without the native plugin already takes.
 *
 * `getPermissionStatus` answers `undetermined` rather than `denied`
 * for the same reason it does on native when the module is missing —
 * `denied` would be the app claiming the user refused something they
 * were never asked.
 */

export const isAvailable: typeof import('./notifications').isAvailable = () =>
  false;

export const setForegroundPresentation: typeof import('./notifications').setForegroundPresentation =
  () => {};

export const getPermissionStatus: typeof import('./notifications').getPermissionStatus =
  async () => 'undetermined';

export const requestPermission: typeof import('./notifications').requestPermission =
  async () => 'undetermined';

export const onNotificationTapped: typeof import('./notifications').onNotificationTapped =
  () => () => {};

export const scheduleDaily: typeof import('./notifications').scheduleDaily =
  async () => false;

export const showNow: typeof import('./notifications').showNow = async () => {};

export const cancel: typeof import('./notifications').cancel = async () => {};
