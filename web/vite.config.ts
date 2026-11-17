import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['agenda-pencil.svg'],
      manifest: {
        name: 'Cola comigo',
        short_name: 'Cola comigo',
        description: 'Agenda de estudos flexível para acompanhar sua rotina escolar.',
        lang: 'pt-BR',
        theme_color: '#1e5548',
        background_color: '#f5f7ef',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/agenda-pencil.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
