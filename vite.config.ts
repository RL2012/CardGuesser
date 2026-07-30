import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeManifestIcons: false,
      manifest: {
        name: 'Card Guesser',
        short_name: 'CardGuesser',
        description: 'Eight Yu-Gi-Oh! card guessing, trivia, and multiplayer games.',
        start_url: '/CardGuesser/',
        scope: '/CardGuesser/',
        display: 'standalone',
        background_color: '#f2f2f7',
        theme_color: '#7c3aed',
        icons: [
          {
            src: 'pwa-64x64.png',
            sizes: '64x64',
            type: 'image/png',
          },
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,txt}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  base: '/CardGuesser/',
  server: {
    open: true,
  },
})
