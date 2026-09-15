import Feather from '@expo/vector-icons/Feather';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Text } from '@/components/ui';
import { t } from '@/i18n';
import { formatDuration, progress, remainingMs, statusOf, type Timer } from '@/logic/timers';
import { MIN_TOUCH_TARGET, useTheme, withAlpha } from '@/theme';

interface Props {
  timer: Timer;
  /** Passed in rather than read here, so every card on screen agrees to the millisecond. */
  now: number;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onDelete: () => void;
}

const RING = 72;
const STROKE = 6;

/**
 * One timer: a progress ring, the time left, and the controls.
 *
 * The remaining time and the ring are both derived from `now` rather than from a counter this
 * component owns. That is what makes a card correct after the app has been backgrounded — it
 * has nothing to catch up on.
 */
export function TimerCard({ timer, now, onStart, onPause, onReset, onDelete }: Props) {
  const { colors, spacing, radius } = useTheme();
  const status = statusOf(timer, now);
  const left = remainingMs(timer, now);
  const fraction = progress(timer, now);

  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const ringColour = status === 'finished' ? colors.success : colors.accent;

  const control = (
    icon: keyof typeof Feather.glyphMap,
    label: string,
    onPress: () => void,
    tone: string = colors.text,
  ) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${timer.label}`}
      onPress={onPress}
      android_ripple={{ color: withAlpha(tone, 0.14), borderless: true, radius: 22 }}
      style={({ pressed }) => [styles.control, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={20} color={tone} />
    </Pressable>
  );

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.base,
        padding: spacing.base,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
      }}
    >
      <View style={{ width: RING, height: RING }}>
        <Svg width={RING} height={RING}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.surfaceAlt} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={ringColour}
            strokeWidth={STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - fraction)}
            transform={`rotate(-90, ${RING / 2}, ${RING / 2})`}
          />
        </Svg>
      </View>

      <View style={styles.grow}>
        <Text variant="callout" numberOfLines={1}>
          {timer.label}
        </Text>
        <Text variant="numeric" style={{ marginTop: spacing.xs }}>
          {formatDuration(left)}
        </Text>
        {status === 'finished' ? (
          <Text variant="caption" color={colors.success}>
            {t('timerFinished')}
          </Text>
        ) : null}
      </View>

      <View style={[styles.controls, { gap: spacing.xs }]}>
        {status === 'running'
          ? control('pause', t('pauseLabel'), onPause)
          : control('play', t('startLabel'), onStart, colors.accent)}
        {control('rotate-ccw', t('resetLabel'), onReset, colors.textMuted)}
        {control('trash-2', t('deleteTimer'), onDelete, colors.textFaint)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  controls: { flexDirection: 'row', alignItems: 'center' },
  control: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
