// §8: notifications are a no-op on web at launch. `SignedInShell` calls
// `installNotificationHandler()` at module evaluation time, so a
// throwing placeholder here blanks the page before any screen mounts.
module.exports = require('./noop')('expo-notifications', {
  // Permission reads are awaited and destructured, so they need a shape.
  getPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  requestPermissionsAsync: async () => ({ status: 'denied', granted: false, canAskAgain: false }),
  getExpoPushTokenAsync: async () => ({ data: '' }),
  addNotificationReceivedListener: () => ({ remove() {} }),
  addNotificationResponseReceivedListener: () => ({ remove() {} }),
  scheduleNotificationAsync: async () => '',
  cancelAllScheduledNotificationsAsync: async () => undefined,
  getAllScheduledNotificationsAsync: async () => [],
});
