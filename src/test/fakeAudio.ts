/**
 * A controllable stand-in for `HTMLAudioElement`.
 *
 * jsdom does not implement media playback — `HTMLMediaElement.play()` throws
 * "Not implemented" — so any test that drives `audioPlaybackService` needs a
 * fake element it can also *steer*: fire `ended`, advance `currentTime`, report
 * a duration.
 *
 * The service creates its elements with `new Audio(url)` and keeps them
 * private, so instances register themselves here on construction. Tests reach
 * the element currently under the service's control via `latestAudio()`.
 */
import { vi } from 'vitest'

export class FakeAudio {
  static instances: FakeAudio[] = []

  src: string
  currentTime = 0
  duration = 10
  paused = true
  playbackRate = 1

  onended: (() => void) | null = null
  ontimeupdate: (() => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onloadedmetadata: (() => void) | null = null

  play = vi.fn(async (): Promise<void> => {
    this.paused = false
  })

  pause = vi.fn((): void => {
    this.paused = true
  })

  load = vi.fn()

  constructor(src = '') {
    this.src = src
    FakeAudio.instances.push(this)
    // Resolve metadata on the next macrotask so callers that await a
    // `loadedmetadata` round-trip (e.g. the service's duration probe) don't hang.
    setTimeout(() => this.onloadedmetadata?.(), 0)
  }

  /** Simulate the element reaching the end of its media. */
  end(): void {
    this.paused = true
    this.onended?.()
  }

  /** Simulate a `timeupdate` at the given position. */
  tick(seconds: number): void {
    this.currentTime = seconds
    this.ontimeupdate?.()
  }

  /** Simulate a playback error. */
  fail(event: unknown = new Event('error')): void {
    this.onerror?.(event)
  }
}

/**
 * Install `FakeAudio` as the global `Audio` constructor for the current test.
 * Returns helpers plus a `restore()` to put the original constructor back.
 */
export function installFakeAudio() {
  const original = globalThis.Audio
  FakeAudio.instances = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.Audio = FakeAudio as any

  return {
    get instances() {
      return FakeAudio.instances
    },
    /** The most recently constructed element — the one the service is driving. */
    latest(): FakeAudio {
      const audio = FakeAudio.instances[FakeAudio.instances.length - 1]
      if (!audio) throw new Error('No Audio element has been constructed yet')
      return audio
    },
    reset(): void {
      FakeAudio.instances = []
    },
    restore(): void {
      globalThis.Audio = original
      FakeAudio.instances = []
    },
  }
}
