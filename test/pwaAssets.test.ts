import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The PWA config referenced apple-touch-icon.png and mask-icon.svg for a long
 * time while neither file existed in public/, so two of the three declared
 * assets silently did nothing. These tests tie the config to the filesystem so
 * that cannot drift again.
 */
const root = resolve(__dirname, '..')
const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8')
const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8')

function publicFile(name: string) {
  return resolve(root, 'public', name)
}

describe('PWA assets', () => {
  it('ships every asset listed in includeAssets', () => {
    const includeAssets = viteConfig.match(/includeAssets:\s*\[([^\]]*)\]/)?.[1]
    expect(includeAssets, 'includeAssets not found in vite.config.ts').toBeDefined()

    const names = [...includeAssets!.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    expect(names.length).toBeGreaterThan(0)

    for (const name of names) {
      expect(existsSync(publicFile(name)), `public/${name} is referenced but missing`).toBe(true)
    }
  })

  it('ships every icon listed in the manifest', () => {
    const icons = [...viteConfig.matchAll(/src:\s*['"]([^'"]+\.png)['"]/g)].map((m) => m[1])
    expect(icons.length).toBeGreaterThanOrEqual(3)

    for (const icon of icons) {
      expect(existsSync(publicFile(icon)), `public/${icon} is referenced but missing`).toBe(true)
    }
  })

  it('declares a maskable icon, so Android does not letterbox the home-screen icon', () => {
    expect(viteConfig).toMatch(/purpose:\s*['"]maskable['"]/)
    expect(existsSync(publicFile('maskable-icon-512x512.png'))).toBe(true)
  })

  it('keeps the heavy ONNX runtimes out of the precache', () => {
    const globPatterns = viteConfig.match(/globPatterns:\s*\[([^\]]*)\]/)?.[1]
    expect(
      globPatterns,
      'globPatterns not found — precache would default to everything'
    ).toBeDefined()
    expect(globPatterns).not.toMatch(/wasm/)

    // ...but still serves them offline once fetched.
    expect(viteConfig).toMatch(/wasm\|onnx/)
    expect(viteConfig).toMatch(/CacheFirst/)
  })

  it('links the icons the plugin does not inject', () => {
    expect(indexHtml).toMatch(/rel="apple-touch-icon"/)
    expect(indexHtml).toMatch(/rel="mask-icon"/)
  })

  it('uses one theme colour across the manifest and the document', () => {
    const manifestTheme = viteConfig.match(/theme_color:\s*['"]([^'"]+)['"]/)?.[1]
    const htmlTheme = indexHtml.match(/name="theme-color"\s+content="([^"]+)"/)?.[1]

    expect(manifestTheme).toBeDefined()
    expect(htmlTheme).toBe(manifestTheme)
  })

  it('keeps the mask icon monochrome, as Safari recolours it', () => {
    const svg = readFileSync(publicFile('mask-icon.svg'), 'utf8')
    const fills = new Set([...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]))

    expect(fills.size).toBe(1)
    expect(svg).toMatch(/viewBox="0 0 16 16"/)
  })
})
