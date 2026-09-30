import { render } from 'preact';
import './ui/styles/tokens.css';
import './ui/styles/global.css';
import { App } from './app/App.jsx';
import { createContainer } from './app/createContainer.js';
import { isNative } from './infrastructure/platform/platform.js';
import { t } from './ui/i18n/i18n.js';

const root = document.getElementById('app');

if (root) {
  root.textContent = t('app.loading');
  createContainer({ window })
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

  // Offline support on the web. Native builds bundle their assets, so they skip the worker.
  if (!isNative() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  }
}
