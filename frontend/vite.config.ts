import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Las ~120 banderas de assets/flags/ son pequeñas y por defecto Vite las
    // inlinearía como data-URI dentro del bundle principal (~96 KB de base64
    // que TODO visitante descarga aunque no abra una alineación). Se fuerzan
    // como archivos sueltos: se piden solo cuando un <img> las usa, y el SW
    // las precachea aparte sin bloquear el primer render.
    assetsInlineLimit(filePath) {
      if (filePath.includes('/assets/flags/')) return false
      return undefined
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // El registro lo hace src/lib/pwaUpdate.ts: el script que inyecta el
      // plugin no re-comprueba versiones ni recarga, y en iOS instalado eso
      // deja la app pegada a un build viejo indefinidamente.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
      },
      manifest: {
        name: 'ManOfTheMatch',
        short_name: 'MOTM',
        description: 'LaLiga en vivo — Real Madrid y FC Barcelona',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#101114',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
