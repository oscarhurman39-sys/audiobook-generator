import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { installFakeMediaSession, removeMediaSession } from '../../test/fakeMediaSession'
import {
  isMediaSessionSupported,
  setMediaMetadata,
  setMediaPlaybackState,
  setMediaPositionState,
  registerMediaHandlers,
  clearMediaSession,
  DEFAULT_SEEK_OFFSET,
} from './mediaSessionService'

const noopHandlers = {
  play: () => {},
  pause: () => {},
  seekBackward: () => {},
  seekForward: () => {},
}

describe('mediaSessionService', () => {
  let media: ReturnType<typeof installFakeMediaSession>

  beforeEach(() => {
    media = installFakeMediaSession()
  })

  afterEach(() => {
    media.restore()
  })

  describe('metadata', () => {
    it('publishes chapter, book and author', () => {
      setMediaMetadata({
        title: 'Chapter 17',
        album: 'Dune',
        artist: 'Frank Herbert',
      })

      expect(media.session.metadata).toMatchObject({
        title: 'Chapter 17',
        album: 'Dune',
        artist: 'Frank Herbert',
      })
    })

    it('publishes cover art at both sizes when a cover exists', () => {
      setMediaMetadata({ title: 'Chapter 1', artwork: 'blob:cover' })

      expect(media.session.metadata?.artwork).toEqual([
        { src: 'blob:cover', sizes: '256x256', type: 'image/png' },
        { src: 'blob:cover', sizes: '512x512', type: 'image/png' },
      ])
    })

    it('omits artwork when there is no cover', () => {
      setMediaMetadata({ title: 'Chapter 1' })

      expect(media.session.metadata?.artwork).toEqual([])
    })
  })

  describe('position state', () => {
    it('publishes a valid position', () => {
      setMediaPositionState({ duration: 100, position: 30, playbackRate: 1.5 })

      expect(media.latestPosition()).toEqual({ duration: 100, position: 30, playbackRate: 1.5 })
    })

    it('clamps a position past the end rather than throwing', () => {
      setMediaPositionState({ duration: 100, position: 150, playbackRate: 1 })

      expect(media.latestPosition()).toEqual({ duration: 100, position: 100, playbackRate: 1 })
    })

    it.each([
      ['NaN duration', { duration: NaN, position: 0, playbackRate: 1 }],
      ['Infinite duration', { duration: Infinity, position: 0, playbackRate: 1 }],
      ['zero duration', { duration: 0, position: 0, playbackRate: 1 }],
      ['negative position', { duration: 10, position: -1, playbackRate: 1 }],
      ['zero playback rate', { duration: 10, position: 1, playbackRate: 0 }],
    ])('drops an unpublishable state: %s', (_label, state) => {
      setMediaPositionState(state)

      expect(media.setPositionState).not.toHaveBeenCalled()
    })

    it('clears the position when passed null', () => {
      setMediaPositionState(null)

      expect(media.setPositionState).toHaveBeenCalledWith()
    })
  })

  describe('action handlers', () => {
    it('registers the full transport set', () => {
      registerMediaHandlers({
        ...noopHandlers,
        stop: () => {},
        previousTrack: () => {},
        nextTrack: () => {},
        seekTo: () => {},
      })

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

    it('passes the OS-requested seek offset through', () => {
      const offsets: number[] = []
      registerMediaHandlers({
        ...noopHandlers,
        seekForward: (offset) => offsets.push(offset),
        seekBackward: (offset) => offsets.push(-offset),
      })

      media.trigger('seekforward', { seekOffset: 30 })
      media.trigger('seekbackward', { seekOffset: 10 })

      expect(offsets).toEqual([30, -10])
    })

    it('uses the app-configured offset when the OS does not specify one', () => {
      const offsets: number[] = []
      registerMediaHandlers({ ...noopHandlers, seekForward: (offset) => offsets.push(offset) }, 30)

      media.trigger('seekforward')

      expect(offsets).toEqual([30])
    })

    it('falls back to the default offset when the OS does not specify one', () => {
      const offsets: number[] = []
      registerMediaHandlers({ ...noopHandlers, seekForward: (offset) => offsets.push(offset) })

      media.trigger('seekforward')
      media.trigger('seekforward', {})

      expect(offsets).toEqual([DEFAULT_SEEK_OFFSET, DEFAULT_SEEK_OFFSET])
    })

    it('ignores a seekto without a time', () => {
      const seeks: number[] = []
      registerMediaHandlers({ ...noopHandlers, seekTo: (time) => seeks.push(time) })

      media.trigger('seekto', {})
      media.trigger('seekto', { seekTime: 42 })

      expect(seeks).toEqual([42])
    })

    it('registers the supported actions even when one throws', () => {
      media.restore()
      media = installFakeMediaSession({ unsupportedActions: ['seekto', 'stop'] })

      expect(() =>
        registerMediaHandlers({ ...noopHandlers, stop: () => {}, seekTo: () => {} })
      ).not.toThrow()

      expect(media.hasHandler('play')).toBe(true)
      expect(media.hasHandler('seekforward')).toBe(true)
      expect(media.hasHandler('seekto')).toBe(false)
    })
  })

  describe('teardown', () => {
    it('clears metadata, state and every handler', () => {
      setMediaMetadata({ title: 'Chapter 1', album: 'Dune' })
      setMediaPlaybackState('playing')
      registerMediaHandlers({ ...noopHandlers, nextTrack: () => {} })

      clearMediaSession()

      expect(media.session.metadata).toBeNull()
      expect(media.session.playbackState).toBe('none')
      expect(media.hasHandler('play')).toBe(false)
      expect(media.hasHandler('nexttrack')).toBe(false)
    })
  })

  describe('unsupported browsers', () => {
    let removed: ReturnType<typeof removeMediaSession>

    beforeEach(() => {
      media.restore()
      removed = removeMediaSession()
    })

    afterEach(() => {
      removed.restore()
      media = installFakeMediaSession()
    })

    it('reports the API as unavailable', () => {
      expect(isMediaSessionSupported()).toBe(false)
    })

    it('makes every call a silent no-op', () => {
      expect(() => {
        setMediaMetadata({ title: 'Chapter 1' })
        setMediaPlaybackState('playing')
        setMediaPositionState({ duration: 10, position: 1, playbackRate: 1 })
        registerMediaHandlers(noopHandlers)
        clearMediaSession()
      }).not.toThrow()
    })
  })
})
