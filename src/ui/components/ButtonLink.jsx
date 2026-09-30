import { buttonClass } from './Button.jsx';
import { Icon } from './Icon.jsx';

/**
 * @typedef {object} ButtonLinkProps
 * @property {string} href
 * @property {import('./Button.jsx').ButtonVariant} [variant]
 * @property {import('./Icon.jsx').IconName} [icon]
 * @property {import('preact').ComponentChildren} children
 */

/**
 * A link styled as a button, for navigation actions.
 * @param {ButtonLinkProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ButtonLink({ href, variant = 'secondary', icon, children }) {
  return (
    <a href={href} className={buttonClass(variant, false)}>
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}
