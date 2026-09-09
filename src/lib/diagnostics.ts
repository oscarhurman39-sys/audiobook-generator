/**
 * Diagnostics: the facts a bug report from a phone needs, collected in-app.
 *
 * A phone has no devtools. When generation stalls or a page never loads, the
 * only evidence is what the app can gather about itself: runtime, device
 * limits, which browser capabilities exist, what is cached, what is selected,
 * and what was logged. `collectDiagnostics` gathers it; `formatDiagnostics`
 * renders it as plain text that can be copied or shared.
 */
import logger, { type LogEntry } from './utils/logger'
import { get } from 'svelte/store'
import { isMobileDevice, getOptimalTTSSettings } from './utils/mobileDetect'
import { getDeviceTier } from './utils/resourceMonitor'
import {
  selectedModel,
  selectedVoice,
  selectedQuantization,
  selectedDevice,
} from '../stores/ttsStore'
import { appSettings } from '../stores/appSettingsStore'
import { getStorageInfo } from './storageManager'

export interface DiagnosticsReport {
  generatedAt: string
  app: { version: string; runtime: 'capacitor' | 'browser'; url: string }
  device: {
    userAgent: string
    platform: string
    language: string
    screen: string
    deviceMemoryGB?: number
    hardwareConcurrency?: number
    online: boolean
    isMobile: boolean
    deviceTier: string
  }
  capabilities: {
    crossOriginIsolated: boolean
    sharedArrayBuffer: boolean
    webAssembly: boolean
    webGPU: 'adapter' | 'no-adapter' | 'unavailable' | string
    serviceWorker: 'controlling' | 'registered' | 'none' | 'unsupported'
    speechSynthesisVoices?: number
  }
  storage: {
    usageBytes?: number
    quotaBytes?: number
    persisted?: boolean
    cachedModels: { name: string; size: number }[]
    books?: number
    segments?: number
    error?: string
  }
  settings: {
    model: string
    voice: string
    quantization: string
    device: string
    adaptiveQuality: boolean
    recommendedQuantization: string
    recommendedDevice: string
    /** What Kokoro requests actually use on this device once the phone cap applies. */
    effectiveKokoro: string
  }
  logs: LogEntry[]
}

/** Injected by Vite's `define`; absent under Vitest and in other tooling. */
declare const __APP_VERSION__: string | undefined

function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      }
    )
  })
}

async function detectWebGPU(): Promise<DiagnosticsReport['capabilities']['webGPU']> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu
  if (!gpu || typeof gpu.requestAdapter !== 'function') return 'unavailable'
  const adapter = await withTimeout(gpu.requestAdapter(), 3000, null)
  if (!adapter) return 'no-adapter'
  const info = (adapter as { info?: { vendor?: string; architecture?: string } }).info
  const detail = [info?.vendor, info?.architecture].filter(Boolean).join(' ')
  return detail ? `adapter (${detail})` : 'adapter'
}

async function detectServiceWorker(): Promise<DiagnosticsReport['capabilities']['serviceWorker']> {
  const sw = (navigator as unknown as { serviceWorker?: ServiceWorkerContainer }).serviceWorker
  if (!sw) return 'unsupported'
  if (sw.controller) return 'controlling'
  const registrations = await withTimeout(sw.getRegistrations(), 2000, [])
  return registrations.length > 0 ? 'registered' : 'none'
}

async function collectStorage(): Promise<DiagnosticsReport['storage']> {
  const result: DiagnosticsReport['storage'] = { cachedModels: [] }
  try {
    const storage = (navigator as unknown as { storage?: StorageManager }).storage
    if (storage?.estimate) {
      const est = await withTimeout(storage.estimate(), 3000, {} as StorageEstimate)
      result.usageBytes = est.usage
      result.quotaBytes = est.quota
    }
    if (storage?.persisted) {
      result.persisted = await withTimeout(storage.persisted(), 2000, undefined)
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }
  try {
    const info = await withTimeout(getStorageInfo(), 8000, null)
    if (info) {
      result.cachedModels = info.models.map((m) => ({ name: m.name, size: m.size }))
      result.books = info.books
      result.segments = info.segments
    } else if (!result.error) {
      result.error = 'storage inventory timed out'
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
  }
  return result
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const win = typeof window !== 'undefined' ? window : undefined
  const optimal = getOptimalTTSSettings()

  const [webGPU, serviceWorker, storage] = await Promise.all([
    detectWebGPU(),
    detectServiceWorker(),
    collectStorage(),
  ])

  return {
    generatedAt: new Date().toISOString(),
    app: {
      version: appVersion(),
      runtime: win && 'Capacitor' in win ? 'capacitor' : 'browser',
      url: win?.location?.href ?? 'n/a',
    },
    device: {
      userAgent: nav.userAgent,
      platform: nav.platform ?? 'n/a',
      language: nav.language ?? 'n/a',
      screen: win ? `${win.innerWidth}x${win.innerHeight} @${win.devicePixelRatio ?? 1}` : 'n/a',
      deviceMemoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
      hardwareConcurrency:
        typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
      online: nav.onLine !== false,
      isMobile: isMobileDevice(),
      deviceTier: getDeviceTier(),
    },
    capabilities: {
      crossOriginIsolated: Boolean(
        (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated
      ),
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      webAssembly: typeof WebAssembly !== 'undefined',
      webGPU,
      serviceWorker,
      speechSynthesisVoices:
        typeof speechSynthesis !== 'undefined' ? speechSynthesis.getVoices().length : undefined,
    },
    storage,
    settings: {
      model: String(get(selectedModel)),
      voice: String(get(selectedVoice)),
      quantization: String(get(selectedQuantization)),
      device: String(get(selectedDevice)),
      adaptiveQuality: get(appSettings).adaptiveQuality.enabled,
      recommendedQuantization: optimal.quantization,
      recommendedDevice: optimal.device,
      effectiveKokoro: isMobileDevice()
        ? 'q8 on wasm (phone cap)'
        : `${get(selectedQuantization)} on ${get(selectedDevice)}`,
    },
    logs: logger.getRecentLogs(),
  }
}

function fmtBytes(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 'n/a'
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`
  return `${n} B`
}

function val(v: unknown): string {
  return v === undefined || v === null ? 'n/a' : String(v)
}

export function formatDiagnostics(r: DiagnosticsReport): string {
  const lines: string[] = []
  lines.push(`Audiobook diagnostics (${r.generatedAt})`)
  lines.push('')
  lines.push('[app]')
  lines.push(`version: ${r.app.version}`)
  lines.push(`runtime: ${r.app.runtime}`)
  lines.push(`url: ${r.app.url}`)
  lines.push('')
  lines.push('[device]')
  lines.push(`userAgent: ${r.device.userAgent}`)
  lines.push(`platform: ${r.device.platform}`)
  lines.push(`language: ${r.device.language}`)
  lines.push(`screen: ${r.device.screen}`)
  lines.push(`deviceMemoryGB: ${val(r.device.deviceMemoryGB)}`)
  lines.push(`hardwareConcurrency: ${val(r.device.hardwareConcurrency)}`)
  lines.push(`online: ${r.device.online}`)
  lines.push(`isMobile: ${r.device.isMobile}`)
  lines.push(`deviceTier: ${r.device.deviceTier}`)
  lines.push('')
  lines.push('[capabilities]')
  lines.push(`crossOriginIsolated: ${r.capabilities.crossOriginIsolated}`)
  lines.push(`sharedArrayBuffer: ${r.capabilities.sharedArrayBuffer}`)
  lines.push(`webAssembly: ${r.capabilities.webAssembly}`)
  lines.push(`webGPU: ${r.capabilities.webGPU}`)
  lines.push(`serviceWorker: ${r.capabilities.serviceWorker}`)
  lines.push(`speechSynthesisVoices: ${val(r.capabilities.speechSynthesisVoices)}`)
  lines.push('')
  lines.push('[storage]')
  if (r.storage.usageBytes === undefined) {
    lines.push(`storage: n/a${r.storage.error ? ` (${r.storage.error})` : ''}`)
  } else {
    lines.push(
      `storage: ${fmtBytes(r.storage.usageBytes)} used of ${fmtBytes(r.storage.quotaBytes)}`
    )
    if (r.storage.error) lines.push(`storage error: ${r.storage.error}`)
  }
  lines.push(`persisted: ${val(r.storage.persisted)}`)
  lines.push(`books: ${val(r.storage.books)}  segments: ${val(r.storage.segments)}`)
  if (r.storage.cachedModels.length === 0) {
    lines.push('cached models: none')
  } else {
    lines.push('cached models:')
    for (const m of r.storage.cachedModels) lines.push(`  - ${m.name} (${fmtBytes(m.size)})`)
  }
  lines.push('')
  lines.push('[settings]')
  lines.push(`model: ${r.settings.model}`)
  lines.push(`voice: ${r.settings.voice}`)
  lines.push(`quantization: ${r.settings.quantization}`)
  lines.push(`device: ${r.settings.device}`)
  lines.push(`adaptiveQuality: ${r.settings.adaptiveQuality}`)
  lines.push(
    `recommended: ${r.settings.recommendedQuantization} on ${r.settings.recommendedDevice}`
  )
  lines.push(`effective Kokoro: ${r.settings.effectiveKokoro}`)
  lines.push('')
  lines.push(`[log] last ${r.logs.length} entries`)
  if (r.logs.length === 0) {
    lines.push('(no log entries)')
  } else {
    for (const e of r.logs) lines.push(`${e.time} ${e.level.toUpperCase().padEnd(5)} ${e.text}`)
  }
  return lines.join('\n')
}
