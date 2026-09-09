/**
 * Media Session integration.
 *
 * Gives the OS what it needs to treat the app as a media player: lock-screen
 * and notification-shade transport controls, track metadata, and hardware /
 * Bluetooth button handling. On Android Chrome this is the difference between
 * "a tab that happens to make noise" and an audiobook player you can drive with
 * the screen off.
 *
 * Every entry point is a no-op when the API is unavailable, and every call is
 * wrapped: browsers throw on unsupported actions (Safari) and on out-of-range
 * position state, and none of that should be able to break playback.
 */
import logger from '../utils/logger'

export interface MediaSessionTrack {
  /** Shown as the primary line — the chapter. */
  title: string
  /** Shown as the secondary line — the book. */
  album?: string
  /** Shown alongside the title — the author, where we know it. */
  artist?: string
  /** Cover image URL (object URL or data URL). */
  artwork?: string
}

export interface MediaSessionHandlers {
  play: () => void
  pause: () => void
  stop?: () => void
  /** Called with the offset the OS asked for, or the app default. */
  seekBackward: (offset: number) => void
  seekForward: (offset: number) => void
  previousTrack?: () => void
  nextTrack?: () => void
  /** Absolute seek, in seconds from the start of the current media. */
  seekTo?: (time: number) => void
}

export interface MediaPositionState {
  duration: number
  position: number
  playbackRate: number
}

/** Default jump used when the OS does not specify one. */
export const DEFAULT_SEEK_OFFSET = 15

function getSession(): MediaSession | null {
  if (typeof navigator === 'undefined') return null
  const session = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession
  return session ?? null
}

export function isMediaSessionSupported(): boolean {
  return getSession() !== null
}

/** Publish what is playing. Safe to call on every chapter change. */
export function setMediaMetadata(track: MediaSessionTrack): void {
  const session = getSession()
  if (!session) return

  const MetadataCtor = (globalThis as { MediaMetadata?: typeof MediaMetadata }).MediaMetadata
  if (!MetadataCtor) return

  try {
    session.metadata = new MetadataCtor({
      title: track.title,
      artist: track.artist ?? '',
      album: track.album ?? '',
      artwork: track.artwork
        ? [
            { src: track.artwork, sizes: '256x256', type: 'image/png' },
            { src: track.artwork, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    })
  } catch (err) {
    logger.debug('[MediaSession] Failed to set metadata', err)
  }
}

export function setMediaPlaybackState(state: MediaSessionPlaybackState): void {
  const session = getSession()
  if (!session) return
  try {
    session.playbackState = state
  } catch (err) {
    logger.debug('[MediaSession] Failed to set playback state', err)
  }
}

/**
 * Publish the scrub-bar position.
 *
 * The spec rejects non-finite values, a negative or backwards duration, and a
 * position past the end — all of which occur naturally here while a segment's
 * metadata is still loading. Those cases are dropped rather than thrown.
 */
export function setMediaPositionState(state: MediaPositionState | null): void {
  const session = getSession()
  if (!session || typeof session.setPositionState !== 'function') return

  try {
    if (state === null) {
      session.setPositionState()
      return
    }

    const { duration, position, playbackRate } = state
    if (!Number.isFinite(duration) || duration <= 0) return
    if (!Number.isFinite(position) || position < 0) return
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) return

    session.setPositionState({
      duration,
      position: Math.min(position, duration),
      playbackRate,
    })
  } catch (err) {
    logger.debug('[MediaSession] Failed to set position state', err)
  }
}

/**
 * Register transport handlers. Actions the browser does not support throw on
 * assignment, so each is set independently and failures are ignored.
 *
 * `defaultSeekOffset` is used when the OS asks for a jump without naming a
 * size, so the lock-screen buttons match the size configured in the app.
 */
export function registerMediaHandlers(
  handlers: MediaSessionHandlers,
  defaultSeekOffset: number = DEFAULT_SEEK_OFFSET
): void {
  const session = getSession()
  if (!session || typeof session.setActionHandler !== 'function') return

  const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
    try {
      session.setActionHandler(action, handler)
    } catch {
      // Unsupported action for this browser — nothing to do.
    }
  }

  set('play', () => handlers.play())
  set('pause', () => handlers.pause())
  set('seekbackward', (details) => handlers.seekBackward(details?.seekOffset ?? defaultSeekOffset))
  set('seekforward', (details) => handlers.seekForward(details?.seekOffset ?? defaultSeekOffset))
  set('stop', handlers.stop ? () => handlers.stop!() : null)
  set('previoustrack', handlers.previousTrack ? () => handlers.previousTrack!() : null)
  set('nexttrack', handlers.nextTrack ? () => handlers.nextTrack!() : null)
  set(
    'seekto',
    handlers.seekTo
      ? (details) => {
          if (typeof details?.seekTime === 'number') handlers.seekTo!(details.seekTime)
        }
      : null
  )
}

/** Tear down metadata, handlers and position state. */
export function clearMediaSession(): void {
  const session = getSession()
  if (!session) return

  try {
    session.metadata = null
  } catch {
    // ignore
  }

  setMediaPlaybackState('none')
  setMediaPositionState(null)

  if (typeof session.setActionHandler === 'function') {
    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'stop',
      'seekbackward',
      'seekforward',
      'previoustrack',
      'nexttrack',
      'seekto',
    ]
    for (const action of actions) {
      try {
        session.setActionHandler(action, null)
      } catch {
        // ignore
      }
    }
  }
}
