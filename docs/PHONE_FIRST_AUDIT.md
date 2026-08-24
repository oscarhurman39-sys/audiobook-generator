# Phone-First Audiobook PWA — Repository Audit

Audit only. No application code was changed in this commit.

Scope: assess the current fork against the "personal, phone-first, installable
audiobook PWA" goal and produce a costed gap list. Reference plan:
`audiobook_app_fork_build_plan.md` (external document, not committed).

---

## 1. Baseline health

Run on this branch with `pnpm install --frozen-lockfile` (Node 22.22.2, pnpm 10.33.0):

| Check             | Result                                                     |
| ----------------- | ---------------------------------------------------------- |
| `pnpm test`       | **pass** — 608 passed, 9 expected-fail, 14 skipped (631)   |
| `pnpm type-check` | **pass** — exit 0                                          |
| `pnpm build`      | **pass** — exit 0, built in 8.5s                           |
| `pnpm test:e2e`   | not run in this environment (needs a browser + built EPUB) |

Note: `AGENTS.md` "Known issues" claims `pnpm build` and `pnpm type-check`
currently fail due to a `manualChunks` / rolldown type incompatibility. That is
**stale** — both pass as of commit `c35ff89`. Worth correcting so future agents
don't skip those gates.

---

## 2. The plan is out of date with the code

The build plan was written from an older README snapshot. Several items it lists
as work-to-do already exist in this fork:

| Plan item                                            | Actual status                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 4 — "Add manifest"                             | **Done.** `vite.config.ts` runs `VitePWA`; `dist/manifest.webmanifest` emits `display: standalone`, `start_url: /`, `scope: /`, theme + background colour. |
| Phase 4 — "Add service worker"                       | **Done.** Workbox `generateSW`, `registerType: 'prompt'`, update UI in `src/components/ReloadPrompt.svelte`.                                               |
| Phase 4 — "Installable standalone"                   | **Done** at config level. 192/512 icons present, iOS meta tags in `index.html`.                                                                            |
| Item 6 — "Introduce a clean `TTSProvider` interface" | **Done.** `src/lib/tts/ttsModels.ts` defines `TTSEngine` / `getTTSEngine(modelType)`; Kokoro and Piper both go through it.                                 |
| "Adaptive quality (mobile vs desktop)"               | **Done.** `src/lib/services/adaptiveQualityService.ts` + `src/lib/utils/mobileDetect.ts` implement a fast-pass / background-upgrade tier ladder.           |
| "Resume progress per book"                           | **Done**, via `localStorage` (`src/stores/progressStore.ts`), not IndexedDB.                                                                               |
| Phase 1 — fork/baseline verification                 | **Done** (section 1 above), except real-device Android Chrome testing.                                                                                     |

Practical effect: Phases 1 and 4 of the plan are largely already paid for, and
Phase 3's "provider abstraction" is done. The remaining value is concentrated in
the player, the voice experience, and real-device behaviour.

---

## 3. Architecture as it actually stands

```
UnifiedInput (file/URL)
  → parsers/{epubParser,pdfParser,htmlParser,txtParser}
  → bookLoader → libraryDB (IndexedDB: books, chapters, segments, merged audio)
  → segmentationService (DOM-based sentence split, preserves inline markup)
  → generationService (batching, retry, cancellation, wake lock, priority queue)
      → ttsWorkerManager (Web Worker, adaptive timeout, queue depth cap)
          → tts/ttsModels.getTTSEngine() → kokoroClient | piperClient
  → segmentProgressStore (per-segment generation state)
  → audioPlaybackService.svelte.ts (HTMLAudioElement; merged / progressive / on-demand)
  → AudioPlayerBar + TextReader / ContinuousReader (sentence highlighting)
  → exportService → audioConcat / mediabunnyEncoder / epubGenerator (MP3/M4B/WAV/EPUB3)
```

Good news for phone work: playback is built on `HTMLAudioElement`
(`src/lib/audioPlaybackService.svelte.ts:31`), not raw Web Audio buffers. That is
the correct backend for Android background/lock-screen audio — the plumbing needed
for Media Session is already the right shape.

---

## 4. Gaps that actually matter for the phone-first goal

Ordered by impact on the plan's own success criteria.

### 4.1 No Media Session API — blocks "lock the phone, resume later" (critical)

`grep -ri mediaSession src` returns nothing. There is no
`navigator.mediaSession.metadata`, no `setActionHandler`, no `setPositionState`.

Consequences on Android Chrome:

- no lock-screen / notification-shade transport controls
- no book title, chapter or cover art in the media notification
- headset and Bluetooth play/pause/skip buttons are not wired to the app
- `[Unverified]` Chrome is more likely to suspend or reclaim a backgrounded tab
  that has not declared itself a media session. This needs a real-device test to
  confirm severity; I can't verify Android behaviour from this container.

This is the single largest gap between the current app and success criteria 8–9
("Lock the phone. Resume later at the same point").

### 4.2 Voice choice is silently overridden for English books (high)

`resolveTierLadder()` in `src/lib/services/adaptiveQualityService.ts:46-58`
hard-codes the Kokoro voice as `af_heart` for every tier:

```ts
{ model: 'kokoro', voice: 'af_heart', quantization: 'q4', device: 'wasm' },  // tier 1
{ model: 'kokoro', voice: 'af_heart', quantization: 'q8', device: 'wasm' },  // tier 2
{ model: 'kokoro', voice: 'af_heart', quantization: 'fp16', device: 'auto' },// tier 3
```

The function's only inputs are `language` and `piperVoices` — the user's selected
voice is never passed in. `TextReader.svelte:397` (`triggerFastPass`) and
`TextReader.svelte:253` (`scheduleUpgradePass`) both call it without a voice, and
adaptive quality is **on by default**
(`appSettingsStore.ts:31-34`, `enabled: true`).

`af_heart` is an American female voice. So for an English book on the default
settings, picking `bf_emma` or `bm_george` does not change what the adaptive path
generates. Given British narration is a stated product goal, this is a real
defect, not a nit.

`[Unverified]` I have not confirmed on-device which of the two paths (adaptive
fast-pass vs. the plain `generationService` path) wins in every UI flow —
worth a runtime check before fixing, so the fix targets the right call site.

### 4.3 Player is short of audiobook-standard controls (high)

Present in `src/components/AudioPlayerBar.svelte`: play/pause, previous/next
segment, ±10s skip, speed, progress bar, keyboard shortcuts.

Missing:

| Feature                      | Evidence                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15/30s jump                  | `handleSkip10Back/Forward` hard-code ±10 (`AudioPlayerBar.svelte:71-79`)                                                                                        |
| Sleep timer                  | no match for `sleep` anywhere in `src/`                                                                                                                         |
| Bookmarks                    | no match for `bookmark` anywhere in `src/`                                                                                                                      |
| Auto-advance to next chapter | `onended` at `audioPlaybackService.svelte.ts:200` is an explicit no-op ("we don't auto-play here"); nothing else loads the following chapter at end of playback |

Note `generationService`'s `autoPlayEnabled` is a different thing — it starts
playback when the first segment of a _generating_ chapter is ready. It does not
chain chapter to chapter.

### 4.4 No "Continue listening" surface (medium)

`LandingPage.svelte` toggles between `upload` and `library` views; `LibraryView`
lists books with search/sort. Progress _is_ stored per book
(`progressStore.ts`, `localStorage` key `${PROGRESS_KEY}_${bookId}`) but nothing
surfaces a single resume-where-I-was card, which is the plan's home-screen
centrepiece.

### 4.5 Voice experience is a bare dropdown (medium)

`SettingsPage.svelte:221-223` renders a flat `<option>` list from
`listKokoroVoices()`. There is no British/American grouping, no preview sample,
no per-book voice audition. `voiceSelector.ts` already _knows_ the accent split
(`bf_`/`bm_` = British) — the metadata exists, the UI just doesn't use it.

### 4.6 PWA polish gaps (low, cheap to fix)

- `vite.config.ts` `includeAssets` lists `apple-touch-icon.png` and
  `mask-icon.svg`, but `public/` contains only `favicon.ico`,
  `pwa-192x192.png`, `pwa-512x512.png`. Two of three declared assets don't exist.
- No `purpose: 'maskable'` icon, so the Android home-screen icon gets letterboxed
  rather than filling the adaptive-icon mask.
- Precache is **45 entries / ~56 MB** (build output). That is a heavy first
  install over mobile data. `[Speculation]` most of that is the ONNX/WASM chunks;
  moving them to runtime caching would cut install size, but I have not measured
  the per-chunk split.
- `theme_color` is `#ffffff` only — no dark-mode variant, despite the app having
  light/dark/sepia themes.

### 4.7 Wake lock is for generation, not listening (informational)

`generationService.ts:211` requests a **screen** wake lock during generation.
That keeps the screen on while rendering audio — the opposite of what
lock-screen listening needs, and a battery cost on a phone. Not a bug, but the
interaction between screen-off, a throttled worker, and mid-book generation is
exactly what needs measuring on the actual device.

---

## 5. What I'd do, in order

Each step is small enough to ship and verify on its own.

1. **Media Session integration.** Wire `navigator.mediaSession` metadata (title,
   chapter, cover), `play`/`pause`/`seekbackward`/`seekforward`/`previoustrack`/
   `nexttrack` handlers, and `setPositionState` into
   `audioPlaybackService.svelte.ts`. Unit-test the handler wiring with a stubbed
   `navigator.mediaSession`. **Then test on the actual Android phone** — this
   step is not done until screen-off playback is confirmed by hand.
2. **Fix the adaptive-quality voice override.** Thread the effective voice into
   `resolveTierLadder()`, keeping quantization/device as the only tier variables.
   Regression test: a `bf_emma` selection produces `bf_emma` at every tier.
3. **Player controls.** Configurable 15/30s jump, sleep timer, end-of-chapter
   auto-advance. Auto-advance needs care — `onended` is deliberately a no-op, so
   the change belongs behind an explicit setting.
4. **"Continue listening" card** on the landing/library screen, reading from the
   existing `progressStore`.
5. **Voice audition screen** — group by accent using the `bf_`/`bm_` prefixes
   already in `voiceSelector.ts`, add a short preview sample per voice, persist
   the choice per book.
6. **PWA polish** — add the two missing icon assets, add a maskable icon, review
   the 56 MB precache.

Phases 5 (narration quality) and 6 (cloud provider) of the plan stay parked
until the above is real on the phone.

## 6. Harness note

Steps 1 and 3 change playback behaviour, which the unit suite covers only
partially (`audioPlaybackService.svelte.test.ts` is 314 lines against a 1291-line
service). Before changing playback, extend that test file to cover the current
`onended` / segment-chaining behaviour, so a regression is caught by the suite
rather than by a book stopping silently at the end of a chapter.
