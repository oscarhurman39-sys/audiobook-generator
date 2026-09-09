export interface Progress {
  bookId: string
  chapterId: string
  segmentIndex: number
  timestamp: number
}

const PROGRESS_KEY = 'audiobook_progress'

export function saveProgress(bookId: string, chapterId: string, segmentIndex: number) {
  try {
    const progress: Progress = { bookId, chapterId, segmentIndex, timestamp: Date.now() }
    localStorage.setItem(`${PROGRESS_KEY}_${bookId}`, JSON.stringify(progress))
  } catch (e) {
    console.warn('Failed to save progress:', e)
  }
}

export function loadProgress(bookId: string): Progress | null {
  try {
    const data = localStorage.getItem(`${PROGRESS_KEY}_${bookId}`)
    return data ? JSON.parse(data) : null
  } catch (e) {
    console.warn('Failed to load progress:', e)
    return null
  }
}

export function clearProgress(bookId: string) {
  try {
    localStorage.removeItem(`${PROGRESS_KEY}_${bookId}`)
  } catch (e) {
    console.warn('Failed to clear progress:', e)
  }
}

/**
 * Every book's saved position, most recently listened first.
 *
 * Progress is stored one localStorage key per book rather than in a single
 * index, so "where was I?" means scanning the keys. There are as many entries
 * as books the user has opened, so the scan is cheap.
 */
export function listAllProgress(): Progress[] {
  const entries: Progress[] = []

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(`${PROGRESS_KEY}_`)) continue

      try {
        const raw = localStorage.getItem(key)
        if (!raw) continue

        const parsed = JSON.parse(raw) as Partial<Progress>
        if (
          typeof parsed?.bookId !== 'string' ||
          typeof parsed?.chapterId !== 'string' ||
          typeof parsed?.segmentIndex !== 'number'
        ) {
          continue
        }

        entries.push({
          bookId: parsed.bookId,
          chapterId: parsed.chapterId,
          segmentIndex: parsed.segmentIndex,
          timestamp: typeof parsed.timestamp === 'number' ? parsed.timestamp : 0,
        })
      } catch {
        // A corrupt entry should not hide the rest.
      }
    }
  } catch (e) {
    console.warn('Failed to list progress:', e)
    return []
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp)
}

/** The book the user was last listening to, if any. */
export function getMostRecentProgress(): Progress | null {
  return listAllProgress()[0] ?? null
}
