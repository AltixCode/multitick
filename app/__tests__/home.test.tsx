import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import React from 'react';

import Home from '../index';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { statusOf } from '@/logic/timers';
import { resetPermissionCacheForTests } from '@/services/notifications';
import { FREE_TIMERS, useTimerStore } from '@/store/useTimerStore';
import * as interstitial from '@/monetization/interstitial';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { usePremiumStore } from '@/store/usePremiumStore';

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const initial = useTimerStore.getState();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useTimerStore.setState(initial, true);
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  resetPermissionCacheForTests();
  mocked.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true } as never);
  mocked.scheduleNotificationAsync.mockResolvedValue('notif-1' as never);
  mocked.cancelScheduledNotificationAsync.mockResolvedValue(undefined as never);
});

describe('adding timers', () => {
  it('says so when there are none', async () => {
    const { getByText } = await renderWithProviders(<Home />);
    expect(getByText(t('noTimers'))).toBeTruthy();
  });

  it('adds one from minutes', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    await fireEvent.changeText(getByLabelText(t('timerNameLabel')), 'Pasta');
    await fireEvent.changeText(getByLabelText(t('durationLabel')), '11');
    await fireEvent.press(getByText(t('addTimerLabel')));
    const timers = useTimerStore.getState().timers;
    expect(timers).toHaveLength(1);
    expect(timers[0]!.durationMs).toBe(11 * 60_000);
  });

  it('accepts mm:ss', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    await fireEvent.changeText(getByLabelText(t('durationLabel')), '1:30');
    await fireEvent.press(getByText(t('addTimerLabel')));
    expect(useTimerStore.getState().timers[0]!.durationMs).toBe(90_000);
  });

  it('explains an unusable duration rather than silently doing nothing', async () => {
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    await fireEvent.changeText(getByLabelText(t('durationLabel')), 'soon');
    await fireEvent.press(getByText(t('addTimerLabel')));
    await waitFor(() => expect(getByText(t('invalidDuration'))).toBeTruthy());
    expect(useTimerStore.getState().timers).toEqual([]);
  });

  it('starts a preset immediately', async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('presetPasta')));
    await waitFor(() => expect(useTimerStore.getState().timers).toHaveLength(1));
    await waitFor(() => expect(statusOf(useTimerStore.getState().timers[0]!, Date.now())).toBe('running'));
  });

  it('offers the upgrade at the free limit', async () => {
    for (let i = 0; i < FREE_TIMERS; i += 1) useTimerStore.getState().add(`T${i}`, 60_000, false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    await fireEvent.changeText(getByLabelText(t('durationLabel')), '5');
    await fireEvent.press(getByText(t('addTimerLabel')));
    expect(alert).toHaveBeenCalledWith(t('timerLimitTitle'), t('timerLimitBody'), expect.any(Array));
    expect(useTimerStore.getState().timers).toHaveLength(FREE_TIMERS);
  });

  it('lets a premium user past the limit', async () => {
    usePremiumStore.setState({ isPremium: true });
    for (let i = 0; i < FREE_TIMERS; i += 1) useTimerStore.getState().add(`T${i}`, 60_000, true);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    await fireEvent.changeText(getByLabelText(t('durationLabel')), '5');
    await fireEvent.press(getByText(t('addTimerLabel')));
    expect(alert).not.toHaveBeenCalled();
    expect(useTimerStore.getState().timers).toHaveLength(FREE_TIMERS + 1);
  });
});

describe('running a timer', () => {
  it('starts and pauses', async () => {
    useTimerStore.getState().add('Pasta', 60_000, false);
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(`${t('startLabel')}: Pasta`));
    await waitFor(() => expect(statusOf(useTimerStore.getState().timers[0]!, Date.now())).toBe('running'));
    await fireEvent.press(getByLabelText(`${t('pauseLabel')}: Pasta`));
    await waitFor(() => expect(statusOf(useTimerStore.getState().timers[0]!, Date.now())).toBe('paused'));
  });

  it('resets to the top', async () => {
    useTimerStore.getState().add('Pasta', 60_000, false);
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(`${t('startLabel')}: Pasta`));
    await fireEvent.press(getByLabelText(`${t('resetLabel')}: Pasta`));
    await waitFor(() => expect(statusOf(useTimerStore.getState().timers[0]!, Date.now())).toBe('idle'));
  });

  it('deletes a timer', async () => {
    useTimerStore.getState().add('Pasta', 60_000, false);
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(`${t('deleteTimer')}: Pasta`));
    await waitFor(() => expect(useTimerStore.getState().timers).toEqual([]));
  });

  it('shows a timer that already finished as finished', async () => {
    useTimerStore.setState({
      timers: [{ id: 't1', label: 'Pasta', durationMs: 60_000, endsAt: Date.now() - 1000, pausedRemainingMs: null, notificationId: null }],
      announced: [],
    });
    const { getByText } = await renderWithProviders(<Home />);
    await waitFor(() => expect(getByText(t('timerFinished'))).toBeTruthy());
  });
});

describe('notifications', () => {
  it('says plainly when they are off, and does not pretend the countdown is broken', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false } as never);
    const { getByText } = await renderWithProviders(<Home />);
    await waitFor(() => expect(getByText(t('notificationsOff'))).toBeTruthy());
  });

  it('says nothing when they are on', async () => {
    const { queryByText } = await renderWithProviders(<Home />);
    await waitFor(() => expect(queryByText(t('notificationsOff'))).toBeNull());
  });
});

describe('ads', () => {
  it('shows a banner to a free user', async () => {
    const { queryByTestId } = await renderWithProviders(<Home />);
    expect(queryByTestId('banner-ad')).not.toBeNull();
  });

  it('shows no banner to a premium user', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { queryByTestId } = await renderWithProviders(<Home />);
    expect(queryByTestId('banner-ad')).toBeNull();
  });

  it('NEVER interrupts while a countdown is running', async () => {
    const spy = jest.spyOn(interstitial, 'showInterstitial').mockReturnValue(true);
    useTimerStore.setState({
      timers: [
        { id: 'done1', label: 'A', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'done2', label: 'B', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'done3', label: 'C', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'running', label: 'Pasta', durationMs: 600_000, endsAt: Date.now() + 500_000, pausedRemainingMs: null, notificationId: null },
      ],
      announced: [],
    });
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(`${t('resetLabel')}: A`));
    expect(spy).not.toHaveBeenCalled();
  });

  it('may interrupt from the list when nothing is counting down', async () => {
    const spy = jest.spyOn(interstitial, 'showInterstitial').mockReturnValue(true);
    useTimerStore.setState({
      timers: [
        { id: 'done1', label: 'A', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'done2', label: 'B', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'done3', label: 'C', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
      ],
      announced: [],
    });
    const { getByLabelText } = await renderWithProviders(<Home />);
    await waitFor(() => expect(useTimerStore.getState().announced).toHaveLength(3));
    await fireEvent.press(getByLabelText(`${t('resetLabel')}: A`));
    expect(spy).toHaveBeenCalled();
  });

  it('never interrupts a premium user', async () => {
    usePremiumStore.setState({ isPremium: true });
    const spy = jest.spyOn(interstitial, 'showInterstitial').mockReturnValue(true);
    useTimerStore.setState({
      timers: [
        { id: 'd1', label: 'A', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'd2', label: 'B', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
        { id: 'd3', label: 'C', durationMs: 1000, endsAt: Date.now() - 1, pausedRemainingMs: null, notificationId: null },
      ],
      announced: [],
    });
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(`${t('resetLabel')}: A`));
    expect(spy).not.toHaveBeenCalled();
  });

  it('opens settings', async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByLabelText(t('settingsTitle')));
    expect(testRouter.push).toHaveBeenCalledWith('/settings');
  });
});
