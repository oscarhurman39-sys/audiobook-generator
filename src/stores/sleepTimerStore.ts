/**
 * Sleep timer.
 *
 * Two shapes, both standard in audiobook players:
 *  - a countdown of N minutes
 *  - "end of chapter", which waits for playback to finish rather than a clock
 *
 * The store owns the countdown and nothing else; it calls back when it expires
 * and the caller decides what stopping means. That keeps it testable with fake
 * timers and free of any dependency on the playback service.
 */
import { writable, get } from 'svelte/store'
import logger from '../lib/utils/logger'

export type SleepTimerMode = 'minutes' | 'end-of-chapter'

export interface SleepTimerState {
  active: boolean
  mode: SleepTimerMode | null
  /** Minutes originally requested; null for end-of-chapter. */
  totalMinutes: number | null
  /** Seconds left on the countdown; null for end-of-chapter. */
  remainingSeconds: number | null
}

/** Durations offered in the UI. */
export const SLEEP_TIMER_PRESETS = [5, 10, 15, 30, 45, 60] as const

const INITIAL_STATE: SleepTimerState = {
  active: false,
  mode: null,
  totalMinutes: null,
  remainingSeconds: null,
}

function createSleepTimerStore() {
  const store = writable<SleepTimerState>({ ...INITIAL_STATE })
  const { subscribe, set } = store

  let interval: ReturnType<typeof setInterval> | null = null
  let onExpire: (() => void) | null = null

  function clearInterval_() {
    if (interval !== null) {
      clearInterval(interval)
      interval = null
    }
  }

  function cancel() {
    clearInterval_()
    set({ ...INITIAL_STATE })
  }

  function expire() {
    clearInterval_()
    set({ ...INITIAL_STATE })
    try {
      onExpire?.()
    } catch (err) {
      logger.error('[SleepTimer] Expiry handler failed', err)
    }
  }

  return {
    subscribe,

    /**
     * Register what happens when the timer runs out. Set once by the player.
     */
    setExpiryHandler(handler: (() => void) | null) {
      onExpire = handler
    },

    /** Start (or restart) a countdown of `minutes`. */
    startMinutes(minutes: number) {
      if (!Number.isFinite(minutes) || minutes <= 0) return
      clearInterval_()

      set({
        active: true,
        mode: 'minutes',
        totalMinutes: minutes,
        remainingSeconds: Math.round(minutes * 60),
      })

      interval = setInterval(() => {
        const state = get(store)
        if (!state.active || state.remainingSeconds === null) {
          clearInterval_()
          return
        }

        const remainingSeconds = state.remainingSeconds - 1
        if (remainingSeconds <= 0) {
          expire()
          return
        }

        set({ ...state, remainingSeconds })
      }, 1000)
    },

    /** Arm the timer to stop when the current chapter finishes. */
    startEndOfChapter() {
      clearInterval_()
      set({
        active: true,
        mode: 'end-of-chapter',
        totalMinutes: null,
        remainingSeconds: null,
      })
    },

    /**
     * Tell the timer a chapter just finished. Fires the expiry handler only if
     * the timer is armed in end-of-chapter mode; returns whether it did, so the
     * caller can skip auto-advancing into the next chapter.
     */
    notifyChapterEnd(): boolean {
      const state = get(store)
      if (!state.active || state.mode !== 'end-of-chapter') return false
      expire()
      return true
    },

    cancel,

    /** Test seam: drop the interval without touching the handler. */
    _reset() {
      cancel()
      onExpire = null
    },
  }
}

export const sleepTimer = createSleepTimerStore()

/** Format remaining seconds as M:SS for display. */
export function formatSleepRemaining(remainingSeconds: number): string {
  const safe = Math.max(0, Math.floor(remainingSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
