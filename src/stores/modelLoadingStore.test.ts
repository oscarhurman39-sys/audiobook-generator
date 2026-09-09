import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get } from 'svelte/store'
import { modelLoadingStore, applyModelProgressMessage, setModelError } from './modelLoadingStore'

describe('applyModelProgressMessage', () => {
  beforeEach(() => {
    setModelError() // reset to initial
    vi.useRealTimers()
  })

  it('shows a download percentage using the file basename', () => {
    expect(applyModelProgressMessage('Downloading onnx/model_quantized.onnx: 42%')).toBe(true)
    const s = get(modelLoadingStore)
    expect(s.loading).toBe(true)
    expect(s.progress).toBe(42)
    expect(s.message).toBe('Downloading model_quantized.onnx: 42%')
  })

  it('reads a per-file "done" as preparing, not finished', () => {
    // transformers.js emits "done" per file and kokoro-js never emits "ready":
    // the session is built silently afterwards. "done" must not read as ready.
    expect(applyModelProgressMessage('Loading: done')).toBe(true)
    const s = get(modelLoadingStore)
    expect(s.loading).toBe(true)
    expect(s.message).toBe('Preparing model…')
    expect(s.progress).toBeUndefined()
  })

  it('reads initiate/download/progress statuses as downloading', () => {
    for (const status of ['initiate', 'download', 'progress']) {
      applyModelProgressMessage(`Loading: ${status}`)
      expect(get(modelLoadingStore)).toMatchObject({ loading: true, message: 'Downloading model…' })
    }
  })

  it('marks the model ready on the ready status', () => {
    vi.useFakeTimers()
    applyModelProgressMessage('Loading: done')
    expect(applyModelProgressMessage('Loading: ready')).toBe(true)
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: 'Model ready' })
    vi.advanceTimersByTime(2500)
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: '' })
  })

  it('keeps retry notices visible', () => {
    expect(applyModelProgressMessage('Retrying model load... (1/2)')).toBe(true)
    expect(get(modelLoadingStore)).toMatchObject({
      loading: true,
      message: 'Retrying model load... (1/2)',
    })
  })

  it('ignores messages that are not about model loading', () => {
    expect(applyModelProgressMessage('Preparing text...')).toBe(false)
    expect(applyModelProgressMessage('Retrying... (attempt 1/3)')).toBe(false)
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: '' })
  })
})
