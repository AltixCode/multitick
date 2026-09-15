# Multitick — handoff

What was actually run, and what is still unknown. **Unverified is `UNKNOWN`,
never a pass** — a green build is not a verification.

Last updated: (unset)

## Verification state

| Gate | State | Evidence |
|---|---|---|
| Lint | ✅ | `npm run verify` 2026-09-15 |
| Typecheck | ✅ | `npm run verify` 2026-09-15 |
| Unit tests | ✅ | 278 passing, 18 suites |
| i18n completeness (14 locales) | ✅ | 14 × 72 keys complete |
| UI rules (colour tokens, `t()`) | ✅ | 12 files clean |
| iOS + Android bundle export | ✅ | both bundles exported |
| CI green on a self-hosted runner | ⬜ | |
| `check:release` with real identifiers | ⬜ | |
| Builds, installs, launches on the iOS simulator | ✅ | iPhone 17, 2026-09-15 |
| Renders in light **and** dark on device | ✅ | both platforms |
| Every feature driven on the Android emulator | ✅ | see Android device pass below |
| Purchase flow exercised against a real offering | ⬜ | |
| Ads served under real consent | ⬜ | |

## Store and service state

| | State | Id |
|---|---|---|
| Bundle id registered | ⬜ | |
| App Store Connect record | ⬜ | |
| iOS IAP created and priced | ⬜ | |
| Play Console app | ⬜ | |
| Play AAB uploaded (internal) | ⬜ | |
| Play in-app product | ⬜ | |
| AdMob apps (iOS + Android) | ⬜ | |
| AdMob ad units (6) | ⬜ | |
| AdMob GDPR + US-states messages published | ⬜ | |
| RevenueCat project, apps, entitlement, offering | ⬜ | |

## Decisions the owner owns

- Publish on altixcode.com and itsata.com? **Not yet asked.**

## Known UNKNOWNs

- Everything above marked ⬜.

## Android device pass — 2026-09-15, Pixel_Test (API 34)

Every claim below was read back from outside the app (storage, `dumpsys`, the
notification shade), not from the app's own screen.

| Claim | Proof |
|---|---|
| Three timers run independently | 23:56 and 4:58 counting down at different rates in one screenshot |
| Countdown is derived from the clock, not an interval | backgrounded at 1:15 remaining for 95 s, returned to `0:00` / Finished |
| State survives a full APK reinstall | Pomodoro read 13:19 after reinstall — still counting against wall-clock |
| Free tier caps at three | `RKStorage` still held exactly 3 timers after a 4th was attempted |
| The cap upsell is honest | Cancel and "Remove ads forever" given equal weight (screenshot 15) |
| Presets carry the right durations | Pomodoro wrote `durationMs: 1500000`, Short break `300000` |
| Banner ad serves | test banner visible in light and dark |
| Alert fires exactly on time | `window=0 exactAllowReason=policy_permission`; posted at 14:35:57 for a 14:35:57 alarm |
| Alert is audible | channel `timer-alerts`, `mImportance=5`, `mSound=content://settings/system/notification_sound` |
| Alert says what happened | shade showed "Pasta — Your timer has finished." |

### Three defects this pass found and fixed

1. **Every scheduled alert was inexact.** expo-notifications 57 only calls
   `setExactAndAllowWhileIdle` when `AlarmManager.canScheduleExactAlarms()` is
   true (`ExpoSchedulingDelegate.kt:106`). With no exact-alarm permission the
   emulator gave `window=+1m29s997ms` on a two-minute timer and `+18m44s` on a
   twenty-five-minute one, and the notification genuinely arrived minutes late.
   Fixed by declaring `USE_EXACT_ALARM` (auto-granted, and the permission Play
   intends for timer apps) plus `SCHEDULE_EXACT_ALARM` for API 31–32.
2. **Every alert was silent.** With no channel of its own, expo filed alerts
   under `expo_notifications_fallback_notification_channel` with `sound=null`.
   Fixed with a dedicated `timer-alerts` channel at MAX importance.
3. **The alert had no body** — the shade showed the bare word "Pasta". The call
   site passed `''`. Fixed with a translated `timerAlertBody` in all 14 locales.

All three are the same shape: a green test run said nothing, because the failure
was in what the OS did with a correctly-made call.

## iOS device pass — 2026-09-15, iPhone 17 simulator

| Claim | Proof |
|---|---|
| Launches and renders | home screen reached, app icon correct on springboard |
| ATT prompt carries our copy | "…Your data is never sold, and Multitick works exactly the same either way." |
| Ads still serve after ATT is DECLINED | test banner filled with tracking denied — non-personalised, as intended |
| Three timers, independent | Pomodoro / Tea / Pasta each with their own controls |
| Wall-clock accuracy across a relaunch | Pomodoro read 15:35 after terminate + relaunch, matching elapsed time |
| State persists | the cap alert fired after relaunch, so all three timers survived |
| Free tier caps at three | same alert as Android, Cancel given equal weight |
| Dark mode | list, settings and paywall all correct |
| Alert delivered while backgrounded | banner: "HIIT round — Your timer has finished." |

### A fourth defect this pass found

The paywall spun on "Loading price…" forever. It chose between a price and a
spinner on whether `lifetime` was set, so "still fetching" and "there is nothing
to fetch" were indistinguishable — on any device where billing is unavailable it
never resolved. The `offeringsResolved` fix existed in `_template` but Multitick
had been generated before it and never regenerated. **Sixteen other apps carried
the same stale copy**; all seventeen were re-rendered and committed together.

### Still UNKNOWN

- Purchase flow against a real offering (needs store products and a sandbox account).
- Ads under real consent in the EEA (needs a published UMP message).
- Interstitial and rewarded formats — only the banner has been seen serving.
