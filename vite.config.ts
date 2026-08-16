import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'ChatShelf',
        short_name: 'ChatShelf',
        description: 'Your private, channel-based journal.',
        theme_color: '#6750a4',
        background_color: '#f8f7fc',
        display: 'standalone',
        start_url: '/',
        icons: [{
          src: '/icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
