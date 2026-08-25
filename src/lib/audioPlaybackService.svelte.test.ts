import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupMockURL } from '../test/svelteRunesTestUtils'
import { createMockTTSWorkerManager, createMockWavBlob } from '../test/ttsClientMocks'

/**
 * Tests for audioPlaybackService — URL lifecycle, mock plumbing, and a set of
 * `it.fails` notes documenting suspected bugs.
 *
 * NOTE ON SCOPE:
 * An earlier version of this file stated that the service "cannot be unit
 * tested in isolation" because of Svelte runes. That is no longer accurate:
 * `vitest.config.ts` now loads `@sveltejs/vite-plugin-svelte`, which compiles
 * `.svelte.ts` modules, so the service imports and runs under Vitest.
 *
 * Real behavioural coverage — segment chaining, end-of-chapter handling, skip
 * semantics, teardown — lives in `audioPlaybackService.behavior.test.ts`.
 * Cross-chapter isolation is covered there by the `stop()` tests.
 *
 * The `it.fails` blocks that used to live here asserted against local toy
 * re-implementations and proved nothing about the real code. Each suspicion
 * they described is now tested against the actual service in
 * `audioPlaybackService.behavior.test.ts` ("resource discipline"): element
 * disposal on segment switch, at-most-once generation per segment, and blob
 * URL release behind the playhead.
 */
// ============================================================================
// URL MANAGEMENT TESTS
// These test URL lifecycle without needing the actual service
// ============================================================================

describe('Blob URL Lifecycle', () => {
  let urlTracker: { createdUrls: string[]; revokedUrls: string[] }

  beforeEach(() => {
    urlTracker = setupMockURL()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('tracks created blob URLs', () => {
    const blob = createMockWavBlob(100)
    const url = URL.createObjectURL(blob)

    expect(urlTracker.createdUrls).toContain(url)
  })

  it('tracks revoked blob URLs', () => {
    const blob = createMockWavBlob(100)
    const url = URL.createObjectURL(blob)
    URL.revokeObjectURL(url)

    expect(urlTracker.revokedUrls).toContain(url)
  })

  it('detects URL leaks when not revoked', () => {
    const blob = createMockWavBlob(100)
    URL.createObjectURL(blob)

    // URL created but not revoked = leak
    expect(urlTracker.createdUrls.length).toBe(1)
    expect(urlTracker.revokedUrls.length).toBe(0)
  })
})

// ============================================================================
// MOCK WORKER TESTS
// ============================================================================

describe('TTS Worker Mock', () => {
  let mockWorker: ReturnType<typeof createMockTTSWorkerManager>

  beforeEach(() => {
    mockWorker = createMockTTSWorkerManager()
  })

  it('generates audio blob', async () => {
    const result = await mockWorker.generateVoice({
      text: 'Test sentence.',
      modelType: 'kokoro',
    })

    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('audio/wav')
  })

  it('handles errors correctly', async () => {
    const failingWorker = createMockTTSWorkerManager({
      shouldFail: true,
      errorMessage: 'Generation failed',
    })

    await expect(failingWorker.generateVoice({ text: 'Test' })).rejects.toThrow('Generation failed')
  })

  it('tracks call count', async () => {
    await mockWorker.generateVoice({ text: 'First' })
    await mockWorker.generateVoice({ text: 'Second' })

    expect(mockWorker._getCallCount()).toBe(2)
  })

  it('resets call count', async () => {
    await mockWorker.generateVoice({ text: 'Test' })
    mockWorker._resetCallCount()

    expect(mockWorker._getCallCount()).toBe(0)
  })
})
