import { Icon } from '../../components/Icon.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { t } from '../../i18n/i18n.js';
import styles from './MorePage.module.css';

/** @type {ReadonlyArray<{ href: string, labelKey: string, icon: import('../../components/Icon.jsx').IconName }>} */
const LINKS = [
  { href: '/automations', labelKey: 'nav.automations', icon: 'bolt' },
  { href: '/categories', labelKey: 'nav.categories', icon: 'tag' },
  { href: '/settings', labelKey: 'nav.settings', icon: 'settings' },
];

/**
 * Secondary sections on phones, where the tab bar has room for five items only.
 * @returns {import('preact').JSX.Element}
 */
export function MorePage() {
  return (
    <>
      <PageHeader title={t('more.title')} />
      <ul className={styles.list}>
        {LINKS.map((link) => (
          <li key={link.href}>
            <a href={link.href} className={styles.link}>
              <Icon name={link.icon} />
              <span>{t(link.labelKey)}</span>
              <span className={styles.chevron}>
                <Icon name="chevronRight" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
