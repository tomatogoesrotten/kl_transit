import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // MapLibre spawns its tile worker from a URL relative to its own module.
    // Vite's dep optimizer copies the module into node_modules/.vite/deps and
    // leaves the worker behind, so the worker 404s, no tile is ever parsed, and
    // the map renders its background colour and nothing else. Excluding it keeps
    // the module where its worker is.
    exclude: ['maplibre-gl'],
  },
})
