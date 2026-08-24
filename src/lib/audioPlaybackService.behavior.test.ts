/**
 * Characterization tests for `audioPlaybackService`.
 *
 * PURPOSE
 * These tests pin the playback behaviour that exists *today*, before Media
 * Session support, configurable 15/30s jumps and end-of-chapter auto-advance
 * are added. They are deliberately descriptive rather than aspirational: where
 * the current behaviour is a gap (playback simply stops at the end of a
 * chapter; nothing touches `navigator.mediaSession`) the test asserts the gap,
 * so the change that closes it fails loudly here and the author has to update
 * the pin on purpose.
 *
 * WHY THIS FILE EXISTS ALONGSIDE audioPlaybackService.svelte.test.ts
 * That file states the service "cannot be unit tested in isolation" because of
 * Svelte runes, and substitutes toy re-implementations for real assertions.
 * That is no longer true: the service imports and runs fine once
 * `vitest.config.ts` loads `@sveltejs/vite-plugin-svelte`, which compiles
 * `.svelte.ts` modules. This file drives the real service.
 *
 * THE THREE onended PATHS
 * The service ends media in three different places, and each would need
 * separate wiring for chapter auto-advance:
 *   1. per-segment chaining   — playCurrentSegment (progressive / on-demand)
 *   2. merged chapter audio   — loadChapter, single concatenated file
 *   3. progressive chaining   — playSingleSegment, driven by segmentProgressStore
 * Paths 1 and 2 are covered below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installFakeAudio } from '../test/fakeAudio'
import { installFakeMediaSession } from '../test/fakeMediaSession'
import { setupMockURL, createMockSpeechSynthesis } from '../test/svelteRunesTestUtils'
import type { AudioSegment } from './types/audio'
import type { Chapter } from './types/book'

// Mutable fake IndexedDB layer. Declared via vi.hoisted so the (hoisted) mock
// factory below can close over it without a TDZ error.
const dbState = vi.hoisted(() => ({
  segments: [] as unknown[],
  mergedAudio: null as Blob | null,
}))

vi.mock('./libraryDB', () => ({
  getChapterSegments: async () => dbState.segments,
  getChapterAudio: async () => dbState.mergedAudio,
  saveChapterSegments: async () => {},
  // Pulled in transitively by bookStore, which the service reads for cover art.
  getBookGenerationStatus: async () => new Set<string>(),
}))

// Neutralise real TTS: no worker is spawned, generation always succeeds fast.
vi.mock('./ttsWorkerManager', () => ({
  getTTSWorker: () => ({
    generateVoice: async () => new Blob(['fake-audio'], { type: 'audio/wav' }),
    cancelAll: () => {},
  }),
}))

type AudioService = (typeof import('./audioPlaybackService.svelte'))['audioService']

/** The service is a module singleton; reset modules to get a clean instance. */
async function freshService(): Promise<AudioService> {
  vi.resetModules()
  const mod = await import('./audioPlaybackService.svelte')
  return mod.audioService
}

/**
 * The book store instance belonging to the current module registry — i.e. the
 * same one the service just imported. Call only after `freshService()`.
 */
async function currentBookStore() {
  return (await import('../stores/bookStore')).book
}

function makeChapter(sentences: string[]): Chapter {
  return {
    id: 'ch1',
    title: 'Chapter One',
    content: sentences.map((s) => `<p>${s}</p>`).join(''),
  }
}

function makeSegment(index: number, text: string, chapterId = 'ch1'): AudioSegment {
  return {
    id: `${chapterId}-${index}`,
    chapterId,
    index,
    text,
    audioBlob: new Blob([`audio-${index}`], { type: 'audio/wav' }),
    duration: 5,
    startTime: index * 5,
  }
}

/**
 * Put the service into per-segment (progressive) playback mode with every
 * segment's audio already present, so nothing needs generating mid-test.
 */
async function initWithAudio(service: AudioService, sentences: string[]): Promise<void> {
  await service.initialize(null, 'Test Book', makeChapter(sentences), {
    voice: 'bf_emma',
    quantization: 'q8',
  })
  service.segments.forEach((segment, index) => {
    service.injectProgressiveSegment(makeSegment(index, segment.text))
  })
}

describe('audioPlaybackService — current playback behaviour', () => {
  let audio: ReturnType<typeof installFakeAudio>
  let media: ReturnType<typeof installFakeMediaSession>

  beforeEach(() => {
    setupMockURL()
    audio = installFakeAudio()
    media = installFakeMediaSession()
    // jsdom implements neither media playback nor the Web Speech API; the
    // service touches speechSynthesis on every stop().
    Object.defineProperty(window, 'speechSynthesis', {
      value: createMockSpeechSynthesis(),
      configurable: true,
      writable: true,
    })
    dbState.segments = []
    dbState.mergedAudio = null
  })

  afterEach(() => {
    audio.restore()
    media.restore()
    vi.restoreAllMocks()
  })

  // --------------------------------------------------------------------------
  // Setup sanity — if these break, every pin below is meaningless
  // --------------------------------------------------------------------------

  describe('test harness', () => {
    it('instantiates the runes-based service (requires the Svelte plugin in vitest.config)', async () => {
      const service = await freshService()

      expect(service.isPlaying).toBe(false)
      expect(service.segments).toEqual([])
      expect(service.currentSegmentIndex).toBe(-1)
    })

    it('splits a chapter into one segment per sentence', async () => {
      const service = await freshService()
      await initWithAudio(service, ['First sentence.', 'Second sentence.', 'Third sentence.'])

      expect(service.segments).toHaveLength(3)
      expect(service.segments[0].text).toContain('First sentence')
      expect(service.currentSegmentIndex).toBe(0)
    })
  })

  // --------------------------------------------------------------------------
  // 1. Per-segment chaining (progressive / on-demand mode)
  // --------------------------------------------------------------------------

  describe('segment chaining', () => {
    it('advances to the next segment when the current one ends', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])

      await service.playFromSegment(0)
      expect(service.isPlaying).toBe(true)
      expect(service.currentSegmentIndex).toBe(0)

      audio.latest().end()

      expect(service.currentSegmentIndex).toBe(1)
      expect(service.isPlaying).toBe(true)
    })

    it('chains through every segment in the chapter', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])

      await service.playFromSegment(0)
      audio.latest().end()
      audio.latest().end()

      expect(service.currentSegmentIndex).toBe(2)
      expect(service.isPlaying).toBe(true)
    })

    it('does not advance when playback was paused before the segment ended', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])

      await service.playFromSegment(0)
      const playing = audio.latest()
      service.pause()
      playing.end()

      expect(service.currentSegmentIndex).toBe(0)
      expect(service.isPlaying).toBe(false)
    })

    /**
     * PINS A KNOWN GAP — see docs/PHONE_FIRST_AUDIT.md §4.3.
     * At the end of the last segment the service stops. It does not load or
     * start the following chapter, and exposes no hook for doing so.
     * Auto-advance work must replace this test rather than delete it.
     */
    it('stops at the end of the chapter instead of advancing to the next one', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])

      await service.playFromSegment(1)
      expect(service.currentSegmentIndex).toBe(1)

      audio.latest().end()

      expect(service.isPlaying).toBe(false)
      expect(service.currentSegmentIndex).toBe(1)
      // Chapter state is untouched — nothing was loaded to follow it.
      expect(service.segments).toHaveLength(2)
    })
  })

  // --------------------------------------------------------------------------
  // 2. Merged chapter audio
  // --------------------------------------------------------------------------

  describe('merged chapter audio', () => {
    async function loadMerged(service: AudioService, sentences: string[]) {
      dbState.segments = sentences.map((text, i) => makeSegment(i, text))
      dbState.mergedAudio = new Blob(['merged'], { type: 'audio/wav' })
      return service.loadChapter(1, 'Test Book', makeChapter(sentences))
    }

    it('loads a single element with time-based segment tracking', async () => {
      const service = await freshService()
      const result = await loadMerged(service, ['One.', 'Two.', 'Three.'])

      expect(result).toEqual({ success: true, hasAudio: true })
      expect(service.segments).toHaveLength(3)
      // Last segment starts at 10s and runs 5s.
      expect(service.duration).toBe(15)
    })

    it('tracks the current segment from playback position', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.', 'Three.'])

      audio.latest().tick(7)
      expect(service.currentSegmentIndex).toBe(1)

      audio.latest().tick(12)
      expect(service.currentSegmentIndex).toBe(2)
    })

    /** PINS THE SAME GAP as above, on the merged-audio path. */
    it('stops at the end of the file instead of advancing to the next chapter', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])
      await service.play()
      expect(service.isPlaying).toBe(true)

      audio.latest().end()

      expect(service.isPlaying).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // 3. Skip semantics — currently ±10s, hard-coded at the call site
  // --------------------------------------------------------------------------

  describe('skip()', () => {
    it('seeks forward by the requested number of seconds', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      const element = audio.latest()
      element.duration = 60
      element.currentTime = 20

      service.skip(10)
      expect(element.currentTime).toBe(30)

      // The audiobook-standard 30s jump is not wired to a button yet, but the
      // service already accepts any offset.
      service.skip(30)
      expect(element.currentTime).toBe(60)
    })

    it('clamps a backward seek at the start of the media', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      const element = audio.latest()
      element.duration = 60
      element.currentTime = 4

      service.skip(-10)
      expect(element.currentTime).toBe(0)
    })

    it('clamps a forward seek at the end of the media', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      const element = audio.latest()
      element.duration = 30
      element.currentTime = 25

      service.skip(10)
      expect(element.currentTime).toBe(30)
    })

    it('seeks within the current segment only — it does not cross segment boundaries', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])
      await service.playFromSegment(0)

      const element = audio.latest()
      element.duration = 5
      element.currentTime = 4

      service.skip(10)

      // Time is clamped to this segment's own media; the index is unchanged.
      expect(element.currentTime).toBe(5)
      expect(service.currentSegmentIndex).toBe(0)
    })
  })

  describe('skipNext / skipPrevious', () => {
    it('moves one segment at a time', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])
      await service.playFromSegment(0)

      await service.skipNext()
      expect(service.currentSegmentIndex).toBe(1)

      await service.skipPrevious()
      expect(service.currentSegmentIndex).toBe(0)
    })

    it('is a no-op at the chapter boundaries', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])

      await service.playFromSegment(0)
      await service.skipPrevious()
      expect(service.currentSegmentIndex).toBe(0)

      await service.playFromSegment(1)
      await service.skipNext()
      expect(service.currentSegmentIndex).toBe(1)
    })
  })

  // --------------------------------------------------------------------------
  // 4. Transport state
  // --------------------------------------------------------------------------

  describe('play / pause / speed', () => {
    it('pauses the underlying element without losing position', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      const element = audio.latest()
      element.tick(3)
      service.pause()

      expect(service.isPlaying).toBe(false)
      expect(element.pause).toHaveBeenCalled()
      expect(service.currentSegmentIndex).toBe(0)
      expect(service.currentTime).toBe(3)
    })

    it('applies playback speed to the current and to subsequently created elements', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      service.setSpeed(1.5)
      expect(audio.latest().playbackRate).toBe(1.5)

      // The next segment's element inherits it.
      audio.latest().end()
      expect(audio.latest().playbackRate).toBe(1.5)
    })

    it('toggles between playing and paused', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.'])
      await service.playFromSegment(0)

      service.togglePlayPause()
      expect(service.isPlaying).toBe(false)

      service.togglePlayPause()
      expect(service.isPlaying).toBe(true)
    })
  })

  // --------------------------------------------------------------------------
  // 5. Teardown — the cross-chapter bleed guard
  // --------------------------------------------------------------------------

  describe('stop()', () => {
    it('clears segments and resets position', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])
      await service.playFromSegment(1)

      service.stop()

      expect(service.segments).toEqual([])
      expect(service.currentSegmentIndex).toBe(-1)
      expect(service.isPlaying).toBe(false)
    })

    it('revokes every segment blob URL it created', async () => {
      const service = await freshService()
      const urls = setupMockURL()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])

      const createdForSegments = urls.createdUrls.length
      expect(createdForSegments).toBe(3)

      service.stop()

      for (const url of urls.createdUrls) {
        expect(urls.revokedUrls).toContain(url)
      }
    })

    it('runs on initialize, so a new chapter cannot inherit the previous one', async () => {
      const service = await freshService()
      await initWithAudio(service, ['One.', 'Two.', 'Three.'])
      await service.playFromSegment(2)

      await initWithAudio(service, ['Only one sentence.'])

      expect(service.segments).toHaveLength(1)
      expect(service.currentSegmentIndex).toBe(0)
      expect(service.isPlaying).toBe(false)
    })
  })

  // --------------------------------------------------------------------------
  // 6. Media Session — the OS integration that makes lock-screen listening work
  // --------------------------------------------------------------------------

  describe('Media Session', () => {
    async function loadMerged(service: AudioService, sentences: string[]) {
      dbState.segments = sentences.map((text, i) => makeSegment(i, text))
      dbState.mergedAudio = new Blob(['merged'], { type: 'audio/wav' })
      return service.loadChapter(1, 'Dune', makeChapter(sentences))
    }

    it('publishes the chapter and book when a chapter loads', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])

      expect(media.session.metadata).toMatchObject({
        title: 'Chapter One',
        album: 'Dune',
      })
    })

    it('publishes the author and cover from the loaded book', async () => {
      const service = await freshService()
      const bookStore = await currentBookStore()
      bookStore.set({
        title: 'Dune',
        author: 'Frank Herbert',
        cover: 'blob:cover-art',
        chapters: [],
      })

      await loadMerged(service, ['One.', 'Two.'])

      expect(media.session.metadata).toMatchObject({
        artist: 'Frank Herbert',
      })
      expect(media.session.metadata?.artwork?.[0]?.src).toBe('blob:cover-art')
    })

    it('registers the transport controls', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])

      for (const action of [
        'play',
        'pause',
        'stop',
        'seekbackward',
        'seekforward',
        'previoustrack',
        'nexttrack',
        'seekto',
      ]) {
        expect(media.hasHandler(action)).toBe(true)
      }
    })

    it('reflects play and pause in the OS playback state', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])

      await service.play()
      expect(media.session.playbackState).toBe('playing')

      service.pause()
      expect(media.session.playbackState).toBe('paused')
    })

    it('publishes the scrub position, including playback rate', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])

      const element = audio.latest()
      element.duration = 30
      service.setSpeed(1.5)
      element.tick(12)

      expect(media.latestPosition()).toEqual({
        duration: 30,
        position: 12,
        playbackRate: 1.5,
      })
    })

    it('throttles position updates to one a second', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])
      const element = audio.latest()
      element.duration = 30

      element.tick(5.0)
      const afterFirst = media.setPositionState.mock.calls.length

      element.tick(5.25)
      element.tick(5.5)
      element.tick(5.75)
      expect(media.setPositionState.mock.calls.length).toBe(afterFirst)

      element.tick(6.0)
      expect(media.setPositionState.mock.calls.length).toBe(afterFirst + 1)
    })

    describe('OS controls drive playback', () => {
      it('play and pause', async () => {
        const service = await freshService()
        await loadMerged(service, ['One.', 'Two.'])

        media.trigger('play')
        await Promise.resolve()
        expect(service.isPlaying).toBe(true)

        media.trigger('pause')
        expect(service.isPlaying).toBe(false)
      })

      it('seek forward and back by the offset the OS asks for', async () => {
        const service = await freshService()
        await loadMerged(service, ['One.', 'Two.'])

        const element = audio.latest()
        element.duration = 100
        element.currentTime = 50

        media.trigger('seekforward', { seekOffset: 30 })
        expect(element.currentTime).toBe(80)

        media.trigger('seekbackward', { seekOffset: 15 })
        expect(element.currentTime).toBe(65)
      })

      it('absolute seek from the scrub bar', async () => {
        const service = await freshService()
        await loadMerged(service, ['One.', 'Two.'])

        const element = audio.latest()
        element.duration = 100

        media.trigger('seekto', { seekTime: 42 })
        expect(element.currentTime).toBe(42)
      })

      it('clamps an absolute seek to the media bounds', async () => {
        const service = await freshService()
        await loadMerged(service, ['One.', 'Two.'])

        const element = audio.latest()
        element.duration = 100

        media.trigger('seekto', { seekTime: 500 })
        expect(element.currentTime).toBe(100)

        media.trigger('seekto', { seekTime: -20 })
        expect(element.currentTime).toBe(0)
      })

      it('next and previous move between segments', async () => {
        const service = await freshService()
        await initWithAudio(service, ['One.', 'Two.', 'Three.'])
        await service.playFromSegment(0)

        media.trigger('nexttrack')
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(service.currentSegmentIndex).toBe(1)

        media.trigger('previoustrack')
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(service.currentSegmentIndex).toBe(0)
      })
    })

    it('tears the session down on stop, so no stale controls linger', async () => {
      const service = await freshService()
      await loadMerged(service, ['One.', 'Two.'])
      await service.play()

      service.stop()

      expect(media.session.metadata).toBeNull()
      expect(media.session.playbackState).toBe('none')
      expect(media.hasHandler('play')).toBe(false)
    })
  })
})
