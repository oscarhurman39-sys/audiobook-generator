import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { sleepTimer, formatSleepRemaining, SLEEP_TIMER_PRESETS } from './sleepTimerStore'

describe('sleepTimerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sleepTimer._reset()
  })

  afterEach(() => {
    sleepTimer._reset()
    vi.useRealTimers()
  })

  describe('countdown', () => {
    it('starts inactive', () => {
      expect(get(sleepTimer)).toMatchObject({ active: false, mode: null })
    })

    it('counts down in seconds', () => {
      sleepTimer.startMinutes(2)
      expect(get(sleepTimer)).toMatchObject({
        active: true,
        mode: 'minutes',
        totalMinutes: 2,
        remainingSeconds: 120,
      })

      vi.advanceTimersByTime(30_000)
      expect(get(sleepTimer).remainingSeconds).toBe(90)
    })

    it('fires the expiry handler exactly once when it runs out', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)
      sleepTimer.startMinutes(1)

      vi.advanceTimersByTime(59_000)
      expect(onExpire).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1_000)
      expect(onExpire).toHaveBeenCalledTimes(1)

      // The interval must be gone, not merely ignored.
      vi.advanceTimersByTime(120_000)
      expect(onExpire).toHaveBeenCalledTimes(1)
    })

    it('goes inactive once it expires', () => {
      sleepTimer.startMinutes(1)
      vi.advanceTimersByTime(60_000)

      expect(get(sleepTimer)).toMatchObject({ active: false, mode: null, remainingSeconds: null })
    })

    it('restarting replaces the previous countdown', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)

      sleepTimer.startMinutes(1)
      vi.advanceTimersByTime(30_000)
      sleepTimer.startMinutes(5)

      expect(get(sleepTimer).remainingSeconds).toBe(300)

      // The first countdown's remaining 30s must not fire anything.
      vi.advanceTimersByTime(30_000)
      expect(onExpire).not.toHaveBeenCalled()
      expect(get(sleepTimer).remainingSeconds).toBe(270)
    })

    it('cancelling stops the countdown without firing', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)
      sleepTimer.startMinutes(1)

      sleepTimer.cancel()
      vi.advanceTimersByTime(120_000)

      expect(onExpire).not.toHaveBeenCalled()
      expect(get(sleepTimer).active).toBe(false)
    })

    it.each([0, -5, NaN, Infinity])('ignores an unusable duration: %s', (minutes) => {
      sleepTimer.startMinutes(minutes)

      expect(get(sleepTimer).active).toBe(false)
    })

    it('offers the standard presets', () => {
      expect(SLEEP_TIMER_PRESETS).toEqual([5, 10, 15, 30, 45, 60])
    })
  })

  describe('end of chapter', () => {
    it('waits for a chapter to finish rather than a clock', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)
      sleepTimer.startEndOfChapter()

      expect(get(sleepTimer)).toMatchObject({
        active: true,
        mode: 'end-of-chapter',
        remainingSeconds: null,
      })

      vi.advanceTimersByTime(60 * 60_000)
      expect(onExpire).not.toHaveBeenCalled()

      expect(sleepTimer.notifyChapterEnd()).toBe(true)
      expect(onExpire).toHaveBeenCalledTimes(1)
      expect(get(sleepTimer).active).toBe(false)
    })

    it('does not claim a chapter end when it is not armed', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)

      expect(sleepTimer.notifyChapterEnd()).toBe(false)
      expect(onExpire).not.toHaveBeenCalled()
    })

    it('does not claim a chapter end while a countdown is running', () => {
      const onExpire = vi.fn()
      sleepTimer.setExpiryHandler(onExpire)
      sleepTimer.startMinutes(30)

      expect(sleepTimer.notifyChapterEnd()).toBe(false)
      expect(onExpire).not.toHaveBeenCalled()
      expect(get(sleepTimer).active).toBe(true)
    })

    it('survives an expiry handler that throws', () => {
      sleepTimer.setExpiryHandler(() => {
        throw new Error('player exploded')
      })
      sleepTimer.startEndOfChapter()

      expect(() => sleepTimer.notifyChapterEnd()).not.toThrow()
      expect(get(sleepTimer).active).toBe(false)
    })
  })

  describe('formatSleepRemaining', () => {
    it.each([
      [0, '0:00'],
      [9, '0:09'],
      [60, '1:00'],
      [125, '2:05'],
      [3599, '59:59'],
    ])('formats %i seconds as %s', (seconds, expected) => {
      expect(formatSleepRemaining(seconds)).toBe(expected)
    })

    it('clamps a negative remainder', () => {
      expect(formatSleepRemaining(-30)).toBe('0:00')
    })
  })
})
