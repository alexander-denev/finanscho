import { defineConfig, loadEnv } from 'vite';
import { preact } from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Optional development proxy for WebDAV servers that do not send CORS headers.
 * Set WEBDAV_PROXY_TARGET (e.g. https://dav.example.com) in `.env.local`, then use
 * `http://localhost:5173/webdav-proxy/<path>` as the server URL in the app settings.
 * @param {Record<string, string>} env
 * @returns {Record<string, import('vite').ProxyOptions>}
 */
function webDavProxy(env) {
  const target = env.WEBDAV_PROXY_TARGET;
  if (!target) return {};
  return {
    '/webdav-proxy': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/webdav-proxy/, ''),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      preact(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: null,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Finanscho',
          short_name: 'Finanscho',
          description: 'Local-first personal finance manager',
          theme_color: '#1f4a45',
          background_color: '#f6f3ec',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
          navigateFallback: 'index.html',
        },
      }),
    ],
    resolve: {
      dedupe: ['preact', '@preact/signals-core'],
    },
    base: './',
    server: {
      proxy: webDavProxy(env),
    },
    build: {
      target: 'es2022',
    },
  };
});
