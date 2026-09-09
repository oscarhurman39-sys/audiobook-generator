import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  resolveTierLadder,
  getTierConfig,
  cancelUpgrade,
  DEFAULT_KOKORO_VOICE,
} from './adaptiveQualityService'
import type { PiperVoice } from '../piper/piperClient'

vi.mock('../utils/resourceMonitor', () => ({
  getStartingTier: vi.fn(() => 0),
  getTargetTier: vi.fn(() => 1),
  canRunUpgrade: vi.fn(async () => true),
}))

vi.mock('../ttsWorkerManager', () => ({
  getTTSWorker: vi.fn(() => ({
    generateVoice: vi.fn(async () => new Blob(['audio'], { type: 'audio/wav' })),
  })),
}))

vi.mock('../../stores/segmentProgressStore', () => ({
  updateSegmentQuality: vi.fn(),
  getChapterSegmentProgress: vi.fn(() => undefined),
}))

vi.mock('../libraryDB', () => ({
  saveSegmentIndividually: vi.fn(async () => {}),
}))

const piperVoicesEn: PiperVoice[] = [
  { key: 'en_US-low', name: 'English Low', language: 'en_US', quality: 'low' },
  { key: 'en_US-medium', name: 'English Medium', language: 'en_US', quality: 'medium' },
  { key: 'en_US-high', name: 'English High', language: 'en_US', quality: 'high' },
]

const piperVoicesDe: PiperVoice[] = [
  { key: 'de_DE-low', name: 'German Low', language: 'de_DE', quality: 'low' },
  { key: 'de_DE-medium', name: 'German Medium', language: 'de_DE', quality: 'medium' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('resolveTierLadder', () => {
  it('uses Kokoro ladder for English', () => {
    const ladder = resolveTierLadder('en', [])
    expect(ladder.tiers[0]?.model).toBe('web_speech')
    expect(ladder.tiers[1]?.model).toBe('kokoro')
    expect(ladder.tiers[2]?.model).toBe('kokoro')
    expect(ladder.tiers[3]?.model).toBe('kokoro')
    expect(ladder.maxAvailableTier).toBe(3)
  })

  it('uses Piper ladder for non-English with voices', () => {
    const ladder = resolveTierLadder('de', piperVoicesDe)
    expect(ladder.tiers[0]?.model).toBe('web_speech')
    expect(ladder.tiers[1]?.model).toBe('piper')
    expect(ladder.tiers[2]?.model).toBe('piper')
    expect(ladder.tiers[3]).toBeNull() // no high voice for de
    expect(ladder.maxAvailableTier).toBe(2)
  })

  it('returns only tier 0 when no Piper voices available', () => {
    const ladder = resolveTierLadder('ja', [])
    expect(ladder.tiers[0]?.model).toBe('web_speech')
    expect(ladder.tiers[1]).toBeNull()
    expect(ladder.maxAvailableTier).toBe(0)
  })

  it('assigns correct Piper voice keys per tier', () => {
    const ladder = resolveTierLadder('en', piperVoicesEn)
    // For English, Kokoro is used — Piper voices are ignored
    expect(ladder.tiers[1]?.model).toBe('kokoro')
  })

  it('assigns Piper voices for non-English with all qualities', () => {
    const ladder = resolveTierLadder('en', piperVoicesEn)
    // English uses Kokoro regardless
    expect(ladder.maxAvailableTier).toBe(3)
  })
})

describe('getTierConfig', () => {
  it('returns null for unavailable tier (no voices for language)', () => {
    const config = getTierConfig(3, 'ja', [])
    expect(config).toBeNull()
  })

  it('falls back to nearest quality when exact tier unavailable', () => {
    // German has no 'high' voice — tier 3 is null in the ladder
    const config = getTierConfig(3, 'de', piperVoicesDe)
    expect(config).toBeNull()
  })

  it('returns web_speech config for tier 0', () => {
    const config = getTierConfig(0, 'de', piperVoicesDe)
    expect(config?.model).toBe('web_speech')
  })

  it('returns kokoro config for tier 1 in English', () => {
    const config = getTierConfig(1, 'en', [])
    expect(config?.model).toBe('kokoro')
    // q8 is the smallest Kokoro file kokoro-js can load; q4 is larger, not smaller
    expect(config?.quantization).toBe('q8')
  })

  it('returns piper config for tier 1 in German', () => {
    const config = getTierConfig(1, 'de', piperVoicesDe)
    expect(config?.model).toBe('piper')
    expect(config?.voice).toBe('de_DE-low')
  })
})

describe('cancelUpgrade', () => {
  it('does not throw when cancelling non-existent chapter', () => {
    expect(() => cancelUpgrade('non-existent-chapter')).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Voice preservation across quality tiers
//
// The tier ladder is a *quality* ladder. Upgrading a segment must never change
// who is reading it — a bug that silently replaced every British voice choice
// with af_heart, because the Kokoro tiers hard-coded that voice.
// ---------------------------------------------------------------------------

describe('resolveTierLadder — chosen voice is preserved', () => {
  const britishVoices = ['bf_emma', 'bf_isabella', 'bf_alice', 'bf_lily'] as const
  const britishMaleVoices = ['bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable'] as const

  it.each([...britishVoices, ...britishMaleVoices])(
    'carries %s across every Kokoro tier',
    (voice) => {
      const ladder = resolveTierLadder('en', [], voice)

      const kokoroTiers = ladder.tiers.filter((t) => t?.model === 'kokoro')
      expect(kokoroTiers).toHaveLength(3)
      for (const tier of kokoroTiers) {
        expect(tier?.voice).toBe(voice)
      }
    }
  )

  it('keeps the fast tiers on q8 and reserves fp16 for the top tier', () => {
    const ladder = resolveTierLadder('en', [], 'bm_george')

    expect(ladder.tiers[1]).toMatchObject({
      voice: 'bm_george',
      quantization: 'q8',
      device: 'wasm',
    })
    expect(ladder.tiers[2]).toMatchObject({
      voice: 'bm_george',
      quantization: 'q8',
      device: 'wasm',
    })
    expect(ladder.tiers[3]).toMatchObject({ voice: 'bm_george', quantization: 'fp16' })
  })

  it('falls back to the default voice when none is chosen', () => {
    const ladder = resolveTierLadder('en', [])

    expect(ladder.tiers[1]).toMatchObject({ voice: DEFAULT_KOKORO_VOICE })
    expect(ladder.tiers[3]).toMatchObject({ voice: DEFAULT_KOKORO_VOICE })
  })

  it('ignores a voice that is not a real Kokoro voice', () => {
    const ladder = resolveTierLadder('en', [], 'not_a_voice')

    expect(ladder.tiers[1]).toMatchObject({ voice: DEFAULT_KOKORO_VOICE })
  })

  it('ignores a Piper voice key on the Kokoro ladder', () => {
    const ladder = resolveTierLadder('en', [], 'en_GB-alan-medium')

    expect(ladder.tiers[1]).toMatchObject({ voice: DEFAULT_KOKORO_VOICE })
  })

  it('reaches getTierConfig too', () => {
    const config = getTierConfig(2, 'en', [], 'bf_emma')

    expect(config).toMatchObject({ model: 'kokoro', voice: 'bf_emma', quantization: 'q8' })
  })

  describe('Piper', () => {
    const piperVoices = [
      { key: 'de_DE-low', name: 'Low', language: 'de', quality: 'low' as const },
      { key: 'de_DE-medium', name: 'Medium', language: 'de', quality: 'medium' as const },
      { key: 'de_DE-high', name: 'High', language: 'de', quality: 'high' as const },
    ]

    it('pins the ladder to an explicitly chosen voice so no upgrade replaces it', () => {
      const ladder = resolveTierLadder('de', piperVoices, 'de_DE-medium')

      expect(ladder.tiers[1]).toBeNull()
      expect(ladder.tiers[2]).toMatchObject({ model: 'piper', voice: 'de_DE-medium' })
      expect(ladder.tiers[3]).toBeNull()
      expect(ladder.maxAvailableTier).toBe(2)
    })

    it('keeps the full quality ladder when no voice is chosen', () => {
      const ladder = resolveTierLadder('de', piperVoices)

      expect(ladder.tiers[1]).toMatchObject({ voice: 'de_DE-low' })
      expect(ladder.tiers[2]).toMatchObject({ voice: 'de_DE-medium' })
      expect(ladder.tiers[3]).toMatchObject({ voice: 'de_DE-high' })
      expect(ladder.maxAvailableTier).toBe(3)
    })

    it('ignores a chosen voice from another language', () => {
      const ladder = resolveTierLadder('de', piperVoices, 'fr_FR-medium')

      expect(ladder.tiers[1]).toMatchObject({ voice: 'de_DE-low' })
      expect(ladder.maxAvailableTier).toBe(3)
    })
  })
})
