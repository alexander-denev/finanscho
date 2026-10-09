import { useId } from 'preact/hooks';
import { useSignal } from '@preact/signals';
import { controlClassName, Field } from './Field.jsx';
import { ItemIcon } from './ItemIcon.jsx';
import styles from './ComboBox.module.css';

/**
 * @typedef {object} ComboBoxOption
 * @property {string} value inserted into the field when chosen
 * @property {string} [detail] secondary text shown at the end of the row
 * @property {import('./Icon.jsx').IconName} [icon] shown before the detail, tinted with `color`
 * @property {string | null} [color]
 */

/**
 * @typedef {object} ComboBoxProps
 * @property {string} label
 * @property {string} value
 * @property {(value: string) => void} onInput called on typing and when an option is chosen
 * @property {readonly ComboBoxOption[]} options in preferred order (e.g. most recent first)
 * @property {string} [hint]
 * @property {string | null} [error]
 * @property {number} [maxOptions] how many matches are shown at once
 */

/**
 * @param {string} text
 * @returns {string}
 */
function fold(text) {
  return text.trim().toLocaleLowerCase();
}

/**
 * Options matching the typed text: those starting with it first, then those containing it, each
 * in the given order. An empty field matches everything; an exact match is left out, since there
 * is nothing left to complete.
 * @param {readonly ComboBoxOption[]} options
 * @param {string} value
 * @param {number} max
 * @returns {ComboBoxOption[]}
 */
function matchOptions(options, value, max) {
  const needle = fold(value);
  if (!needle) return options.slice(0, max);
  /** @type {ComboBoxOption[]} */
  const starts = [];
  /** @type {ComboBoxOption[]} */
  const contains = [];
  for (const option of options) {
    const text = fold(option.value);
    if (text === needle) continue;
    if (text.startsWith(needle)) starts.push(option);
    else if (text.includes(needle)) contains.push(option);
  }
  return [...starts, ...contains].slice(0, max);
}

/**
 * The option text with the matched part emphasized.
 * @param {string} text
 * @param {string} value the typed text
 * @returns {import('preact').ComponentChildren}
 */
function highlight(text, value) {
  const needle = fold(value);
  const at = needle ? text.toLocaleLowerCase().indexOf(needle) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className={styles.match}>{text.slice(at, at + needle.length)}</span>
      {text.slice(at + needle.length)}
    </>
  );
}

/**
 * A text field with a suggestion list (WAI-ARIA combobox with a listbox popup). The list opens on
 * focus and typing; ↓/↑ move through it, Enter chooses, Escape closes it (without closing an
 * enclosing dialog). Free text is always allowed.
 * @param {ComboBoxProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ComboBox({ label, value, onInput, options, hint, error, maxOptions = 6 }) {
  const listId = useId();
  const open = useSignal(false);
  const active = useSignal(-1);
  const matches = matchOptions(options, value, maxOptions);
  const expanded = open.value && matches.length > 0;
  const activeIndex = expanded ? active.value : -1;
  /**
   * @param {number} index
   * @returns {string}
   */
  const optionId = (index) => `${listId}-${index}`;

  /** @param {string} next */
  const choose = (next) => {
    open.value = false;
    active.value = -1;
    onInput(next);
  };

  /**
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  const handleKeyDown = (event) => {
    const isOpen = open.peek() && matches.length > 0;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open.value = true;
      active.value = Math.min(active.peek() + 1, matches.length - 1);
    } else if (event.key === 'ArrowUp' && isOpen) {
      event.preventDefault();
      active.value = Math.max(active.peek() - 1, -1);
    } else if (event.key === 'Enter' && isOpen && active.peek() >= 0) {
      event.preventDefault();
      choose(matches[active.peek()].value);
    } else if (event.key === 'Escape' && isOpen) {
      // Close only the list; a native <dialog> would otherwise close on this Escape.
      event.preventDefault();
      event.stopPropagation();
      open.value = false;
      active.value = -1;
    }
  };

  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <>
          <input
            id={id}
            className={controlClassName}
            type="text"
            role="combobox"
            value={value}
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            onInput={(event) => {
              open.value = true;
              active.value = -1;
              onInput(event.currentTarget.value);
            }}
            onFocus={() => {
              open.value = true;
            }}
            onBlur={() => {
              open.value = false;
              active.value = -1;
            }}
            onKeyDown={handleKeyDown}
          />
          <ul id={listId} className={styles.list} role="listbox" hidden={!expanded}>
            {expanded &&
              matches.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  // One clean name instead of the highlight and detail fragments.
                  aria-label={option.detail ? `${option.value}, ${option.detail}` : option.value}
                  aria-selected={index === activeIndex}
                  className={`${styles.option} ${index === activeIndex ? styles.active : ''}`}
                  // Keep focus in the input so the list doesn't close before the click lands.
                  onMouseDown={(event) => {
                    // Choose on press, keeping focus in the input (a click would blur it first
                    // and close the list). The keyboard path is the input's ↓/↑/Enter.
                    event.preventDefault();
                    choose(option.value);
                  }}
                >
                  <span className={styles.text}>{highlight(option.value, value)}</span>
                  {option.icon && <ItemIcon icon={option.icon} color={option.color} size="sm" />}
                  {option.detail && <span className={styles.detail}>{option.detail}</span>}
                </li>
              ))}
          </ul>
        </>
      )}
    </Field>
  );
}
