/**
 * notifications.ts — local-notification plumbing for Bookflow.
 *
 * What's here:
 *   - OS permission flow + a hook the UI can subscribe to
 *   - Scheduled daily reading reminder (per-user time)
 *   - Lifecycle helper (`useDailyReminderSync`) that keeps the OS
 *     schedule in sync with the user's toggle + the OS permission
 *     state — drop it in once at the app root and the right thing
 *     happens whenever either side changes
 *
 * Out of scope (yet):
 *   - Remote push (would need an APNs/FCM-backed server)
 *   - Streak-warning and book-finished local notifications — those
 *     ship in task #88 alongside the conditional fire logic
 *
 * Permission model: we DON'T auto-prompt on app start. The OS
 * permission request only fires when the user toggles ON in
 * Settings → Notifications. If they decline, the toggle reverts and
 * a "Open Settings" CTA appears so they can grant later. This
 * matches the App Store / Play Store expected pattern (don't
 * permission-blast users).
 */

import { useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import {
  cancel,
  getPermissionStatus,
  isAvailable,
  onNotificationTapped,
  requestPermission,
  scheduleDaily,
  setForegroundPresentation,
  showNow,
  type PermissionStatus,
} from '~/platform/notifications';
import { useReaderStore } from '~/stores/readerStore';

/**
 * Everything that touches `expo-notifications` lives in
 * `~/platform/notifications` (§8), including the defensive load that
 * keeps a dev-client build without the plugin from red-screening. What
 * is left here is the app's own logic, and `isAvailable()` is how it
 * asks whether this platform can deliver anything — false on web, and
 * false in a build missing the native module, which are the same
 * answer as far as the UI is concerned.
 *
 * `null` status means "haven't read the OS yet", which is distinct
 * from `undetermined` so the toggle waits rather than flashes.
 */
type PermissionStatusValue = PermissionStatus;

/**
 * Stable identifier for the daily reading reminder so cancel /
 * reschedule operations can find it without listing every scheduled
 * notification first. The platform lets us pin an identifier
 * at schedule time — see scheduleDailyReadingReminder below.
 */
const DAILY_REMINDER_ID = 'bookflow:daily-reading-reminder';

/**
 * In-foreground display behaviour for notifications fired while the
 * user has Bookflow open. We surface them as an alert + sound so the
 * reading reminder ("pick back up where you left off") and book-
 * finished notifications still register even when the user happens
 * to be using the app. Quiet badge-only would be too easy to miss.
 *
 * Call once at module load (`SignedInShell` imports this module's
 * `installNotificationHandler` and calls it at module evaluation time).
 */
let handlerInstalled = false;
export function installNotificationHandler(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  setForegroundPresentation();
}

// ─── Permission hook ────────────────────────────────────────────────────────

export type PermissionState = {
  /** Current OS permission status. `null` until the first read returns. */
  status: PermissionStatusValue | null;
  /**
   * Request OS permission. Returns whether it was granted after the
   * prompt. On iOS / Android 13+ this is the system dialog; on older
   * Android the install grants by default and this resolves true
   * immediately. Safe to call when status is already 'granted' —
   * returns true without prompting.
   */
  request: () => Promise<boolean>;
  /**
   * Open the OS Settings page for Bookflow's notification preferences
   * so the user can flip permission ON after declining once. iOS only
   * surfaces the system dialog ONCE; subsequent denied states must be
   * recovered from Settings.
   */
  openSettings: () => void;
  /** Convenience: true iff `status === 'granted'`. */
  granted: boolean;
};

export function useNotificationPermission(): PermissionState {
  const [status, setStatus] = useState<PermissionStatusValue | null>(null);

  // Read the OS state on mount + whenever the app comes back to
  // foreground. The user might have gone to Settings, granted
  // permission, and returned — we want the UI to reflect that
  // without forcing a manual re-tap.
  useEffect(() => {
    if (!isAvailable()) {
      // This platform or build cannot notify — settle the hook so the
      // UI shows the permission CTA rather than sitting on null.
      setStatus('undetermined');
      return;
    }
    let cancelled = false;
    const sync = () => {
      void getPermissionStatus().then((next) => {
        if (!cancelled) setStatus(next);
      });
    };
    sync();
    // Tapping a notification brings the app forward; re-read in case
    // permission changed in Settings in the interim.
    const unsubscribe = onNotificationTapped(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const request = async (): Promise<boolean> => {
    if (!isAvailable()) return false;
    try {
      const next = await requestPermission();
      setStatus(next);
      return next === 'granted';
    } catch {
      return false;
    }
  };

  const openSettings = () => {
    // expo-linking / RN Linking handles the platform difference — on
    // iOS this opens the app's notification screen, on Android the
    // app-level details.
    if (Platform.OS === 'ios') {
      void Linking.openURL('app-settings:');
    } else {
      void Linking.openSettings();
    }
  };

  return { status, request, openSettings, granted: status === 'granted' };
}

// ─── Daily reading reminder ────────────────────────────────────────────────

/**
 * Format an (hour 0-23, minute 0-59) pair as a 12-hour clock label,
 * e.g. (20, 30) → "8:30 PM". Single source of truth so every surface
 * (Settings chip, Notifications chip, picker preview) renders the
 * time identically.
 */
export function formatReminderTime(hour: number, minute: number): string {
  const h = ((hour % 12) + 12) % 12 || 12; // 0/12 → 12
  const period = hour < 12 ? 'AM' : 'PM';
  const mm = String(Math.max(0, Math.min(59, minute))).padStart(2, '0');
  return `${h}:${mm} ${period}`;
}

/**
 * Schedule a repeating daily local notification at the given hour +
 * minute (local time). Replaces any existing reminder so callers can
 * call this whenever the user adjusts the time without first having
 * to cancel.
 *
 * Returns true on successful schedule, false if the OS rejected
 * (typically permission missing — callers should pre-check via
 * `useNotificationPermission().granted`).
 */
export async function scheduleDailyReadingReminder(
  hour: number,
  minute: number = 0,
): Promise<boolean> {
  return scheduleDaily({
    id: DAILY_REMINDER_ID,
    content: {
      title: 'Time to read',
      body: 'Pick up where you left off. Even ten minutes counts.',
    },
    hour,
    minute,
  });
}

/**
 * Cancel the daily reminder if one is scheduled. Silent when nothing
 * is scheduled — `~/platform/notifications` swallows the unknown-id
 * throw so callers don't have to defensively try/catch.
 */
export async function cancelDailyReadingReminder(): Promise<void> {
  await cancel(DAILY_REMINDER_ID);
}

/**
 * Fire an immediate one-shot notification confirming the reminder was
 * set. Called ONLY from the explicit "Set time" action in the picker
 * — NOT from the schedule/sync path — so the user gets visible proof
 * the reminder works (the daily trigger itself won't fire until that
 * time of day arrives, which is otherwise invisible at set-time).
 *
 * No-op when the native module is missing, permission isn't granted,
 * or the caller passes granted=false — the picker pre-checks those
 * but we guard here too.
 */
export async function fireReminderSetConfirmation(
  hour: number,
  minute: number,
  granted: boolean,
): Promise<void> {
  if (!granted) return;
  await showNow({
    title: 'Reading reminder set',
    body: `We'll nudge you to read every day at ${formatReminderTime(hour, minute)}.`,
  });
}

/**
 * Effect-style hook — keeps the OS notification schedule in sync
 * with the user's toggle state + reminder time + OS permission. Call
 * once at the app root (or anywhere mounted for the entire signed-in
 * session). When any input changes, this re-runs:
 *
 *   - intent ON  + permission granted → schedule at `hour`
 *   - intent ON  + permission denied  → cancel anything; UI surfaces
 *                                       "Open Settings" CTA elsewhere
 *   - intent OFF                       → cancel
 *
 * Caller is responsible for persisting `enabled` / `hour` to its own
 * store. We don't own that state because the UI surfaces (Settings
 * + Notifications screens) already pull from `readerStore`.
 */
export function useDailyReminderSync(
  enabled: boolean,
  hour: number,
  minute: number,
  granted: boolean,
): void {
  useEffect(() => {
    if (enabled && granted) {
      void scheduleDailyReadingReminder(hour, minute);
    } else {
      void cancelDailyReadingReminder();
    }
  }, [enabled, hour, minute, granted]);
}

// ─── Streak warning ────────────────────────────────────────────────────────

/**
 * Secondary nudge — fires daily at one hour AFTER the user's primary
 * reading reminder. The copy is "you don't want to break your streak"
 * regardless of whether the user actually read today; v1 keeps it
 * unconditional because (a) tracking activity for cancellation needs
 * a separate background task we don't have, and (b) the user can
 * disable it outright if they find it annoying. Future revision:
 * cancel today's scheduled fire on read activity.
 */
const STREAK_WARNING_ID = 'bookflow:streak-warning';

export async function scheduleStreakWarning(
  reminderHour: number,
  reminderMinute: number = 0,
): Promise<boolean> {
  // Fire one hour after the primary reminder, same minute. Clamp at
  // 23:xx rather than wrapping past midnight — a streak nudge that
  // fires at 00:30 the next day would be confusing.
  const fireHour = Math.min(23, Math.max(0, Math.floor(reminderHour)) + 1);
  return scheduleDaily({
    id: STREAK_WARNING_ID,
    content: {
      title: "Don't break your streak",
      body: 'A few minutes of reading still counts, so pick up where you left off.',
    },
    hour: fireHour,
    minute: reminderMinute,
  });
}

export async function cancelStreakWarning(): Promise<void> {
  await cancel(STREAK_WARNING_ID);
}

/** Effect — mirrors useDailyReminderSync's shape. */
export function useStreakWarningSync(
  enabled: boolean,
  reminderHour: number,
  reminderMinute: number,
  granted: boolean,
): void {
  useEffect(() => {
    if (enabled && granted) {
      void scheduleStreakWarning(reminderHour, reminderMinute);
    } else {
      void cancelStreakWarning();
    }
  }, [enabled, reminderHour, reminderMinute, granted]);
}

// ─── Book finished processing ──────────────────────────────────────────────

/**
 * Fire an immediate local notification when a book completes
 * server-side processing. Called from the books-realtime hook when
 * it observes a row transition from a processing-ish state to
 * `'ready'`. No-op when the user has the toggle off or the OS hasn't
 * granted permission — the caller doesn't need to gate.
 *
 * "Immediate" via `null` trigger — fires as soon as the OS picks it
 * up (typically within seconds). On Android, foreground notifications
 * use the same channel as the handler-controlled foreground display.
 */
export async function fireBookReadyNotification(opts: {
  bookId: string;
  title: string;
  enabled: boolean;
  granted: boolean;
}): Promise<void> {
  if (!opts.enabled || !opts.granted) return;
  await showNow({
    title: 'Book ready to read',
    body: `${opts.title} just finished processing. Tap to open it.`,
    data: { bookId: opts.bookId, kind: 'book-ready' },
  });
}

/**
 * Fire an immediate local notification when a book's offline audio download
 * finishes. Respects the user's "book ready" preference + OS permission, so
 * it stays silent when either is off. Safe to call from non-React code (the
 * download orchestrator) — reads the toggle via the store's getState().
 */
export async function fireDownloadCompleteNotification(opts: {
  bookId: string;
  title: string;
}): Promise<void> {
  if (!useReaderStore.getState().notifBookFinishedOn) return;
  if ((await getPermissionStatus()) !== 'granted') return;
  await showNow({
    title: 'Download complete',
    body: `${opts.title} is ready to listen offline.`,
    data: { bookId: opts.bookId, kind: 'download-complete' },
  });
}
