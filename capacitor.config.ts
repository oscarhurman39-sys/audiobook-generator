import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.oscar.audiobook',
  appName: 'Audiobook',
  webDir: 'dist',
  // Programmatic play() (auto-advance, resume, progressive chaining) works
  // because Capacitor's Bridge disables the WebView's user-gesture requirement
  // for media playback by default — no extra config needed here.
  server: {
    // Served over https so IndexedDB/localStorage keep working and
    // secure-context APIs stay available.
    androidScheme: 'https',
  },
}

export default config
