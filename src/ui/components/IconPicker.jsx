import { useId } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { t } from '../i18n/i18n.js';
import { ITEM_ICON_GROUPS } from '../icons/itemIconGroups.js';
import { Dialog } from './Dialog.jsx';
import { Icon } from './Icon.jsx';
import { ItemIcon } from './ItemIcon.jsx';
import { TextField } from './TextField.jsx';
import styles from './IconPicker.module.css';

/** @typedef {import('./Icon.jsx').IconName} IconName */

/**
 * @typedef {object} IconPickerProps
 * @property {string} label
 * @property {string | null} value the chosen icon key; null means automatic (needs `automatic`)
 * @property {(value: string | null) => void} onChange
 * @property {string | null} [color] previews the icon in the item's color
 * @property {{ icon: IconName, label: string }} [automatic] offers a first "automatic" choice
 *   (null), shown with the icon it currently stands for
 */

/**
 * @param {string} text
 * @returns {string}
 */
function fold(text) {
  return text.trim().toLocaleLowerCase();
}

/**
 * The groups with only the icons whose name, search words, or group name contain every typed
 * word.
 * @param {string} query
 * @returns {{ group: string, icons: readonly IconName[] }[]}
 */
function matchGroups(query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return ITEM_ICON_GROUPS.map(({ group, icons }) => ({
    group,
    icons: words.length
      ? icons.filter((icon) => {
          const text = fold(
            `${t(`icon.${icon}`)} ${t(`iconTags.${icon}`)} ${t(`iconGroup.${group}`)}`,
          );
          return words.every((word) => text.includes(word));
        })
      : icons,
  })).filter(({ icons }) => icons.length > 0);
}

/**
 * Shows the chosen icon on a button; the button opens a window with a search box and the icons
 * in groups. Choosing an icon closes the window and returns focus to the button.
 * @param {IconPickerProps} props
 * @returns {import('preact').JSX.Element}
 */
export function IconPicker({ label, value, onChange, color = null, automatic }) {
  const labelId = useId();
  const valueId = useId();
  const open = useSignal(false);
  const query = useSignal('');
  const shown = /** @type {IconName} */ (value ?? automatic?.icon ?? 'dots');
  const shownName = value === null && automatic ? automatic.label : t(`icon.${shown}`);
  const groups = open.value ? matchGroups(query.value) : [];

  /** @param {string | null} next */
  const choose = (next) => {
    open.value = false;
    if (next !== value) onChange(next);
  };

  /**
   * @param {string | null} key
   * @param {IconName} icon
   * @param {string} name
   * @returns {import('preact').JSX.Element}
   */
  const tile = (key, icon, name) => (
    <li key={key ?? ''}>
      <button
        type="button"
        className={styles.tile}
        aria-label={name}
        aria-current={key === value ? 'true' : undefined}
        title={name}
        onClick={() => choose(key)}
      >
        <Icon name={icon} />
      </button>
    </li>
  );

  return (
    <div className={styles.root}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <button
        type="button"
        className={styles.trigger}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        onClick={() => {
          query.value = '';
          open.value = true;
        }}
      >
        <ItemIcon icon={shown} color={color} />
        <span id={valueId} className={styles.name}>
          {shownName}
        </span>
        <span className={styles.change}>{t('picker.change')}</span>
      </button>
      <Dialog open={open.value} title={t('iconPicker.title')} onClose={() => (open.value = false)}>
        <div className={styles.body}>
          <TextField
            label={t('iconPicker.search')}
            type="search"
            value={query.value}
            autoComplete="off"
            data-autofocus
            onInput={(text) => (query.value = text)}
          />
          {automatic && !query.value.trim() && (
            <section className={styles.group} aria-labelledby={`${labelId}-automatic`}>
              <h3 id={`${labelId}-automatic`} className={styles.groupName}>
                {t('iconPicker.automaticGroup')}
              </h3>
              <ul className={styles.tiles}>{tile(null, automatic.icon, automatic.label)}</ul>
            </section>
          )}
          {groups.map(({ group, icons }) => {
            const headingId = `${labelId}-${group}`;
            return (
              <section key={group} className={styles.group} aria-labelledby={headingId}>
                <h3 id={headingId} className={styles.groupName}>
                  {t(`iconGroup.${group}`)}
                </h3>
                <ul className={styles.tiles}>
                  {icons.map((icon) => tile(icon, icon, t(`icon.${icon}`)))}
                </ul>
              </section>
            );
          })}
          {groups.length === 0 && <p className={styles.empty}>{t('iconPicker.noMatch')}</p>}
        </div>
      </Dialog>
    </div>
  );
}
