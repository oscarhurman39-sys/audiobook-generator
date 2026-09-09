# LEDGER

One next action per project. Phone-sized, concrete, binary.

## audiobook-generator [active]

brick: Install `audiobook-debug.apk` from https://github.com/oscarhurman39-sys/audiobook-generator/releases/tag/android-latest on your phone, play one chapter with the screen off, and note whether lock-screen controls and screen-off playback work.
since: 2026-09-09 sessions-unchanged: 0

Notes (verified 2026-09-09):

- Shipped: PR #1 merged the 13 phone-first commits into `main`; release workflow tagged `v0.32.0`; Android workflow published the `android-latest` pre-release with the APK (debug build, ~25.7 MB).
- CI (lint, type-check, unit tests) is green on `main`.
- E2E Smoke Tests workflow is red on `main`: the generation-and-export test fails on the runner and the job's 5-minute cap cancels it before artifacts upload. Not touched by PR #1; proposed workflow patch is in the PR #1 comment. Fix separately.
- No hosted deployment of the fork (GitHub Pages off), so the "PWA install" route still does not exist; the APK is the install route.
- [Unverified] behaviour on a real Android phone: screen-off playback, lock-screen controls, WebView performance. That is what the brick tests.

## Done

- 2026-09-09 — Open a PR from `claude/new-session-26dft1` into `main` and merge it. Shipped as PR #1.
