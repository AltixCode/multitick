import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BannerAdSlot } from '@/components/BannerAdSlot';
import { TimerCard } from '@/components/TimerCard';
import { Button, Text } from '@/components/ui';
import { t, type TranslationKey } from '@/i18n';
import { parseDuration, statusOf } from '@/logic/timers';
import { shouldShowInterstitial } from '@/monetization/adPolicy';
import { shouldShowAds } from '@/monetization/entitlements';
import { showInterstitial } from '@/monetization/interstitial';
import { ensurePermission } from '@/services/notifications';
import { BUILT_IN_PRESETS, useTimerStore } from '@/store/useTimerStore';
import { usePremiumStore } from '@/store/usePremiumStore';
import { MIN_TOUCH_TARGET, useTheme, withAlpha } from '@/theme';

/** Preset id -> its label key. Explicit, so a new preset cannot ship untranslated. */
const PRESET_KEY: Record<string, TranslationKey> = {
  pomodoro: 'presetPomodoro',
  shortBreak: 'presetShortBreak',
  pasta: 'presetPasta',
  egg: 'presetEgg',
  tea: 'presetTea',
  hiit: 'presetHiit',
};

/**
 * How often the list re-renders while anything is running.
 *
 * This drives the *display* only. Nothing is counted down here — each card derives its own
 * remaining time from this timestamp — so a missed tick costs a frame, never a second.
 */
const TICK_MS = 250;

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const timers = useTimerStore((s) => s.timers);
  const announced = useTimerStore((s) => s.announced);
  const add = useTimerStore((s) => s.add);
  const startTimer = useTimerStore((s) => s.start);
  const pauseTimer = useTimerStore((s) => s.pause);
  const resetTimer = useTimerStore((s) => s.reset);
  const removeTimer = useTimerStore((s) => s.remove);
  const markAnnounced = useTimerStore((s) => s.markAnnounced);
  const hydrate = useTimerStore((s) => s.hydrate);

  const isPremium = usePremiumStore((s) => s.isPremium);
  const isReady = usePremiumStore((s) => s.isReady);

  const [now, setNow] = useState(() => Date.now());
  const [label, setLabel] = useState('');
  const [duration, setDuration] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [notificationsOff, setNotificationsOff] = useState(false);

  const completed = useRef(0);
  const lastInterstitialAt = useRef(0);

  useEffect(() => {
    void hydrate();
    void ensurePermission().then((ok) => setNotificationsOff(!ok));
  }, [hydrate]);

  // One ticker for the whole list, running only while something needs it.
  const anyRunning = timers.some((timer) => statusOf(timer, now) === 'running');
  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [anyRunning]);

  // Coming back from the background: resync immediately rather than waiting for a tick, so the
  // first frame after a return is already correct.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  // A finish is announced once. The notification has already fired if the app was away; this is
  // only the in-app acknowledgement.
  useEffect(() => {
    for (const timer of timers) {
      if (statusOf(timer, now) !== 'finished' || announced.includes(timer.id)) continue;
      markAnnounced(timer.id);
      completed.current += 1;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [timers, now, announced, markAnnounced]);

  const submit = () => {
    const ms = parseDuration(duration);
    if (!Number.isFinite(ms) || ms <= 0) {
      setInvalid(true);
      return;
    }
    const outcome = add(label.trim() || t('addTimerLabel'), ms, isPremium);
    if (outcome === 'limit-reached') {
      Alert.alert(t('timerLimitTitle'), t('timerLimitBody'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('removeAdsCta'), onPress: () => router.push('/paywall') },
      ]);
      return;
    }
    if (outcome === 'invalid') {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setLabel('');
    setDuration('');
  };

  const fromPreset = (id: string, durationMs: number) => {
    const outcome = add(t(PRESET_KEY[id] ?? 'addTimerLabel'), durationMs, isPremium);
    if (outcome === 'limit-reached') {
      Alert.alert(t('timerLimitTitle'), t('timerLimitBody'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('removeAdsCta'), onPress: () => router.push('/paywall') },
      ]);
      return;
    }
    if (typeof outcome === 'object') void startTimer(outcome.id);
  };

  /**
   * The interstitial runs only from the list with **nothing counting down**.
   *
   * An ad over a running timer is the thing that gets a one-star review about a burnt dinner,
   * and a timer is exactly the sort of thing people watch.
   */
  const maybeInterstitial = useCallback(() => {
    if (anyRunning) return;
    if (
      shouldShowAds({ isPremium, isReady }) &&
      shouldShowInterstitial({
        gamesPlayed: completed.current,
        lastInterstitialAt: lastInterstitialAt.current,
        now: Date.now(),
        adsRemoved: isPremium,
      }) &&
      showInterstitial()
    ) {
      lastInterstitialAt.current = Date.now();
    }
  }, [anyRunning, isPremium, isReady]);

  const handleReset = (id: string) => {
    void resetTimer(id);
    maybeInterstitial();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + spacing.base,
          paddingHorizontal: spacing.base,
          paddingBottom: spacing.xl,
          gap: spacing.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <Text variant="title" style={styles.grow}>
            {t('appName')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('settingsTitle')}
            onPress={() => router.push('/settings')}
            hitSlop={8}
            style={styles.iconSlot}
          >
            <Feather name="settings" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {notificationsOff ? (
          <Text variant="caption" tone="muted">
            {t('notificationsOff')}
          </Text>
        ) : null}

        {timers.length === 0 ? (
          <Text variant="body" tone="muted">
            {t('noTimers')}
          </Text>
        ) : (
          timers.map((timer) => (
            <TimerCard
              key={timer.id}
              timer={timer}
              now={now}
              onStart={() => void startTimer(timer.id)}
              onPause={() => void pauseTimer(timer.id)}
              onReset={() => handleReset(timer.id)}
              onDelete={() => void removeTimer(timer.id)}
            />
          ))
        )}

        <View style={[styles.row, { gap: spacing.sm }]}>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder={t('timerNameLabel')}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={t('timerNameLabel')}
            style={[styles.input, styles.grow, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md }]}
          />
          <TextInput
            value={duration}
            onChangeText={setDuration}
            onSubmitEditing={submit}
            keyboardType="numbers-and-punctuation"
            placeholder={t('durationHint')}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={t('durationLabel')}
            style={[styles.input, styles.duration, { color: colors.text, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, paddingHorizontal: spacing.md }]}
          />
        </View>

        {invalid ? (
          <Text variant="caption" tone="danger">
            {t('invalidDuration')}
          </Text>
        ) : null}

        <Button label={t('addTimerLabel')} icon="plus" fullWidth onPress={submit} />

        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="micro" tone="faint">
            {t('presetsTitle').toUpperCase()}
          </Text>
          <View style={[styles.chips, { gap: spacing.sm }]}>
            {BUILT_IN_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                accessibilityRole="button"
                accessibilityLabel={t(PRESET_KEY[preset.id] ?? 'addTimerLabel')}
                onPress={() => fromPreset(preset.id, preset.durationMs)}
                android_ripple={{ color: withAlpha(colors.accent, 0.16) }}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.base,
                  borderRadius: radius.full,
                  backgroundColor: colors.surfaceAlt,
                }}
              >
                <Text variant="caption">{t(PRESET_KEY[preset.id] ?? 'addTimerLabel')}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  grow: { flex: 1 },
  input: { minHeight: MIN_TOUCH_TARGET, fontSize: 16 },
  duration: { width: 120 },
  iconSlot: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
