# LEDGER

One next action per project. Phone-sized, concrete, binary.

## audiobook-generator [active]

brick: Install the new `audiobook-debug.apk` from https://github.com/oscarhurman39-sys/audiobook-generator/releases/tag/android-latest, open a book and tap Generate on one chapter. If it still stalls: Settings → Diagnostics → Run → Share, and paste the text into the chat.
since: 2026-09-09 sessions-unchanged: 0

Notes (verified 2026-09-09):

- First phone test of the 12:55 APK failed: model pill stuck on "Loading: done", generation 0/540, reader never loaded. Cause found in code: main-thread Kokoro warm-up on phones, and the "q4" mobile profile is the larger model file, not the smaller one. Fixed in PR #3 together with a Settings → Diagnostics screen (device facts + last 300 log lines, copy/share) so the next report carries the phone's own evidence.

- Shipped: PR #1 merged the 13 phone-first commits into `main`; release workflow tagged `v0.32.0`; Android workflow published the `android-latest` pre-release with the APK (debug build, ~25.7 MB).
- CI (lint, type-check, unit tests) is green on `main`.
- E2E Smoke Tests workflow is green as of PR #2. Root cause was the test, not the app: import auto-generates all five chapters, so the bare `✓ Generated` locator matched five cards and tripped Playwright's strict mode. Job cap raised to 30 min and artifacts upload on every outcome.
- No hosted deployment of the fork (GitHub Pages off), so the "PWA install" route still does not exist; the APK is the install route.
- [Unverified] behaviour on a real Android phone: screen-off playback, lock-screen controls, WebView performance. That is what the brick tests.

## Done

- 2026-09-09 — Open a PR from `claude/new-session-26dft1` into `main` and merge it. Shipped as PR #1.
- 2026-09-09 — Fix the E2E smoke workflow. Shipped as PR #2.
- 2026-09-09 — Install the APK and test on the phone. Done: it failed, and the failure was diagnosed from code. Fix shipped as PR #3.
