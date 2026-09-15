import {
  MAX_DURATION_MS,
  createTimer,
  formatDuration,
  newlyFinished,
  parseDuration,
  pause,
  progress,
  remainingMs,
  reset,
  start,
  statusOf,
  type Timer,
} from '../timers';

const T0 = 1_700_000_000_000;
const make = (ms = 60_000): Timer => createTimer('t1', 'Pasta', ms)!;

describe('createTimer', () => {
  it('trims the label', () => {
    expect(createTimer('t', '  Pasta ', 1000)!.label).toBe('Pasta');
  });

  it('refuses a duration that is not a positive number', () => {
    expect(createTimer('t', 'x', 0)).toBeNull();
    expect(createTimer('t', 'x', -1)).toBeNull();
    expect(createTimer('t', 'x', Number.NaN)).toBeNull();
  });

  it('refuses a duration beyond a day, where this is the wrong tool', () => {
    expect(createTimer('t', 'x', MAX_DURATION_MS + 1)).toBeNull();
    expect(createTimer('t', 'x', MAX_DURATION_MS)).not.toBeNull();
  });

  it('starts idle, with nothing scheduled', () => {
    const timer = make();
    expect(statusOf(timer, T0)).toBe('idle');
    expect(timer.endsAt).toBeNull();
    expect(timer.notificationId).toBeNull();
  });
});

describe('remaining time is derived from the clock, not counted down', () => {
  it('is the full duration before it starts', () => {
    expect(remainingMs(make(60_000), T0)).toBe(60_000);
  });

  it('falls as the clock advances', () => {
    const running = start(make(60_000), T0);
    expect(remainingMs(running, T0 + 20_000)).toBe(40_000);
  });

  it('is CORRECT after the app was away for longer than the timer', () => {
    // The whole reason end times are absolute: an interval would not have run at all.
    const running = start(make(60_000), T0);
    expect(remainingMs(running, T0 + 10 * 60_000)).toBe(0);
    expect(statusOf(running, T0 + 10 * 60_000)).toBe('finished');
  });

  it('never goes negative', () => {
    const running = start(make(1000), T0);
    expect(remainingMs(running, T0 + 999_999)).toBe(0);
  });

  it('does not move while paused, however long the app is away', () => {
    const paused = pause(start(make(60_000), T0), T0 + 20_000);
    expect(remainingMs(paused, T0 + 20_000)).toBe(40_000);
    expect(remainingMs(paused, T0 + 20_000 + 60 * 60_000)).toBe(40_000);
  });
});

describe('status', () => {
  it('runs, then finishes exactly at zero', () => {
    const running = start(make(1000), T0);
    expect(statusOf(running, T0 + 999)).toBe('running');
    expect(statusOf(running, T0 + 1000)).toBe('finished');
  });

  it('reports paused over running', () => {
    expect(statusOf(pause(start(make(), T0), T0 + 1), T0 + 5000)).toBe('paused');
  });
});

describe('start, pause and reset', () => {
  it('resumes from where it was paused rather than from the top', () => {
    const paused = pause(start(make(60_000), T0), T0 + 20_000);
    const resumed = start(paused, T0 + 999_999);
    expect(remainingMs(resumed, T0 + 999_999)).toBe(40_000);
  });

  it('pausing drops the scheduled notification, so a paused timer cannot fire', () => {
    const running = { ...start(make(60_000), T0), notificationId: 'notif-1' };
    expect(pause(running, T0 + 1000).notificationId).toBeNull();
  });

  it('pausing a finished timer leaves it finished rather than parking it at zero', () => {
    const running = start(make(1000), T0);
    const after = pause(running, T0 + 5000);
    expect(statusOf(after, T0 + 5000)).toBe('finished');
  });

  it('pausing an idle timer changes nothing', () => {
    const timer = make();
    expect(pause(timer, T0)).toEqual(timer);
  });

  it('reset returns it to the top and cancels anything scheduled', () => {
    const running = { ...start(make(60_000), T0), notificationId: 'notif-1' };
    const back = reset(running);
    expect(statusOf(back, T0 + 30_000)).toBe('idle');
    expect(remainingMs(back, T0 + 30_000)).toBe(60_000);
    expect(back.notificationId).toBeNull();
  });

  it('starting a timer with nothing left does nothing', () => {
    const spent = { ...make(60_000), pausedRemainingMs: 0 };
    expect(start(spent, T0).endsAt).toBeNull();
  });
});

describe('progress', () => {
  it('runs from zero to one', () => {
    const running = start(make(100), T0);
    expect(progress(running, T0)).toBe(0);
    expect(progress(running, T0 + 50)).toBeCloseTo(0.5, 6);
    expect(progress(running, T0 + 100)).toBe(1);
  });

  it('never exceeds one, however stale the clock', () => {
    expect(progress(start(make(100), T0), T0 + 10_000_000)).toBe(1);
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '0:00'],
    [1000, '0:01'],
    [59_000, '0:59'],
    [60_000, '1:00'],
    [25 * 60_000, '25:00'],
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
  ])('%p ms is %p', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it('rounds up, so a timer never shows 0:00 while it is still running', () => {
    expect(formatDuration(1)).toBe('0:01');
  });

  it('never shows a negative time', () => {
    expect(formatDuration(-5000)).toBe('0:00');
  });
});

describe('parseDuration', () => {
  it.each([
    ['25', 25 * 60_000],
    ['1:30', 90_000],
    ['0:45', 45_000],
    ['1:00:00', 3_600_000],
  ])('reads %p', (text, expected) => {
    expect(parseDuration(text)).toBe(expected);
  });

  it('is NaN for nonsense rather than zero', () => {
    expect(Number.isNaN(parseDuration('abc'))).toBe(true);
    expect(Number.isNaN(parseDuration('1:2:3:4'))).toBe(true);
    expect(Number.isNaN(parseDuration('-5'))).toBe(true);
  });
});

describe('newlyFinished', () => {
  const running = start(make(1000), T0);

  it('reports a timer that crossed zero in this window', () => {
    expect(newlyFinished([running], T0, T0 + 2000).map((t) => t.id)).toEqual(['t1']);
  });

  it('does not report it twice', () => {
    expect(newlyFinished([running], T0 + 2000, T0 + 3000)).toEqual([]);
  });

  it('ignores one that has not finished yet', () => {
    expect(newlyFinished([running], T0, T0 + 500)).toEqual([]);
  });

  it('ignores idle and paused timers', () => {
    expect(newlyFinished([make(), pause(running, T0 + 500)], T0, T0 + 5000)).toEqual([]);
  });
});
