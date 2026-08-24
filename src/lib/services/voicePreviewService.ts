/**
 * Short voice previews for the audition screen.
 *
 * Kokoro's own documentation notes that quality varies significantly between
 * voices, so picking one is a listening decision rather than something to infer
 * from a name. That makes a preview the whole point of the screen — and means
 * previews get replayed a lot, so generated audio is cached for the session and
 * concurrent requests for the same voice share one generation.
 */
import { getTTSWorker } from '../ttsWorkerManager'
import logger from '../utils/logger'

/**
 * The sample line.
 *
 * Long enough to hear pacing and intonation rather than a clipped word —
 * Kokoro rushes very short utterances — and neutral enough to suit any book.
 */
export const VOICE_PREVIEW_TEXT =
  'The lamps were lit, and the long evening settled over the house at last.'

const cache = new Map<string, Blob>()
const inFlight = new Map<string, Promise<Blob>>()

export interface VoicePreviewOptions {
  quantization?: 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16'
  device?: 'auto' | 'wasm' | 'webgpu' | 'cpu'
  text?: string
}

/**
 * Generate (or return the cached) preview for a voice.
 * Concurrent calls for the same voice resolve from a single generation.
 */
export async function getVoicePreview(
  voice: string,
  options: VoicePreviewOptions = {}
): Promise<Blob> {
  const cached = cache.get(voice)
  if (cached) return cached

  const pending = inFlight.get(voice)
  if (pending) return pending

  const request = (async () => {
    const worker = getTTSWorker()
    const blob = await worker.generateVoice({
      text: options.text ?? VOICE_PREVIEW_TEXT,
      modelType: 'kokoro',
      voice,
      dtype: options.quantization ?? 'q8',
      device: options.device ?? 'auto',
    })

    cache.set(voice, blob)
    return blob
  })()

  inFlight.set(voice, request)

  try {
    return await request
  } catch (err) {
    logger.warn('[VoicePreview] Failed to generate preview', { voice, err })
    throw err
  } finally {
    inFlight.delete(voice)
  }
}

/** Whether a preview is already available without generating. */
export function hasVoicePreview(voice: string): boolean {
  return cache.has(voice)
}

export function clearVoicePreviewCache(): void {
  cache.clear()
  inFlight.clear()
}
