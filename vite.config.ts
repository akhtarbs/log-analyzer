import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base path: on Vercel the app is served from the domain root; the GitHub Pages
// build keeps the repo sub-path. Override anywhere with VITE_BASE.
export default defineConfig({
  base: process.env.VERCEL ? '/' : process.env.VITE_BASE || '/log-analyzer/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg'],
      manifest: {
        name: 'Local Log Analyzer',
        short_name: 'LogAnalyzer',
        description: 'Offline-first, local-only log analysis for security analysts.',
        theme_color: '#070b16',
        background_color: '#070b16',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
})
