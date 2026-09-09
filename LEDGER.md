# LEDGER

One next action per project. Phone-sized, concrete, binary.

## audiobook-generator [active]

brick: Open a PR from `claude/new-session-26dft1` into `main` and merge it — the 13 commits of phone-first work (media session, sleep timer, voice audition, Android APK CI) are stranded off main until then.
since: 2026-09-09 sessions-unchanged: 0

Notes (verified 2026-09-09):

- `main` is pure upstream (Cabeda/audiobook-generator @ c35ff89). Zero commits by Oscar on main.
- `claude/new-session-26dft1` = main + 13 commits. Lint, type-check, 762 unit tests, build, and 15 browser smoke tests all pass.
- Debug APK built by CI from that branch: Actions artifact `audiobook-debug-apk` (expires 2026-09-24). No GitHub release exists; the `android-latest` release only refreshes on pushes to main.
- No hosted deployment of the fork (GitHub Pages off), so the "PWA install" route does not exist yet.
- [Unverified] behaviour on a real Android phone: screen-off playback, lock-screen controls, WebView performance.
