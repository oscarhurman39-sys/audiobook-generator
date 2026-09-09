import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import { version } from './package.json'

export default defineConfig({
  define: {
    // Shown on the Diagnostics screen so a bug report names the build it came from.
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Audiobook Generator',
        short_name: 'AudiobookGen',
        description: 'Generate audiobooks from eBooks locally.',
        // Matches the icon's own blue, so the splash screen and address bar
        // don't flash white before the app paints.
        theme_color: '#0b57f9',
        background_color: '#0b57f9',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['books', 'education', 'entertainment'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // Android masks icons to its own shape and only guarantees the
            // inner 80%; without this the home-screen icon gets letterboxed.
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The ONNX runtimes are ~26 MB and ~22 MB, and only one of the two is
        // ever used on a given device — precaching both meant a ~56 MB install
        // over mobile data before the first book could be opened. The app shell
        // is precached; the runtimes are fetched on first use and cached then.
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            urlPattern: /\.(?:wasm|onnx)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tts-runtime',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
    include: ['jszip'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('onnxruntime-web') || id.includes('@diffusionstudio/vits-web')) {
            return 'piper-tts'
          }
          if (id.includes('pdfjs-dist')) {
            return 'pdf-parser'
          }
          if (id.includes('jszip')) {
            return 'zip'
          }
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
})
