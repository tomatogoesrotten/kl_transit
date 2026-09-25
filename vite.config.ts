import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // MapLibre creates its worker with `{ type: 'module' }`, so the worker Vite
  // emits has to be an ES module too. The default is an IIFE, which that
  // constructor refuses.
  worker: { format: 'es' },
  optimizeDeps: {
    // MapLibre spawns its tile worker from a URL relative to its own module.
    // Vite's dep optimizer copies the module into node_modules/.vite/deps and
    // leaves the worker behind, so the worker 404s, no tile is ever parsed, and
    // the map renders its background colour and nothing else. Excluding it keeps
    // the module where its worker is.
    exclude: ['maplibre-gl'],
  },
  // The recorded GTFS-Realtime responses in src/live/fixtures. Tests load them
  // with `?inline`, as base64, because the project has no @types/node and so no
  // `node:fs`. Vite only inlines file types it knows to be assets, and `.pb`
  // is not one of them by default. No app code imports these.
  assetsInclude: ['**/*.pb'],
})
