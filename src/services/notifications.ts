/**
 * Scheduling the alert a timer fires with.
 *
 * This is the half of the app that works when the app does not. A JavaScript interval stops the
 * moment the process is backgrounded or killed, so the *display* is derived from the clock (see
 * `src/logic/timers.ts`) and the *firing* is a local notification scheduled with the OS. Neither
 * alone is correct: the notification cannot redraw a ring, and the clock cannot wake a sleeping
 * phone.
 *
 * Every function here fails soft. A user who declined notification permission still gets a
 * perfectly good visible countdown; refusing to run without permission would break the app over
 * a feature the user deliberately turned off.
 */
import * as Notifications from 'expo-notifications';

/** Whether the OS will actually deliver anything. Cached after the first ask. */
let granted: boolean | null = null;

export function resetPermissionCacheForTests(): void {
  granted = null;
}

/**
 * Asks once, then remembers.
 *
 * Returns false rather than throwing when permission is denied or the API is unavailable — a
 * simulator without notification support must not crash the timer list.
 */
export async function ensurePermission(): Promise<boolean> {
  if (granted !== null) return granted;
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) {
      granted = true;
      return true;
    }
    if (!existing.canAskAgain) {
      granted = false;
      return false;
    }
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted === true;
    return granted;
  } catch {
    granted = false;
    return false;
  }
}

/**
 * Schedules one alert for a timer, returning its id so it can be cancelled.
 *
 * Null means nothing was scheduled — no permission, an unusable delay, or the OS refused. The
 * caller stores null and the timer still counts down on screen.
 */
export async function scheduleAlert(
  label: string,
  body: string,
  fireAtMs: number,
  now: number = Date.now(),
): Promise<string | null> {
  const seconds = Math.round((fireAtMs - now) / 1000);
  // A notification scheduled in the past fires immediately on some platforms and never on
  // others; neither is what a finished timer wants.
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (!(await ensurePermission())) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: label, body, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
    });
  } catch {
    return null;
  }
}

/** Cancels a scheduled alert. Safe to call with null or an id the OS has already forgotten. */
export async function cancelAlert(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already fired, already cancelled, or no permission. Nothing to undo either way.
  }
}
