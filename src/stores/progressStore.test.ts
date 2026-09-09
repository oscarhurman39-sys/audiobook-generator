import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveProgress,
  loadProgress,
  clearProgress,
  listAllProgress,
  getMostRecentProgress,
} from './progressStore'

const PREFIX = 'audiobook_progress_'

describe('progressStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('per-book position', () => {
    it('round-trips a saved position', () => {
      saveProgress('7', 'ch-3', 42)

      expect(loadProgress('7')).toMatchObject({
        bookId: '7',
        chapterId: 'ch-3',
        segmentIndex: 42,
      })
    })

    it('returns null for a book with no position', () => {
      expect(loadProgress('nope')).toBeNull()
    })

    it('clears a position', () => {
      saveProgress('7', 'ch-3', 42)
      clearProgress('7')

      expect(loadProgress('7')).toBeNull()
    })

    it('keeps books independent', () => {
      saveProgress('1', 'ch-1', 5)
      saveProgress('2', 'ch-9', 90)

      expect(loadProgress('1')?.chapterId).toBe('ch-1')
      expect(loadProgress('2')?.chapterId).toBe('ch-9')
    })
  })

  describe('listAllProgress', () => {
    it('returns nothing when no book has been opened', () => {
      expect(listAllProgress()).toEqual([])
    })

    it('returns every book, most recently listened first', () => {
      localStorage.setItem(
        `${PREFIX}1`,
        JSON.stringify({ bookId: '1', chapterId: 'a', segmentIndex: 1, timestamp: 100 })
      )
      localStorage.setItem(
        `${PREFIX}2`,
        JSON.stringify({ bookId: '2', chapterId: 'b', segmentIndex: 2, timestamp: 300 })
      )
      localStorage.setItem(
        `${PREFIX}3`,
        JSON.stringify({ bookId: '3', chapterId: 'c', segmentIndex: 3, timestamp: 200 })
      )

      expect(listAllProgress().map((p) => p.bookId)).toEqual(['2', '3', '1'])
    })

    it('ignores unrelated localStorage keys', () => {
      localStorage.setItem('audiobook_player_state', JSON.stringify({ bookId: 'x' }))
      localStorage.setItem('theme', 'dark')
      saveProgress('5', 'ch-1', 0)

      expect(listAllProgress().map((p) => p.bookId)).toEqual(['5'])
    })

    it('skips a corrupt entry without losing the rest', () => {
      localStorage.setItem(`${PREFIX}broken`, '{not json')
      saveProgress('5', 'ch-1', 0)

      expect(listAllProgress().map((p) => p.bookId)).toEqual(['5'])
    })

    it('skips an entry missing required fields', () => {
      localStorage.setItem(`${PREFIX}partial`, JSON.stringify({ bookId: '9' }))
      saveProgress('5', 'ch-1', 0)

      expect(listAllProgress().map((p) => p.bookId)).toEqual(['5'])
    })

    it('treats a missing timestamp as oldest rather than dropping the entry', () => {
      localStorage.setItem(
        `${PREFIX}9`,
        JSON.stringify({ bookId: '9', chapterId: 'a', segmentIndex: 1 })
      )
      saveProgress('5', 'ch-1', 0)

      expect(listAllProgress().map((p) => p.bookId)).toEqual(['5', '9'])
    })
  })

  describe('getMostRecentProgress', () => {
    it('returns null when nothing has been listened to', () => {
      expect(getMostRecentProgress()).toBeNull()
    })

    it('returns the latest position', () => {
      localStorage.setItem(
        `${PREFIX}1`,
        JSON.stringify({ bookId: '1', chapterId: 'a', segmentIndex: 1, timestamp: 100 })
      )
      localStorage.setItem(
        `${PREFIX}2`,
        JSON.stringify({ bookId: '2', chapterId: 'b', segmentIndex: 7, timestamp: 500 })
      )

      expect(getMostRecentProgress()).toMatchObject({ bookId: '2', segmentIndex: 7 })
    })
  })
})
