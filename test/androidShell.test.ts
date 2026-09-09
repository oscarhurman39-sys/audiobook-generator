import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Guards the Capacitor Android shell the same way pwaAssets.test.ts guards the
 * manifest: the pieces live in three places (capacitor.config.ts, the native
 * project, the CI workflow) and nothing else ties them together, so drift in
 * any one of them would only surface as a broken CI build or a broken APK.
 */
const root = resolve(__dirname, '..')
const capacitorConfig = readFileSync(resolve(root, 'capacitor.config.ts'), 'utf8')
const workflow = readFileSync(resolve(root, '.github/workflows/android.yml'), 'utf8')

describe('Android shell', () => {
  it('points Capacitor at the vite build output', () => {
    expect(capacitorConfig).toMatch(/webDir:\s*'dist'/)
  })

  it('keeps the app id consistent between Capacitor and the native project', () => {
    const appId = capacitorConfig.match(/appId:\s*'([^']+)'/)?.[1]
    expect(appId).toBeDefined()

    const gradle = readFileSync(resolve(root, 'android/app/build.gradle'), 'utf8')
    expect(gradle).toContain(`namespace = "${appId}"`)
    expect(gradle).toContain(`applicationId "${appId}"`)

    const activity = resolve(
      root,
      'android/app/src/main/java',
      ...appId!.split('.'),
      'MainActivity.java'
    )
    expect(existsSync(activity), `MainActivity not found at ${activity}`).toBe(true)
  })

  it('serves the WebView over https so storage and secure-context APIs survive', () => {
    expect(capacitorConfig).toMatch(/androidScheme:\s*'https'/)
  })

  it('builds the web bundle and syncs it before compiling the APK', () => {
    const buildStep = workflow.indexOf('pnpm build')
    const syncStep = workflow.indexOf('cap sync android')
    const apkStep = workflow.indexOf('assembleDebug')

    expect(buildStep).toBeGreaterThan(-1)
    expect(syncStep).toBeGreaterThan(buildStep)
    expect(apkStep).toBeGreaterThan(syncStep)
  })

  it('publishes the APK where a phone can download it', () => {
    expect(workflow).toMatch(/upload-artifact/)
    expect(workflow).toMatch(/gh release create android-latest/)
    expect(workflow).toMatch(/contents: write/)
  })

  it('ships the generated launcher icons, not the Capacitor placeholders', () => {
    // @capacitor/assets writes the foreground layer per density; if these are
    // missing the APK falls back to the stock Capacitor logo.
    for (const density of ['mdpi', 'xhdpi', 'xxxhdpi']) {
      const path = resolve(
        root,
        `android/app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`
      )
      expect(existsSync(path), `missing launcher icon for ${density}`).toBe(true)
    }
  })

  it('keeps the synced web assets out of git — CI regenerates them', () => {
    const gitignore = readFileSync(resolve(root, 'android/.gitignore'), 'utf8')
    expect(gitignore).toContain('app/src/main/assets/public')
  })
})
