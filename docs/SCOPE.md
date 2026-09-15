# Multitick — what is being built

Guide item 7. Several named countdowns at once, which is the thing the built-in
phone timer cannot do and the reason this app exists.

## The shape

- Any number of named timers, each with its own progress ring, all running
  independently.
- Presets: Pomodoro 25/5, common HIIT intervals, and a few cooking times.
- Per-timer alert sound.

## Backgrounding, which is the whole engineering problem

A JavaScript interval does not run when the app is backgrounded or killed, so a
timer that relies on one is wrong the moment the user leaves the screen — and
"wrong" here means the pasta is ruined.

Two mechanisms, both required:

1. **A scheduled local notification per running timer**, so the alert fires at
   the right wall-clock moment whether or not the app is alive.
2. **Absolute end times, not remaining seconds.** Each timer stores the epoch
   millisecond it ends at; the UI derives the remaining time from the clock on
   every frame. Resuming after ten minutes in the background shows the correct
   number immediately rather than counting down from where it was paused.

The notification is the source of truth for *firing*; the stored end time is the
source of truth for *display*. Neither alone is correct.

## Free and paid

| | Free | Unlocked |
|---|---|---|
| Concurrent timers | 3 | unlimited |
| Presets | ✅ | ✅ |
| Custom alert sound per timer | ⬜ | ✅ |
| Saved timer stacks | ⬜ | ✅ |

## Ads

Banner on the timer list only. **No interstitial while a countdown is running** —
the guide is right that it would be disruptive, and an ad covering a timer the
user is actively watching is the kind of thing that earns a one-star review
about a burnt dinner. The interstitial runs only from the list, when nothing is
counting.
