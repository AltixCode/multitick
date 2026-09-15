import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { FREE_TIMERS, TIMER_CACHE_KEY, useTimerStore } from '../useTimerStore';
import { resetPermissionCacheForTests } from '@/services/notifications';
import { statusOf } from '@/logic/timers';
import { t } from '@/i18n';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const initial = useTimerStore.getState();
const S = () => useTimerStore.getState();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useTimerStore.setState(initial, true);
  resetPermissionCacheForTests();
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  mocked.scheduleNotificationAsync.mockResolvedValue('notif-1' as never);
  mocked.cancelScheduledNotificationAsync.mockResolvedValue(undefined as never);
});

describe('adding timers', () => {
  it('adds one', () => {
    const timer = S().add('Pasta', 60_000, false);
    expect(timer).not.toBe('limit-reached');
    expect(S().timers).toHaveLength(1);
  });

  it('refuses an unusable duration and says which problem it is', () => {
    expect(S().add('Pasta', 0, false)).toBe('invalid');
    expect(S().add('Pasta', -1, false)).toBe('invalid');
    expect(S().timers).toEqual([]);
  });

  it('caps a free user at the free limit', () => {
    for (let i = 0; i < FREE_TIMERS; i += 1) S().add(`T${i}`, 60_000, false);
    expect(S().add('One too many', 60_000, false)).toBe('limit-reached');
    expect(S().timers).toHaveLength(FREE_TIMERS);
  });

  it('lets a premium user past the limit', () => {
    for (let i = 0; i < FREE_TIMERS + 3; i += 1) S().add(`T${i}`, 60_000, true);
    expect(S().timers).toHaveLength(FREE_TIMERS + 3);
  });

  it('reports whether another can be added', () => {
    for (let i = 0; i < FREE_TIMERS; i += 1) S().add(`T${i}`, 60_000, false);
    expect(S().canAdd(false)).toBe(false);
    expect(S().canAdd(true)).toBe(true);
  });
});

describe('a running timer always has an alert scheduled', () => {
  it('schedules one on start and stores its id', async () => {
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    await S().start(timer.id);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalled();
    expect(S().timers[0]!.notificationId).toBe('notif-1');
  });

  it('cancels the previous alert before scheduling a new one, so nothing fires twice', async () => {
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    await S().start(timer.id);
    await S().start(timer.id);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });

  it('still runs on screen when the alert could not be scheduled', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    await S().start(timer.id);
    expect(S().timers[0]!.notificationId).toBeNull();
    expect(statusOf(S().timers[0]!, Date.now())).toBe('running');
  });
});

describe('a stopped timer never has one', () => {
  const startOne = async () => {
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    await S().start(timer.id);
    return timer.id;
  };

  it('pausing cancels the alert', async () => {
    const id = await startOne();
    await S().pause(id);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(S().timers[0]!.notificationId).toBeNull();
  });

  it('resetting cancels the alert and returns it to the top', async () => {
    const id = await startOne();
    await S().reset(id);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(statusOf(S().timers[0]!, Date.now())).toBe('idle');
  });

  it('removing cancels the alert, so a deleted timer cannot fire', async () => {
    const id = await startOne();
    await S().remove(id);
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(S().timers).toEqual([]);
  });

  it('ignores an action for an id that is not there', async () => {
    await S().start('nope');
    await S().pause('nope');
    await S().reset('nope');
    expect(S().timers).toEqual([]);
  });
});

describe('announcing a finish exactly once', () => {
  it('marks a timer announced', () => {
    S().markAnnounced('t1');
    S().markAnnounced('t1');
    expect(S().announced).toEqual(['t1']);
  });

  it('clears the mark when the timer is restarted', async () => {
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    S().markAnnounced(timer.id);
    await S().start(timer.id);
    expect(S().announced).not.toContain(timer.id);
  });

  it('clears the mark on reset', async () => {
    const timer = S().add('Pasta', 60_000, false) as { id: string };
    S().markAnnounced(timer.id);
    await S().reset(timer.id);
    expect(S().announced).not.toContain(timer.id);
  });
});

describe('persistence', () => {
  it('round-trips the timers', async () => {
    S().add('Pasta', 60_000, false);
    await S().persist();
    useTimerStore.setState(initial, true);
    await S().hydrate();
    expect(S().timers).toHaveLength(1);
    expect(S().timers[0]!.label).toBe('Pasta');
  });

  it('a timer that finished while the app was gone comes back FINISHED, not running', async () => {
    // The end time is absolute, so this is simply what the clock says on return.
    await AsyncStorage.setItem(
      TIMER_CACHE_KEY,
      JSON.stringify({
        timers: [
          { id: 't1', label: 'Pasta', durationMs: 60_000, endsAt: Date.now() - 5000, pausedRemainingMs: null, notificationId: null },
        ],
      }),
    );
    await S().hydrate();
    expect(statusOf(S().timers[0]!, Date.now())).toBe('finished');
    // And it is already marked announced: the notification fired while the app was away, so
    // showing the alert again on launch would tell the user twice.
    expect(S().announced).toEqual(['t1']);
  });

  it('a timer still running when the app was killed comes back running', async () => {
    await AsyncStorage.setItem(
      TIMER_CACHE_KEY,
      JSON.stringify({
        timers: [
          { id: 't1', label: 'Pasta', durationMs: 600_000, endsAt: Date.now() + 300_000, pausedRemainingMs: null, notificationId: 'n1' },
        ],
      }),
    );
    await S().hydrate();
    expect(statusOf(S().timers[0]!, Date.now())).toBe('running');
    expect(S().announced).toEqual([]);
  });

  it('starts clean rather than throwing on corrupt state', async () => {
    await AsyncStorage.setItem(TIMER_CACHE_KEY, '{{{');
    await S().hydrate();
    expect(S().timers).toEqual([]);
  });

  it('drops a stored timer of the wrong shape', async () => {
    await AsyncStorage.setItem(
      TIMER_CACHE_KEY,
      JSON.stringify({ timers: [{ id: 'x' }, { id: 'y', label: 'Ok', durationMs: 1000, endsAt: null, pausedRemainingMs: null, notificationId: null }] }),
    );
    await S().hydrate();
    expect(S().timers).toHaveLength(1);
  });
});

describe('the alert a started timer schedules', () => {
  it('carries a body saying the timer is done, not an empty string', async () => {
    // The emulator shade showed the alert as the bare word "Pasta" — a label with no
    // statement. A notification whose whole content is the timer's name does not tell the
    // user the thing they were waiting for has actually happened.
    const store = useTimerStore.getState();
    store.add('Pasta', 120_000, false);
    const id = useTimerStore.getState().timers[0]!.id;
    await useTimerStore.getState().start(id);

    const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0]![0];
    expect(call.content.title).toBe('Pasta');
    expect(call.content.body).toBe(t('timerAlertBody'));
    expect(call.content.body.length).toBeGreaterThan(0);
  });
});
