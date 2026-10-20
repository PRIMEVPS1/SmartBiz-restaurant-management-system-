import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      workbox: { navigateFallbackDenylist: [/^\/api/] },
      manifest: {
        name: 'SmartBiz Restaurant Management System',
        short_name: 'SmartBiz',
        description: 'SmartBiz Restaurant Management System',
        theme_color: '#0a0f16',
        background_color: '#0a0f16',
        display: 'standalone',
        start_url: '/',
        orientation: 'any',
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts':   ['recharts'],
          'vendor-pdf':      ['jspdf', 'jspdf-autotable', 'xlsx'],
          'vendor-ui':       ['react-hot-toast', 'lucide-react', 'date-fns', 'clsx'],
        }
      }
    }
  }
})
