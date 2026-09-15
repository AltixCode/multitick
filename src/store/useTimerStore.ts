/**
 * The running timers and the saved presets.
 *
 * Timer arithmetic is entirely in `src/logic/timers.ts` and every scheduling call in
 * `src/services/notifications.ts`; this store sequences the two. The invariant it exists to
 * maintain is that **a running timer always has a scheduled alert, and a paused, reset or
 * deleted one never does** — an orphaned notification firing for a timer the user stopped is
 * worse than no notification at all.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  createTimer,
  pause as pauseTimer,
  remainingMs,
  reset as resetTimer,
  start as startTimer,
  statusOf,
  type Timer,
} from '@/logic/timers';
import { t } from '@/i18n';
import { cancelAlert, scheduleAlert } from '@/services/notifications';

export const TIMER_CACHE_KEY = 'multitick.state.v1';

/** Concurrent timers a free user may run. The whole point of the app is more than one. */
export const FREE_TIMERS = 3;

export interface Preset {
  id: string;
  label: string;
  durationMs: number;
}

/** Shipped presets. Real, common durations rather than round numbers for their own sake. */
export const BUILT_IN_PRESETS: Preset[] = [
  { id: 'pomodoro', label: 'Pomodoro', durationMs: 25 * 60_000 },
  { id: 'shortBreak', label: 'Short break', durationMs: 5 * 60_000 },
  { id: 'pasta', label: 'Pasta', durationMs: 11 * 60_000 },
  { id: 'egg', label: 'Soft egg', durationMs: 6 * 60_000 },
  { id: 'tea', label: 'Tea', durationMs: 3 * 60_000 },
  { id: 'hiit', label: 'HIIT round', durationMs: 45_000 },
];

interface TimerState {
  timers: Timer[];
  /** Timers whose end has already been announced, so a finish is never announced twice. */
  announced: string[];

  canAdd: (isPremium: boolean) => boolean;
  add: (label: string, durationMs: number, isPremium: boolean) => Timer | 'limit-reached' | 'invalid';
  start: (id: string) => Promise<void>;
  pause: (id: string) => Promise<void>;
  reset: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  markAnnounced: (id: string) => void;

  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
}

let sequence = 0;
const nextId = () => `timer-${Date.now().toString(36)}-${(sequence += 1)}`;

const isTimer = (v: unknown): v is Timer => {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Partial<Timer>;
  return (
    typeof t.id === 'string' &&
    typeof t.label === 'string' &&
    typeof t.durationMs === 'number' &&
    Number.isFinite(t.durationMs) &&
    t.durationMs > 0
  );
};

export const useTimerStore = create<TimerState>((set, get) => ({
  timers: [],
  announced: [],

  canAdd: (isPremium) => isPremium || get().timers.length < FREE_TIMERS,

  add: (label, durationMs, isPremium) => {
    if (!get().canAdd(isPremium)) return 'limit-reached';
    const timer = createTimer(nextId(), label, durationMs);
    if (!timer) return 'invalid';
    set((s) => ({ timers: [...s.timers, timer] }));
    void get().persist();
    return timer;
  },

  start: async (id) => {
    const timer = get().timers.find((t) => t.id === id);
    if (!timer) return;
    const now = Date.now();
    const running = startTimer(timer, now);
    if (running.endsAt === null) return;

    // Cancel first. Starting an already-running timer would otherwise leave the old alert
    // scheduled and the user would be told twice.
    await cancelAlert(timer.notificationId);
    const notificationId = await scheduleAlert(
      running.label,
      t('timerAlertBody'),
      running.endsAt,
      now,
    );
    set((s) => ({
      timers: s.timers.map((t) => (t.id === id ? { ...running, notificationId } : t)),
      announced: s.announced.filter((a) => a !== id),
    }));
    void get().persist();
  },

  pause: async (id) => {
    const timer = get().timers.find((t) => t.id === id);
    if (!timer) return;
    await cancelAlert(timer.notificationId);
    set((s) => ({ timers: s.timers.map((t) => (t.id === id ? pauseTimer(t, Date.now()) : t)) }));
    void get().persist();
  },

  reset: async (id) => {
    const timer = get().timers.find((t) => t.id === id);
    if (!timer) return;
    await cancelAlert(timer.notificationId);
    set((s) => ({
      timers: s.timers.map((t) => (t.id === id ? resetTimer(t) : t)),
      announced: s.announced.filter((a) => a !== id),
    }));
    void get().persist();
  },

  remove: async (id) => {
    const timer = get().timers.find((t) => t.id === id);
    await cancelAlert(timer?.notificationId ?? null);
    set((s) => ({
      timers: s.timers.filter((t) => t.id !== id),
      announced: s.announced.filter((a) => a !== id),
    }));
    void get().persist();
  },

  markAnnounced: (id) => {
    set((s) => (s.announced.includes(id) ? s : { announced: [...s.announced, id] }));
  },

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(TIMER_CACHE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const timers = Array.isArray(parsed.timers) ? parsed.timers.filter(isTimer) : [];
      const now = Date.now();
      // A timer that finished while the app was gone comes back finished, not still running —
      // the end time is absolute, so this is simply what the clock says.
      set({
        timers,
        announced: timers.filter((t) => statusOf(t, now) === 'finished').map((t) => t.id),
      });
    } catch {
      // Corrupt stored state starts clean rather than crashing on launch.
    }
  },

  persist: async () => {
    try {
      await AsyncStorage.setItem(TIMER_CACHE_KEY, JSON.stringify({ timers: get().timers }));
    } catch {
      // Losing a timer list costs the user re-adding them.
    }
  },
}));

export { remainingMs, statusOf };
