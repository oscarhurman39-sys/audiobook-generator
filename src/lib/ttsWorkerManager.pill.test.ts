import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { modelLoadingStore, setModelError } from '../stores/modelLoadingStore'

/**
 * A stand-in for the browser Worker: records what the manager posts and lets the
 * test play worker messages back into the manager's onmessage handler.
 */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  posted: Array<{ id: string; type: string }> = []

  constructor() {
    FakeWorker.instances.push(this)
    // The manager assigns onmessage right after construction; announce readiness
    // on the next tick, as a real worker would.
    setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 0)
  }

  postMessage(msg: { id: string; type: string }) {
    this.posted.push(msg)
  }

  terminate() {}

  emit(data: unknown) {
    this.onmessage?.({ data })
  }
}

describe('TTSWorkerManager drives the model-loading pill', () => {
  let manager: import('./ttsWorkerManager').TTSWorkerManager

  beforeEach(async () => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    setModelError()
    const { TTSWorkerManager } = await import('./ttsWorkerManager')
    manager = new TTSWorkerManager()
    await new Promise((r) => setTimeout(r, 5))
  })

  afterEach(() => {
    manager.terminate()
    vi.unstubAllGlobals()
  })

  async function startRequest() {
    const promise = manager.generateVoice({ text: 'Hello there.', modelType: 'kokoro' })
    promise.catch(() => {})
    await new Promise((r) => setTimeout(r, 5))
    const worker = FakeWorker.instances[0]
    const req = worker.posted[worker.posted.length - 1]
    expect(req).toBeDefined()
    return { promise, worker, id: req.id }
  }

  it('shows download progress, then preparing, then ready when the first result lands', async () => {
    const { promise, worker, id } = await startRequest()

    worker.emit({ id, type: 'progress', message: 'Downloading onnx/model_quantized.onnx: 42%' })
    expect(get(modelLoadingStore)).toMatchObject({ loading: true, progress: 42 })

    worker.emit({ id, type: 'progress', message: 'Loading: done' })
    expect(get(modelLoadingStore)).toMatchObject({ loading: true, message: 'Preparing model…' })

    worker.emit({ id, type: 'complete', audioBuffer: new ArrayBuffer(8) })
    await expect(promise).resolves.toBeInstanceOf(Blob)
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: 'Model ready' })
  })

  it('clears the pill when the worker reports an error mid-load', async () => {
    const { worker, id } = await startRequest()
    worker.emit({ id, type: 'progress', message: 'Loading: done' })
    expect(get(modelLoadingStore).loading).toBe(true)

    worker.emit({ id, type: 'error', error: 'Failed to load Kokoro model: kaput' })
    await new Promise((r) => setTimeout(r, 5))
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: '' })
  })

  it('leaves the pill alone for results that were not preceded by a model load', async () => {
    const { promise, worker, id } = await startRequest()
    worker.emit({ id, type: 'progress', message: 'Preparing text...' })
    worker.emit({ id, type: 'complete', audioBuffer: new ArrayBuffer(8) })
    await expect(promise).resolves.toBeInstanceOf(Blob)
    expect(get(modelLoadingStore)).toMatchObject({ loading: false, message: '' })
  })
})

describe('capRequestForDevice keeps phones on q8 + wasm', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    vi.stubGlobal('navigator', originalNavigator)
  })

  it('overrides a persisted q4/auto preference on a phone', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile',
      maxTouchPoints: 5,
    })
    const { capRequestForDevice } = await import('./ttsWorkerManager')
    const capped = capRequestForDevice({ modelType: 'kokoro', dtype: 'q4', device: 'auto' })
    expect(capped).toMatchObject({ modelType: 'kokoro', dtype: 'q8', device: 'wasm' })
  })

  it('leaves desktop requests and non-Kokoro requests alone', async () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      maxTouchPoints: 0,
      deviceMemory: 16,
    })
    const { capRequestForDevice } = await import('./ttsWorkerManager')
    expect(capRequestForDevice({ modelType: 'kokoro', dtype: 'q4', device: 'auto' })).toMatchObject(
      {
        dtype: 'q4',
        device: 'auto',
      }
    )
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile',
      maxTouchPoints: 5,
    })
    expect(capRequestForDevice({ modelType: 'piper', dtype: 'q4', device: 'auto' })).toMatchObject({
      dtype: 'q4',
      device: 'auto',
    })
  })
})
