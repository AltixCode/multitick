/**
 * Countdown timers. Pure and dependency-free: every function takes `now` rather than reading
 * the clock, so the whole of time can be tested without waiting for any of it.
 *
 * The rule that shapes this file: a timer stores the **absolute moment it ends**, never a
 * remaining-seconds counter that something has to decrement. A JavaScript interval does not run
 * while the app is backgrounded or killed, so a countdown built on one is simply wrong the
 * moment the user leaves the screen — and "wrong" here means the pasta is ruined. Deriving the
 * remaining time from the clock on every frame means coming back after ten minutes away shows
 * the right number immediately instead of resuming where it was paused.
 */

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface Timer {
  id: string;
  label: string;
  /** What the timer was set to, in milliseconds. Used to reset and to draw the progress ring. */
  durationMs: number;
  /**
   * Epoch millisecond this timer ends at, when running. Null when idle, paused or finished.
   * This is the source of truth for display.
   */
  endsAt: number | null;
  /** Milliseconds left at the moment it was paused. Null unless paused. */
  pausedRemainingMs: number | null;
  /** Identifier of the scheduled local notification, so it can be cancelled on pause or reset. */
  notificationId: string | null;
}

/** Longest timer the app accepts. Beyond a day this is the wrong tool. */
export const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export function createTimer(id: string, label: string, durationMs: number): Timer | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) return null;
  return {
    id,
    label: label.trim(),
    durationMs: Math.round(durationMs),
    endsAt: null,
    pausedRemainingMs: null,
    notificationId: null,
  };
}

export function statusOf(timer: Timer, now: number): TimerStatus {
  if (timer.pausedRemainingMs !== null) return 'paused';
  if (timer.endsAt === null) return 'idle';
  return timer.endsAt <= now ? 'finished' : 'running';
}

/**
 * Milliseconds left, never negative.
 *
 * Derived from the clock rather than counted down, which is what makes a backgrounded timer
 * correct when the app comes back.
 */
export function remainingMs(timer: Timer, now: number): number {
  if (timer.pausedRemainingMs !== null) return Math.max(0, timer.pausedRemainingMs);
  if (timer.endsAt === null) return timer.durationMs;
  return Math.max(0, timer.endsAt - now);
}

/** 0 at the start, 1 when finished. Clamped, so a stale clock cannot draw a ring past full. */
export function progress(timer: Timer, now: number): number {
  if (timer.durationMs <= 0) return 1;
  const elapsed = timer.durationMs - remainingMs(timer, now);
  return Math.min(1, Math.max(0, elapsed / timer.durationMs));
}

export function start(timer: Timer, now: number): Timer {
  const remaining = timer.pausedRemainingMs ?? timer.durationMs;
  if (remaining <= 0) return timer;
  return { ...timer, endsAt: now + remaining, pausedRemainingMs: null };
}

export function pause(timer: Timer, now: number): Timer {
  if (timer.endsAt === null) return timer;
  const remaining = Math.max(0, timer.endsAt - now);
  // Pausing a finished timer is meaningless; leave it finished rather than parking it at zero.
  if (remaining <= 0) return timer;
  return { ...timer, endsAt: null, pausedRemainingMs: remaining, notificationId: null };
}

export function reset(timer: Timer): Timer {
  return { ...timer, endsAt: null, pausedRemainingMs: null, notificationId: null };
}

/** Formats a duration as m:ss, or h:mm:ss once it passes an hour. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** Parses "mm" or "mm:ss" or "h:mm:ss" into milliseconds. NaN for anything else. */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':');
  if (parts.length > 3) return Number.NaN;
  const numbers = parts.map((p) => Number(p.trim()));
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return Number.NaN;
  let seconds = 0;
  if (numbers.length === 1) seconds = numbers[0]! * 60;
  else if (numbers.length === 2) seconds = numbers[0]! * 60 + numbers[1]!;
  else seconds = numbers[0]! * 3600 + numbers[1]! * 60 + numbers[2]!;
  return seconds * 1000;
}

/** Timers that have just crossed zero since `since`, so each finish is announced exactly once. */
export function newlyFinished(timers: readonly Timer[], since: number, now: number): Timer[] {
  return timers.filter((t) => t.endsAt !== null && t.endsAt > since && t.endsAt <= now);
}
