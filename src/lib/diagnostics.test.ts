import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { collectDiagnostics, formatDiagnostics, type DiagnosticsReport } from './diagnostics'
import logger from './utils/logger'

const baseReport: DiagnosticsReport = {
  generatedAt: '2026-09-09T18:25:00.000Z',
  app: { version: '0.32.1', runtime: 'capacitor', url: 'https://localhost/' },
  device: {
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile',
    platform: 'Linux armv8l',
    language: 'en-GB',
    screen: '412x915 @2.6',
    deviceMemoryGB: 4,
    hardwareConcurrency: 8,
    online: true,
    isMobile: true,
    deviceTier: 'weak',
  },
  capabilities: {
    crossOriginIsolated: false,
    sharedArrayBuffer: false,
    webAssembly: true,
    webGPU: 'no-adapter',
    serviceWorker: 'controlling',
    speechSynthesisVoices: 12,
  },
  storage: {
    usageBytes: 120_000_000,
    quotaBytes: 6_000_000_000,
    persisted: false,
    cachedModels: [{ name: 'model_quantized.onnx', size: 92_000_000 }],
    books: 1,
    segments: 12,
  },
  settings: {
    model: 'kokoro',
    voice: 'bm_george',
    quantization: 'q8',
    device: 'wasm',
    adaptiveQuality: true,
    recommendedQuantization: 'q8',
    recommendedDevice: 'wasm',
    effectiveKokoro: 'q8 on wasm (phone cap)',
  },
  logs: [
    { time: '2026-09-09T18:24:59.000Z', level: 'warn', text: '[KokoroClient] Warm-up failed' },
  ],
}

describe('formatDiagnostics', () => {
  it('renders every section with the facts a bug report needs', () => {
    const text = formatDiagnostics(baseReport)
    expect(text).toContain('Audiobook diagnostics')
    expect(text).toContain('version: 0.32.1')
    expect(text).toContain('runtime: capacitor')
    expect(text).toContain('crossOriginIsolated: false')
    expect(text).toContain('sharedArrayBuffer: false')
    expect(text).toContain('webGPU: no-adapter')
    expect(text).toContain('deviceMemoryGB: 4')
    expect(text).toContain('storage: 120.0 MB used of 6.0 GB')
    expect(text).toContain('model_quantized.onnx (92.0 MB)')
    expect(text).toContain('quantization: q8')
    expect(text).toContain('recommended: q8 on wasm')
    expect(text).toContain('effective Kokoro: q8 on wasm (phone cap)')
    expect(text).toContain('[KokoroClient] Warm-up failed')
  })

  it('says so when values are unavailable instead of printing undefined', () => {
    const text = formatDiagnostics({
      ...baseReport,
      device: { ...baseReport.device, deviceMemoryGB: undefined, hardwareConcurrency: undefined },
      storage: { cachedModels: [], error: 'IndexedDB unavailable' },
      logs: [],
    })
    expect(text).not.toContain('undefined')
    expect(text).toContain('deviceMemoryGB: n/a')
    expect(text).toContain('storage: n/a (IndexedDB unavailable)')
    expect(text).toContain('cached models: none')
    expect(text).toContain('(no log entries)')
  })
})

describe('collectDiagnostics', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    logger.clearRecentLogs()
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile',
      platform: 'Linux armv8l',
      language: 'en-GB',
      onLine: true,
      maxTouchPoints: 5,
      deviceMemory: 4,
      hardwareConcurrency: 8,
      storage: {
        estimate: async () => ({ usage: 1000, quota: 5000 }),
        persisted: async () => true,
      },
    })
  })

  afterEach(() => {
    vi.stubGlobal('navigator', originalNavigator)
  })

  it('collects device facts, capabilities and recent logs without throwing', async () => {
    logger.warn('[Test]', 'something happened')
    const report = await collectDiagnostics()
    expect(report.device.userAgent).toContain('Pixel 7')
    expect(report.device.isMobile).toBe(true)
    expect(report.device.deviceMemoryGB).toBe(4)
    expect(report.capabilities.webAssembly).toBe(true)
    expect(report.capabilities.webGPU).toBe('unavailable')
    expect(report.storage.usageBytes).toBe(1000)
    expect(report.storage.quotaBytes).toBe(5000)
    expect(report.storage.persisted).toBe(true)
    expect(report.settings.recommendedQuantization).toBe('q8')
    expect(report.settings.effectiveKokoro).toBe('q8 on wasm (phone cap)')
    expect(report.logs.some((l) => l.text.includes('something happened'))).toBe(true)
    expect(typeof report.generatedAt).toBe('string')
  })
})
