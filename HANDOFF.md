# Multitick — handoff

What was actually run, and what is still unknown. **Unverified is `UNKNOWN`,
never a pass** — a green build is not a verification.

Last updated: 2026-09-15

## Verification state

| Gate | State | Evidence |
|---|---|---|
| Lint | ✅ | `npm run verify` 2026-09-15 |
| Typecheck | ✅ | `npm run verify` 2026-09-15 |
| Unit tests | ✅ | `npm run verify` 2026-09-15 |
| i18n completeness (14 locales) | ✅ | `npm run check:i18n`, 14 locales complete |
| UI rules (colour tokens, `t()`) | ✅ | `npm run check:ui` |
| iOS + Android bundle export | ✅ | `expo export` both platforms, 2026-09-15 |
| CI green on a self-hosted runner | ✅ | success — run 34977840570, 2026-09-15 |
| `check:release` with real identifiers | ✅ | passed in CI with the real identifiers (same run) |
| Builds, installs, launches on the iOS simulator | ⬜ | not run here; device passes belong to dev-7b |
| Renders in light **and** dark on device | ⬜ | not run here |
| Every feature driven on the Android emulator | ⬜ | not run here |
| Purchase flow exercised against a real offering | ⬜ | needs a build on hardware |
| Ads served under real consent | ⬜ | needs a build on hardware |

`check:release` fails in a normal shell on purpose: the identifiers are GitHub
Actions secrets, never files in the repo. A local failure means "this shell has
no secrets", not "the app is misconfigured". CI is where that gate means
something, because CI is where the values are.

## Store and service state

| | State | Id |
|---|---|---|
| Bundle id registered | ✅ | `com.altixcode.multitick` |
| App Store Connect record | ✅ | `6812380538` — store name "Multitick" |
| App Store category | ✅ | UTILITIES / PRODUCTIVITY |
| Reviewer contact and notes | ✅ | set 2026-09-15, notes written for this app |
| App Store availability (territories) | ⬜ | not set |
| iOS IAP created and priced | ⬜ | not created |
| Play Console app | ⬜ | blocked — console create returns a generic error, raised with the owner |
| AdMob app — iOS | ✅ | `ca-app-pub-2504845459806550~9432480886` |
| AdMob app — Android | ✅ | `ca-app-pub-2504845459806550~8119399218` |
| AdMob ad units (6) | ✅ | iOS banner/interstitial/rewarded `2556081343` / `5952400875` / `2255417189`; Android `4639319201` / `3092277120` / `1779195456` |
| AdMob ids wired into CI | ✅ | all ten secrets present on the repo |
| AdMob GDPR + US-states messages published | ✅ | published account-wide, covers every app |
| RevenueCat project, apps, entitlement, offering | ✅ | project `proj394d7ace`, entitlement `entla839252ff7`, offering `ofrng22f5413440` |
| RevenueCat In-App Purchase Key | ❌ | missing account-wide — see below |

## Decisions the owner owns

- Publish on altixcode.com and itsata.com? **Not yet asked.**

## Known UNKNOWNs

- **Nothing on this app has run on real hardware.** Launch, the core flow, the
  purchase and the ads are unverified, and the rows above say so.
- **RevenueCat has no In-App Purchase Key**, account-wide across all 44 apps.
  Without it StoreKit 2 validation is degraded, which shows up as a purchase
  that succeeds on device and never grants the entitlement — the user pays and
  the ads stay. Being handled by dev-3a.
- The iOS record still needs territories, an IAP and a build before it can be
  submitted.
