import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  // The Svelte plugin is required so `.svelte.ts` modules (which use runes such
  // as `$state` / `$effect`) are compiled before Vitest loads them. Without it,
  // importing e.g. `audioPlaybackService.svelte.ts` throws on the bare runes.
  plugins: [svelte()],
  resolve: {
    conditions: ['browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // Exclude E2E tests (Playwright) from vitest
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**'],
    // jsdom doesn't automatically load external resources, avoiding CSS fetch errors
    environmentOptions: {
      jsdom: {
        resources: 'usable',
      },
    },
    setupFiles: ['./test/setup.ts'],
  },
})
