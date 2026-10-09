import { useEffect, useId, useRef } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { controlClassName, Field } from './Field.jsx';
import { Icon } from './Icon.jsx';
import { ItemIcon } from './ItemIcon.jsx';
import styles from './IconSelect.module.css';

/**
 * @typedef {object} IconSelectOption
 * @property {string} value
 * @property {string} label
 * @property {import('./Icon.jsx').IconName} [icon] shown on a circle tinted with `color`
 * @property {string | null} [color] swatch name or custom `#rrggbb`
 * @property {string} [group] options sharing a group are listed under that heading, in order
 * @property {boolean} [disabled]
 */

/**
 * @typedef {object} IconSelectProps
 * @property {string} label
 * @property {string} value
 * @property {readonly IconSelectOption[]} options
 * @property {(value: string) => void} onChange
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {boolean} [disabled]
 */

/** Typed letters within this many milliseconds extend the type-ahead search. */
const TYPE_AHEAD_MS = 600;

/**
 * Consecutive options of the same group, in order. Options without a group form unnamed runs.
 * @param {readonly IconSelectOption[]} options
 * @returns {{ group: string | undefined, items: { option: IconSelectOption, index: number }[] }[]}
 */
function groupRuns(options) {
  /** @type {{ group: string | undefined, items: { option: IconSelectOption, index: number }[] }[]} */
  const runs = [];
  options.forEach((option, index) => {
    const last = runs.at(-1);
    if (last && last.group === option.group) last.items.push({ option, index });
    else runs.push({ group: option.group, items: [{ option, index }] });
  });
  return runs;
}

/**
 * The next enabled option from `from` in `step` direction, or `from` when there is none.
 * @param {readonly IconSelectOption[]} options
 * @param {number} from
 * @param {number} step
 * @returns {number}
 */
function nextEnabled(options, from, step) {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i;
  }
  return from;
}

/**
 * A select that shows each option's icon (WAI-ARIA select-only combobox: a button opening a
 * listbox). Closed: ↓/↑/Enter/Space open the list, Home/End open it at the ends, typing letters
 * jumps to a match. Open: ↓/↑/Home/End move, Enter/Space choose, Escape or Tab closes it (Escape
 * without closing an enclosing dialog). Props mirror `Select`; selects use `onChange`.
 * @param {IconSelectProps} props
 * @returns {import('preact').JSX.Element}
 */
export function IconSelect({ label, value, options, onChange, hint, error, disabled }) {
  const listId = useId();
  const open = useSignal(false);
  const active = useSignal(-1);
  const upward = useSignal(false);
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const listRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const typed = useRef({ text: '', at: -Infinity });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const isOpen = open.value;
  const activeIndex = isOpen ? active.value : -1;
  /**
   * @param {number} index
   * @returns {string}
   */
  const optionId = (index) => `${listId}-${index}`;

  // DOM integration: open upward when the list wouldn't fit below, and keep the active option
  // scrolled into view.
  useEffect(() => {
    const button = buttonRef.current;
    const list = listRef.current;
    if (!isOpen || !button || !list) return;
    const rect = button.getBoundingClientRect();
    const below = globalThis.innerHeight - rect.bottom;
    upward.value = below < list.offsetHeight && rect.top > below;
  }, [isOpen, upward]);
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  /** @param {number} index */
  const openAt = (index) => {
    open.value = true;
    active.value = index;
  };
  const close = () => {
    open.value = false;
    active.value = -1;
  };
  /** @param {number} index */
  const choose = (index) => {
    const option = options[index];
    close();
    if (option && !option.disabled && option.value !== value) onChange(option.value);
  };
  const first = nextEnabled(options, -1, 1);
  const last = nextEnabled(options, options.length, -1);

  /**
   * Type-ahead: the first enabled option, after the current one when repeating one letter, whose
   * label starts with the typed text.
   * @param {KeyboardEvent} event
   * @returns {number}
   */
  const findTyped = (event) => {
    const recent = event.timeStamp - typed.current.at < TYPE_AHEAD_MS;
    const text = (recent ? typed.current.text : '') + event.key.toLocaleLowerCase();
    typed.current = { text, at: event.timeStamp };
    const repeat = [...text].every((char) => char === text[0]);
    const from = isOpen ? active.peek() : selectedIndex;
    const order = options.map((_, i) => (from + 1 + i) % options.length);
    const matches = (/** @type {string} */ needle) =>
      order.find(
        (i) => !options[i].disabled && options[i].label.toLocaleLowerCase().startsWith(needle),
      );
    return matches(text) ?? (repeat ? matches(text[0]) : undefined) ?? -1;
  };

  /**
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  const handleKeyDown = (event) => {
    const current = active.peek();
    if (!open.peek()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openAt(selectedIndex >= 0 ? selectedIndex : first);
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        openAt(event.key === 'Home' ? first : last);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const found = findTyped(event);
        if (found >= 0) openAt(found);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active.value = nextEnabled(options, current, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active.value = nextEnabled(options, current, -1);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      active.value = event.key === 'Home' ? first : last;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(current);
    } else if (event.key === 'Escape') {
      // Close only the list; a native <dialog> would otherwise close on this Escape.
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab') {
      close();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const found = findTyped(event);
      if (found >= 0) active.value = found;
    }
  };

  /**
   * @param {IconSelectOption} option
   * @returns {import('preact').JSX.Element}
   */
  const optionContent = (option) => (
    <>
      {option.icon && <ItemIcon icon={option.icon} color={option.color} size="sm" />}
      <span className={styles.label}>{option.label}</span>
    </>
  );

  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <>
          <button
            ref={buttonRef}
            id={id}
            type="button"
            className={`${controlClassName} ${styles.button}`}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            disabled={disabled}
            onClick={() =>
              open.peek() ? close() : openAt(selectedIndex >= 0 ? selectedIndex : first)
            }
            onBlur={close}
            onKeyDown={handleKeyDown}
          >
            {selected ? optionContent(selected) : <span className={styles.label} />}
            <span className={styles.chevron}>
              <Icon name="chevronDown" />
            </span>
          </button>
          <div
            ref={listRef}
            id={listId}
            className={`${styles.list} ${upward.value ? styles.upward : ''}`}
            role="listbox"
            aria-label={label}
            // Focus stays on the button (aria-activedescendant); -1 keeps the list out of the
            // tab order.
            tabIndex={-1}
            hidden={!isOpen}
            // Keep focus on the button so the list doesn't close before a click lands.
            onMouseDown={(event) => event.preventDefault()}
          >
            {isOpen &&
              groupRuns(options).map(({ group, items }, runIndex) => {
                const rows = items.map(({ option, index }) => (
                  <div
                    key={option.value}
                    id={optionId(index)}
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === activeIndex}
                    aria-disabled={option.disabled || undefined}
                    className={[
                      styles.option,
                      index === activeIndex ? styles.active : '',
                      option.disabled ? styles.disabled : '',
                    ].join(' ')}
                    onMouseDown={(event) => {
                      // Choose on press; the keyboard path is the button's ↓/↑/Enter.
                      event.preventDefault();
                      if (!option.disabled) choose(index);
                    }}
                  >
                    {optionContent(option)}
                    {option.value === value && (
                      <span className={styles.check}>
                        <Icon name="check" />
                      </span>
                    )}
                  </div>
                ));
                if (group === undefined) return rows;
                const headingId = `${listId}-group-${runIndex}`;
                return (
                  <div key={headingId} role="group" aria-labelledby={headingId}>
                    <div id={headingId} className={styles.group} role="presentation">
                      {group}
                    </div>
                    {rows}
                  </div>
                );
              })}
          </div>
        </>
      )}
    </Field>
  );
}
