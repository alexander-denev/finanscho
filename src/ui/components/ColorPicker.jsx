import { useId } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { t } from '../i18n/i18n.js';
import { itemColor } from '../styles/itemColor.js';
import { Dialog } from './Dialog.jsx';
import styles from './ColorPicker.module.css';

/** What the color wheel starts at when no custom color is chosen yet. */
const DEFAULT_CUSTOM = '#808080';

/**
 * @typedef {object} ColorPickerProps
 * @property {string} label
 * @property {string | null} value a swatch key or a custom `#rrggbb`
 * @property {readonly { value: string, label: string }[]} options swatch keys with names
 * @property {(value: string) => void} onChange
 * @property {string} customLabel names the last tile, which opens the system color wheel
 */

/**
 * Shows the chosen color on a button; the button opens a window with the color swatches and a
 * custom color tile (a native color input). Choosing a swatch closes the window and returns focus
 * to the button; a custom color applies as it changes.
 * @param {ColorPickerProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ColorPicker({ label, value, options, onChange, customLabel }) {
  const labelId = useId();
  const valueId = useId();
  const open = useSignal(false);
  const custom = value?.startsWith('#') ? value : null;
  const name = custom
    ? customLabel
    : (options.find((option) => option.value === value)?.label ?? t('common.none'));

  /** @param {string} next */
  const choose = (next) => {
    open.value = false;
    if (next !== value) onChange(next);
  };

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
        onClick={() => (open.value = true)}
      >
        <span
          className={styles.swatch}
          style={{ '--swatch': itemColor(value) }}
          aria-hidden="true"
        />
        <span id={valueId} className={styles.name}>
          {name}
        </span>
        <span className={styles.change}>{t('picker.change')}</span>
      </button>
      <Dialog open={open.value} title={t('colorPicker.title')} onClose={() => (open.value = false)}>
        <ul className={styles.tiles}>
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                className={styles.tile}
                aria-label={option.label}
                aria-current={option.value === value ? 'true' : undefined}
                title={option.label}
                data-autofocus={option.value === value ? true : undefined}
                onClick={() => choose(option.value)}
              >
                <span
                  className={styles.swatch}
                  style={{ '--swatch': itemColor(option.value) }}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
          <li>
            <label
              className={`${styles.tile} ${styles.customTile}`}
              aria-current={custom ? 'true' : undefined}
              title={customLabel}
            >
              <input
                className={styles.colorInput}
                type="color"
                value={custom ?? DEFAULT_CUSTOM}
                onInput={(event) => onChange(event.currentTarget.value.toLowerCase())}
              />
              <span
                className={`${styles.swatch} ${custom ? '' : styles.wheel}`}
                style={custom ? { '--swatch': itemColor(custom) } : undefined}
                aria-hidden="true"
              />
              <span className="visually-hidden">{customLabel}</span>
            </label>
          </li>
        </ul>
      </Dialog>
    </div>
  );
}
