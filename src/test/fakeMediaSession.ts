/**
 * A recording stand-in for `navigator.mediaSession`.
 *
 * jsdom implements neither `MediaSession` nor `MediaMetadata`, so tests that
 * check OS integration have to supply both. This records what the app publishes
 * (metadata, playback state, position state) and exposes the registered action
 * handlers so a test can fire them the way the lock screen would.
 */
import { vi } from 'vitest'

export interface FakeMediaMetadataInit {
  title?: string
  artist?: string
  album?: string
  artwork?: { src: string; sizes?: string; type?: string }[]
}

export class FakeMediaMetadata {
  title: string
  artist: string
  album: string
  artwork: { src: string; sizes?: string; type?: string }[]

  constructor(init: FakeMediaMetadataInit = {}) {
    this.title = init.title ?? ''
    this.artist = init.artist ?? ''
    this.album = init.album ?? ''
    this.artwork = init.artwork ?? []
  }
}

export interface FakePositionState {
  duration: number
  position: number
  playbackRate: number
}

export function installFakeMediaSession(options: { unsupportedActions?: string[] } = {}) {
  const unsupported = new Set(options.unsupportedActions ?? [])
  const handlers = new Map<string, ((details?: unknown) => void) | null>()
  const positionStates: (FakePositionState | null)[] = []

  const setActionHandler = vi.fn((action: string, handler: ((d?: unknown) => void) | null) => {
    if (unsupported.has(action)) {
      throw new TypeError(`Unsupported action: ${action}`)
    }
    handlers.set(action, handler)
  })

  const setPositionState = vi.fn((state?: FakePositionState) => {
    positionStates.push(state ?? null)
  })

  const mediaSession = {
    metadata: null as FakeMediaMetadata | null,
    playbackState: 'none' as string,
    setActionHandler,
    setPositionState,
  }

  const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession')
  const originalMetadata = (globalThis as Record<string, unknown>).MediaMetadata

  Object.defineProperty(navigator, 'mediaSession', {
    value: mediaSession,
    configurable: true,
    writable: true,
  })
  ;(globalThis as Record<string, unknown>).MediaMetadata = FakeMediaMetadata

  return {
    session: mediaSession,
    setActionHandler,
    setPositionState,
    get positionStates() {
      return positionStates
    },
    /** The most recent position state the app published. */
    latestPosition(): FakePositionState | null {
      const withValue = positionStates.filter((s): s is FakePositionState => s !== null)
      return withValue[withValue.length - 1] ?? null
    },
    /** Whether a handler is currently registered for an action. */
    hasHandler(action: string): boolean {
      return typeof handlers.get(action) === 'function'
    },
    /** Fire an action the way the OS would. */
    trigger(action: string, details?: unknown): void {
      const handler = handlers.get(action)
      if (typeof handler !== 'function') {
        throw new Error(`No handler registered for "${action}"`)
      }
      handler(details)
    },
    restore(): void {
      if (originalNavigatorDescriptor) {
        Object.defineProperty(navigator, 'mediaSession', originalNavigatorDescriptor)
      } else {
        delete (navigator as unknown as Record<string, unknown>).mediaSession
      }
      if (originalMetadata === undefined) {
        delete (globalThis as Record<string, unknown>).MediaMetadata
      } else {
        ;(globalThis as Record<string, unknown>).MediaMetadata = originalMetadata
      }
    },
  }
}

/** Remove the Media Session API entirely, to test the unsupported-browser path. */
export function removeMediaSession() {
  const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaSession')
  const originalMetadata = (globalThis as Record<string, unknown>).MediaMetadata

  delete (navigator as unknown as Record<string, unknown>).mediaSession
  delete (globalThis as Record<string, unknown>).MediaMetadata

  return {
    restore(): void {
      if (originalDescriptor) Object.defineProperty(navigator, 'mediaSession', originalDescriptor)
      if (originalMetadata !== undefined) {
        ;(globalThis as Record<string, unknown>).MediaMetadata = originalMetadata
      }
    },
  }
}
