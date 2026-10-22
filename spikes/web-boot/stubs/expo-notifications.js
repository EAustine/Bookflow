// M0 spike 2 stub — expo-notifications
//
// Throwaway. Enough surface for the web bundle to resolve and the app to
// boot; every call throws or no-ops loudly so a web code path that really
// needs this package shows up as a runtime error rather than silence.
// The real answer is a §8 adapter with a working .web.ts.


// Web notifications exist, but through a different API and with a
// service worker. §8 lists this as a launch no-op.
const noop = async () => ({ status: 'denied', granted: false });
export const getPermissionsAsync = noop;
export const requestPermissionsAsync = noop;
export const scheduleNotificationAsync = async () => null;
export const cancelScheduledNotificationAsync = async () => {};
export const cancelAllScheduledNotificationsAsync = async () => {};
export const getAllScheduledNotificationsAsync = async () => [];
export const setNotificationHandler = () => {};
export const addNotificationReceivedListener = () => ({ remove() {} });
export const addNotificationResponseReceivedListener = () => ({ remove() {} });
export const setNotificationChannelAsync = async () => null;
export const AndroidImportance = { DEFAULT: 3, HIGH: 4 };
export const SchedulableTriggerInputTypes = { DAILY: 'daily', DATE: 'date' };
export default {};
