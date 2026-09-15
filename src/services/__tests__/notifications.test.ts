import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  ALERT_CHANNEL_ID,
  cancelAlert,
  ensurePermission,
  resetPermissionCacheForTests,
  scheduleAlert,
} from '../notifications';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

beforeEach(() => {
  jest.clearAllMocks();
  resetPermissionCacheForTests();
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  mocked.requestPermissionsAsync.mockResolvedValue({ granted: true } as never);
  mocked.scheduleNotificationAsync.mockResolvedValue('notif-1' as never);
  mocked.cancelScheduledNotificationAsync.mockResolvedValue(undefined as never);
});

describe('ensurePermission', () => {
  it('is true when already granted, without asking again', async () => {
    expect(await ensurePermission()).toBe(true);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks when it can, and reports the answer', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    expect(await ensurePermission()).toBe(true);
    expect(mocked.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('does not ask again when the user has said no for good', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    expect(await ensurePermission()).toBe(false);
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('asks only once across many calls', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true } as never);
    await ensurePermission();
    await ensurePermission();
    await ensurePermission();
    expect(mocked.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('is false rather than throwing when the API is unavailable', async () => {
    mocked.getPermissionsAsync.mockRejectedValue(new Error('no such module'));
    expect(await ensurePermission()).toBe(false);
  });
});

describe('scheduleAlert', () => {
  const NOW = 1_700_000_000_000;

  it('schedules for the remaining seconds and returns the id', async () => {
    const id = await scheduleAlert('Pasta', 'done', NOW + 90_000, NOW);
    expect(id).toBe('notif-1');
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: expect.objectContaining({ seconds: 90 }) }),
    );
  });

  it('refuses a time in the past rather than firing immediately', async () => {
    expect(await scheduleAlert('Pasta', 'done', NOW - 1000, NOW)).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('refuses a fire time of exactly now', async () => {
    expect(await scheduleAlert('Pasta', 'done', NOW, NOW)).toBeNull();
  });

  it('returns null without permission, so the countdown still runs', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    expect(await scheduleAlert('Pasta', 'done', NOW + 60_000, NOW)).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('returns null rather than throwing when the OS refuses', async () => {
    mocked.scheduleNotificationAsync.mockRejectedValue(new Error('quota'));
    expect(await scheduleAlert('Pasta', 'done', NOW + 60_000, NOW)).toBeNull();
  });

  it('carries the timer label as the title, so several alerts are tellable apart', async () => {
    await scheduleAlert('Eggs', 'done', NOW + 60_000, NOW);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.objectContaining({ title: 'Eggs' }) }),
    );
  });
});

describe('cancelAlert', () => {
  it('cancels by id', async () => {
    await cancelAlert('notif-1');
    expect(mocked.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });

  it('does nothing for a null id', async () => {
    await cancelAlert(null);
    expect(mocked.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows a failure — there is nothing to undo either way', async () => {
    mocked.cancelScheduledNotificationAsync.mockRejectedValue(new Error('gone'));
    await expect(cancelAlert('notif-1')).resolves.toBeUndefined();
  });
});

describe('the alert channel — a timer that finishes silently has not finished', () => {
  // Channels are an Android concept; on iOS the sound comes from the notification itself.
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  });
  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  });

  it('is not created on iOS, which has no such concept', async () => {
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    await scheduleAlert('Pasta', 'Time is up', 60_000, 0);
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it('creates a high-importance channel with sound before scheduling', async () => {
    // The device proved this: with no channel of our own, Android filed the alert under
    // `expo_notifications_fallback_notification_channel` with `sound=null`. A cooking timer
    // that expires without a noise is indistinguishable from one that never fired.
    await scheduleAlert('Pasta', 'Time is up', 60_000, 0);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledWith(
      ALERT_CHANNEL_ID,
      expect.objectContaining({
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
      }),
    );
  });

  it('files the notification on that channel', async () => {
    await scheduleAlert('Pasta', 'Time is up', 60_000, 0);
    expect(mocked.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({ channelId: ALERT_CHANNEL_ID }),
      }),
    );
  });

  it('creates the channel once, not on every timer started', async () => {
    await scheduleAlert('A', 'x', 60_000, 0);
    await scheduleAlert('B', 'x', 60_000, 0);
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
  });

  it('still schedules when the channel cannot be created', async () => {
    mocked.setNotificationChannelAsync.mockRejectedValue(new Error('no channels here'));
    expect(await scheduleAlert('Pasta', 'Time is up', 60_000, 0)).toBe('notif-1');
  });
});
