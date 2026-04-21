import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

async function loadOptionalVisualizer(enabled: boolean) {
  if (!enabled) return null;
  try {
    const { visualizer } = await import('rollup-plugin-visualizer');
    return visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: true,
    });
  } catch (err) {
    console.warn(
      '[vite] ANALYZE=true pero rollup-plugin-visualizer no esta instalado.'
    );
    return null;
  }
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const analyze = mode === 'analyze' || env.ANALYZE === 'true';
  const visualizerPlugin = await loadOptionalVisualizer(analyze);

  return {
    base: './',
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // Activar SW solo en production (no en dev para no interferir con HMR)
        devOptions: { enabled: false },
        includeAssets: ['favicon.ico', 'icon-*.png', 'icon.svg'],
        manifest: {
          name: 'Kaisen ERP',
          short_name: 'Kaisen',
          description: 'Sistema de gestión para tu negocio',
          theme_color: '#1e1b4b',
          background_color: '#0f0f23',
          display: 'standalone',
          orientation: 'portrait-primary',
          start_url: '/',
          scope: '/',
          lang: 'es',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          screenshots: [
            {
              src: '/screenshot-wide.png',
              sizes: '1280x800',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Dashboard de ventas',
            },
          ],
          shortcuts: [
            {
              name: 'Caja Rápida',
              short_name: 'Caja',
              description: 'Abrir la caja para cobrar',
              url: '/app/caja',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }],
            },
            {
              name: 'Nueva Venta',
              short_name: 'Venta',
              url: '/app/ventas?open=1',
              icons: [{ src: '/icon-192.png', sizes: '192x192' }],
            },
          ],
        },
        workbox: {
          // Archivos del app shell (JS, CSS, HTML, fuentes)
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],

          runtimeCaching: [
            // Productos: stale-while-revalidate (crítico para Caja Rápida offline)
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/productos'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'api-productos',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 }, // 24h
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Métodos de pago y configuración: stale 1h
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith('/api/config') ||
                url.pathname.startsWith('/api/metodos-pago'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'api-config',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            // Resto de la API: network-first con fallback de 10s
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-general',
                networkTimeoutSeconds: 10,
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }, // 5min
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
      }),
      ...(visualizerPlugin ? [visualizerPlugin] : []),
    ],
    server: {
      port: 5173,
      strictPort: false,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/recharts')) return 'charts';
            if (id.includes('node_modules/@tanstack/react-query')) return 'query';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            return undefined;
          },
        },
      },
    },
  };
});
