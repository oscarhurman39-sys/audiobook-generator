import { describe, it, expect, vi, beforeEach } from 'vitest'

const generateVoice = vi.hoisted(() => vi.fn())

vi.mock('../ttsWorkerManager', () => ({
  getTTSWorker: () => ({ generateVoice }),
}))

import {
  getVoicePreview,
  hasVoicePreview,
  clearVoicePreviewCache,
  VOICE_PREVIEW_TEXT,
} from './voicePreviewService'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('voicePreviewService', () => {
  beforeEach(() => {
    clearVoicePreviewCache()
    generateVoice.mockReset()
    generateVoice.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }))
  })

  it('generates a preview with the sample line and the requested voice', async () => {
    await getVoicePreview('bf_emma')

    expect(generateVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        text: VOICE_PREVIEW_TEXT,
        modelType: 'kokoro',
        voice: 'bf_emma',
      })
    )
  })

  it('uses a sample long enough to hear pacing, not a clipped word', () => {
    expect(VOICE_PREVIEW_TEXT.split(/\s+/).length).toBeGreaterThan(6)
  })

  it('caches per voice, so replaying does not regenerate', async () => {
    await getVoicePreview('bf_emma')
    await getVoicePreview('bf_emma')

    expect(generateVoice).toHaveBeenCalledTimes(1)
    expect(hasVoicePreview('bf_emma')).toBe(true)
  })

  it('caches each voice separately', async () => {
    await getVoicePreview('bf_emma')
    await getVoicePreview('bm_george')

    expect(generateVoice).toHaveBeenCalledTimes(2)
  })

  it('shares one generation between concurrent requests for the same voice', async () => {
    const pending = deferred<Blob>()
    generateVoice.mockReturnValue(pending.promise)

    const [first, second] = [getVoicePreview('bf_emma'), getVoicePreview('bf_emma')]
    pending.resolve(new Blob(['audio'], { type: 'audio/wav' }))

    await Promise.all([first, second])
    expect(generateVoice).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure, so the next attempt retries', async () => {
    generateVoice.mockRejectedValueOnce(new Error('model unavailable'))

    await expect(getVoicePreview('bf_emma')).rejects.toThrow('model unavailable')
    expect(hasVoicePreview('bf_emma')).toBe(false)

    generateVoice.mockResolvedValueOnce(new Blob(['audio'], { type: 'audio/wav' }))
    await expect(getVoicePreview('bf_emma')).resolves.toBeInstanceOf(Blob)
  })

  it('passes quantization and device through', async () => {
    await getVoicePreview('bm_george', { quantization: 'q4', device: 'wasm' })

    expect(generateVoice).toHaveBeenCalledWith(
      expect.objectContaining({ dtype: 'q4', device: 'wasm' })
    )
  })

  it('clears the cache on request', async () => {
    await getVoicePreview('bf_emma')
    clearVoicePreviewCache()

    expect(hasVoicePreview('bf_emma')).toBe(false)
    await getVoicePreview('bf_emma')
    expect(generateVoice).toHaveBeenCalledTimes(2)
  })
})
