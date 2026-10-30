/**
 * Local notifications — the §8 adapter over `expo-notifications`.
 *
 * The app logic that uses this — permission hook, daily reminder,
 * streak warning, book-ready and download-complete nudges — stays in
 * `~/lib/notifications`. What moved here is the part that touches the
 * package: seven operations, and the defensive load below.
 *
 * ## Why the load is a `require` in a try/catch
 *
 * The package's JS wrapper registers native modules at require time,
 * so a dev-client build without the plugin red-screens before any
 * code in the importing file runs. Catching it lets the bundle finish
 * loading and turns "this build cannot notify" into `isAvailable()`
 * returning false, which every caller already branches on. Once the
 * plugin is in every active dev client and production build this can
 * become a plain import.
 *
 * That failure mode and web's are the same shape from the app's point
 * of view — the platform cannot deliver a notification — which is why
 * `notifications.web.ts` is simply the permanent version of it, and
 * why §8 can call web's implementation "no-op at launch" without the
 * app needing a second code path.
 *
 * ## Why not re-export the package
 *
 * Every content object the app builds is `{ title, body, sound: true }`
 * with an optional `data`, and every trigger is either daily-at-a-time
 * or immediate. The surface below is those two facts, so the web side
 * has something it can actually honour.
 */

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule = require('expo-notifications') as NotificationsModule;
} catch (err) {
  console.warn(
    '[notifications] expo-notifications native module unavailable — ' +
      'local notifications will no-op until the next native build:',
    err,
  );
  notificationsModule = null;
}

/**
 * Three states, because that is what the UI distinguishes: schedule,
 * show the "open Settings" CTA, or ask. Declared here rather than
 * taken from the package — SDK 55's re-exports do not make
 * `PermissionStatus` reachable, and the shape is three strings.
 */
export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type NotificationContent = {
  title: string;
  body: string;
  /** Delivered back when the user taps the notification. */
  data?: Record<string, unknown>;
};

/** Whether this platform and build can deliver a local notification. */
export function isAvailable(): boolean {
  return notificationsModule !== null;
}

/**
 * How a notification behaves while the app is in the foreground.
 * Called once at module evaluation time by the shell, so the handler
 * is in place before one can arrive during cold start.
 */
export function setForegroundPresentation(): void {
  notificationsModule?.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * The OS's current answer. `undetermined` doubles as the answer when
 * the platform cannot tell us, which keeps the permission UI showing
 * its CTA rather than sitting on an unresolved state forever.
 */
export async function getPermissionStatus(): Promise<PermissionStatus> {
  if (!notificationsModule) return 'undetermined';
  try {
    const permission = await notificationsModule.getPermissionsAsync();
    return (permission as unknown as { status: PermissionStatus }).status;
  } catch {
    return 'undetermined';
  }
}

export async function requestPermission(): Promise<PermissionStatus> {
  if (!notificationsModule) return 'undetermined';
  const result = await notificationsModule.requestPermissionsAsync({
    // No badge: Bookflow has no unread count to put on the icon, and
    // asking for a permission you will not use is a worse prompt.
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return (result as unknown as { status: PermissionStatus }).status;
}

/**
 * Run `callback` when the user taps a notification. Returns the
 * unsubscribe. Used to re-read permission state, since a tap brings
 * the app forward and the user may have changed it in Settings.
 */
export function onNotificationTapped(callback: () => void): () => void {
  if (!notificationsModule) return () => {};
  const subscription =
    notificationsModule.addNotificationResponseReceivedListener(() =>
      callback(),
    );
  return () => subscription.remove();
}

/**
 * Schedule `content` to repeat every day at `hour:minute`, replacing
 * any previous notification with the same `id`.
 *
 * Hour and minute are clamped rather than validated: a caller deriving
 * a time by arithmetic (the streak warning adds an hour) should get a
 * late-evening notification, not a thrown error.
 */
export async function scheduleDaily(options: {
  id: string;
  content: NotificationContent;
  hour: number;
  minute: number;
}): Promise<boolean> {
  if (!notificationsModule) return false;
  try {
    await cancel(options.id);
    await notificationsModule.scheduleNotificationAsync({
      identifier: options.id,
      content: {
        title: options.content.title,
        body: options.content.body,
        data: options.content.data,
        // The default OS sound. iOS rejects custom sounds without a
        // bundled aiff, which is not worth the build complexity here.
        sound: true,
      },
      trigger: {
        type: notificationsModule.SchedulableTriggerInputTypes.DAILY,
        hour: Math.max(0, Math.min(23, Math.floor(options.hour))),
        minute: Math.max(0, Math.min(59, Math.floor(options.minute))),
      },
    });
    return true;
  } catch (err) {
    console.warn('[notifications] daily schedule failed:', err);
    return false;
  }
}

/** Deliver `content` now, with no identifier to cancel later. */
export async function showNow(content: NotificationContent): Promise<void> {
  if (!notificationsModule) return;
  try {
    await notificationsModule.scheduleNotificationAsync({
      content: {
        title: content.title,
        body: content.body,
        data: content.data,
        sound: true,
      },
      // Null trigger fires immediately.
      trigger: null,
    });
  } catch (err) {
    console.warn('[notifications] immediate notification failed:', err);
  }
}

/**
 * Cancel a scheduled notification by id. Silent when nothing is
 * scheduled: the package throws on an unknown identifier, and every
 * caller means "make sure this is not scheduled".
 */
export async function cancel(id: string): Promise<void> {
  if (!notificationsModule) return;
  try {
    await notificationsModule.cancelScheduledNotificationAsync(id);
  } catch {
    // Not scheduled; nothing to do.
  }
}
