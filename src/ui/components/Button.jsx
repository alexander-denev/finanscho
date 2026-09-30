import { Icon } from './Icon.jsx';
import styles from './Button.module.css';

/** @typedef {'primary' | 'secondary' | 'ghost' | 'danger'} ButtonVariant */

/**
 * @typedef {Omit<import('preact').JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'icon' | 'type'> & {
 *   variant?: ButtonVariant,
 *   icon?: import('./Icon.jsx').IconName,
 *   type?: 'button' | 'submit' | 'reset',
 * }} ButtonProps
 */

/**
 * Builds the class list for a button-styled element.
 * @param {ButtonVariant} variant
 * @param {boolean} iconOnly
 * @returns {string}
 */
export function buttonClass(variant, iconOnly) {
  return [styles.button, styles[variant], iconOnly ? styles.iconOnly : '']
    .filter(Boolean)
    .join(' ');
}

/**
 * A button. The label says what happens ("Save transaction"). Icon-only buttons need `aria-label`.
 * @param {ButtonProps} props
 * @returns {import('preact').JSX.Element}
 */
export function Button({ variant = 'secondary', icon, type = 'button', children, ...rest }) {
  const iconOnly = icon !== undefined && (children === undefined || children === null);
  return (
    <button type={type} className={buttonClass(variant, iconOnly)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
