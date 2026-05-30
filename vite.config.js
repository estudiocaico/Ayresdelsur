import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // injectManifest: permite un sw.js personalizado (necesario para push events)
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
      manifest: {
        name: 'Ayres del Sur - Preventa',
        short_name: 'Ayres del Sur',
        description: 'Sistema de preventa para distribuidora Ayres del Sur',
        theme_color: '#1A1A1A',
        background_color: '#FAFAF7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/logo-circular.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/logo-circular.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
