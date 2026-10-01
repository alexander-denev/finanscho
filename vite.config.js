import { defineConfig, loadEnv } from 'vite';
import { preact } from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Install-sheet screenshots. They are only read by the browser's install UI, never by the app, so
 * they are kept out of the precache (scripts/verifyPwaBuild.js allows exactly the files the manifest lists).
 */
const SCREENSHOTS_DIR = 'screenshots';

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
        // The app applies updates itself, silently, once no form is open (serviceWorker.js, D36).
        registerType: 'prompt',
        injectRegister: null,
        manifest: {
          id: './',
          name: 'Finanscho',
          short_name: 'Finanscho',
          description: 'Local-first personal finance manager',
          lang: 'en',
          categories: ['finance'],
          theme_color: '#1f4a45',
          background_color: '#f6f3ec',
          display: 'standalone',
          orientation: 'any',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
          screenshots: [
            {
              src: `${SCREENSHOTS_DIR}/narrow.png`,
              sizes: '780x1688',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Dashboard with balances, this month, and budgets',
            },
            {
              src: `${SCREENSHOTS_DIR}/wide.png`,
              sizes: '1440x900',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Dashboard on a desktop screen',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
          globIgnores: [`${SCREENSHOTS_DIR}/**`],
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/webdav-proxy/],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          // No runtimeCaching: WebDAV traffic is cross-origin and must never be cached.
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
