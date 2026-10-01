import { render } from 'preact';
import './ui/styles/tokens.css';
import './ui/styles/global.css';
import { App } from './app/App.jsx';
import { createContainer } from './app/createContainer.js';
import { t } from './ui/i18n/i18n.js';

const root = document.getElementById('app');

/**
 * `registerSW` in production builds that can run a service worker; undefined otherwise.
 * @returns {Promise<import('./infrastructure/platform/serviceWorker.js').RegisterSw | undefined>}
 */
function loadServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return Promise.resolve(undefined);
  return import('virtual:pwa-register').then(
    ({ registerSW }) => registerSW,
    () => undefined,
  );
}

if (root) {
  root.textContent = t('app.loading');
  loadServiceWorkerRegistration()
    .then((registerServiceWorker) => createContainer({ window, registerServiceWorker }))
    .then((container) => {
      root.textContent = '';
      render(<App stores={container.stores} />, root);
    })
    .catch(() => {
      root.textContent = '';
      render(
        <main className="fatal">
          <h1>{t('app.fatal.title')}</h1>
          <p>{t('app.fatal.body')}</p>
        </main>,
        root,
      );
    });
}
