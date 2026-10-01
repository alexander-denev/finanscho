import { useSignalEffect } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { useStores } from '../ui/context/StoresProvider.jsx';
import { Icon } from '../ui/components/Icon.jsx';
import { Toast } from '../ui/components/Toast.jsx';
import { SyncIndicator } from '../ui/features/settings/SyncIndicator.jsx';
import { InstallBanner } from '../ui/features/install/InstallBanner.jsx';
import { t } from '../ui/i18n/i18n.js';
import styles from './AppShell.module.css';

/**
 * @typedef {object} NavItem
 * @property {string} path
 * @property {string} labelKey
 * @property {import('../ui/components/Icon.jsx').IconName} icon
 * @property {'both' | 'wide' | 'narrow'} placement where the item appears (CSS decides)
 */

/** @type {readonly NavItem[]} */
const NAV_ITEMS = [
  { path: '/', labelKey: 'nav.dashboard', icon: 'dashboard', placement: 'both' },
  { path: '/transactions', labelKey: 'nav.transactions', icon: 'list', placement: 'both' },
  { path: '/budgets', labelKey: 'nav.budgets', icon: 'budget', placement: 'both' },
  { path: '/accounts', labelKey: 'nav.accounts', icon: 'wallet', placement: 'both' },
  { path: '/recurring', labelKey: 'nav.recurring', icon: 'repeat', placement: 'wide' },
  { path: '/categories', labelKey: 'nav.categories', icon: 'tag', placement: 'wide' },
  { path: '/settings', labelKey: 'nav.settings', icon: 'settings', placement: 'wide' },
  { path: '/more', labelKey: 'nav.more', icon: 'more', placement: 'narrow' },
];

const MORE_PATHS = ['/more', '/recurring', '/categories', '/settings'];

/**
 * @param {NavItem} item
 * @param {string} current
 * @returns {boolean}
 */
function isActive(item, current) {
  if (item.path === '/') return current === '/';
  if (item.placement === 'narrow') return MORE_PATHS.includes(current);
  return current === item.path || current.startsWith(`${item.path}/`);
}

/**
 * @typedef {object} AppShellProps
 * @property {() => void} onAddTransaction
 * @property {import('preact').ComponentChildren} children
 */

/**
 * Layout: bottom tab bar with a floating add button below 1024 px, persistent sidebar from
 * 1024 px (switched by CSS media queries). Hosts the sync indicator, the install recommendation,
 * and toasts.
 * @param {AppShellProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AppShell({ onAddTransaction, children }) {
  const { router, toasts } = useStores();
  const main = useRef(/** @type {HTMLElement | null} */ (null));
  const firstRender = useRef(true);
  const current = router.currentPath.value;

  // Move focus to the new page after navigation so screen readers announce it.
  useSignalEffect(() => {
    void router.currentPath.value;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    main.current?.focus();
  });

  return (
    <div className={styles.shell}>
      <button type="button" className={styles.skip} onClick={() => main.current?.focus()}>
        {t('app.skipToContent')}
      </button>
      <nav className={styles.nav} aria-label={t('nav.label')}>
        <a href="#/" className={styles.brand}>
          {t('app.name')}
        </a>
        <ul className={styles.items}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, current);
            return (
              <li key={item.path} className={styles[item.placement]}>
                <a
                  href={`#${item.path}`}
                  className={`${styles.link} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon name={item.icon} />
                  <span className={styles.linkText}>{t(item.labelKey)}</span>
                </a>
              </li>
            );
          })}
        </ul>
        <div className={styles.navFooter}>
          <button type="button" className={styles.addWide} onClick={onAddTransaction}>
            <Icon name="plus" />
            {t('nav.addTransaction')}
          </button>
          <SyncIndicator />
        </div>
      </nav>
      <main ref={main} id="main" className={styles.main} tabIndex={-1}>
        <div className={styles.syncNarrow}>
          <SyncIndicator />
        </div>
        <InstallBanner />
        {children}
      </main>
      <button
        type="button"
        className={styles.fab}
        aria-label={t('nav.addTransaction')}
        onClick={onAddTransaction}
      >
        <Icon name="plus" />
      </button>
      <Toast
        toasts={toasts.toasts.value.map((toast) => ({
          id: toast.id,
          tone: toast.tone,
          message: t(toast.key, toast.params),
        }))}
        onDismiss={(id) => toasts.dismiss(id)}
      />
    </div>
  );
}
