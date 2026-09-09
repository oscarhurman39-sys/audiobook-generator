import { writable } from 'svelte/store'

export type ModelLoadingState = {
  loading: boolean
  message: string
  /** 0–100, undefined when indeterminate */
  progress: number | undefined
}

const initial: ModelLoadingState = { loading: false, message: '', progress: undefined }

export const modelLoadingStore = writable<ModelLoadingState>(initial)

export function setModelLoading(message: string, progress?: number) {
  modelLoadingStore.set({ loading: true, message, progress })
}

export function setModelReady() {
  modelLoadingStore.set({ loading: false, message: 'Model ready', progress: 100 })
  // Clear after a short delay so the "ready" state briefly shows
  setTimeout(() => modelLoadingStore.set(initial), 2000)
}

export function setModelError() {
  modelLoadingStore.set(initial)
}

/**
 * Reflect a model-loading progress message (from the TTS worker or the
 * main-thread warm-up) in the store. Returns true when the message was about
 * model loading, so callers can tell a load is in flight.
 *
 * transformers.js reports per-file statuses (initiate, download, progress,
 * done) and kokoro-js never emits the final "ready": the ONNX session is built
 * silently after the last "done". A per-file "done" therefore means "still
 * preparing", and readiness has to come from the caller once a result lands.
 */
export function applyModelProgressMessage(message: string): boolean {
  const download = message.match(/^Downloading (.+?): (\d+)%$/)
  if (download) {
    const file = download[1].split('/').pop() || download[1]
    setModelLoading(`Downloading ${file}: ${download[2]}%`, parseInt(download[2], 10))
    return true
  }

  const status = message.match(/^Loading: (\w+)$/)
  if (status) {
    if (status[1] === 'ready') setModelReady()
    else if (status[1] === 'done') setModelLoading('Preparing model…')
    else setModelLoading('Downloading model…')
    return true
  }

  if (/^Retrying model load/.test(message)) {
    setModelLoading(message)
    return true
  }

  return false
}
