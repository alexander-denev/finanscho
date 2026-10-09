import { fireEvent, within } from '@testing-library/preact';

/**
 * Opens an `IconSelect` and chooses the option with the given name, the way a pointer does.
 * @param {HTMLElement} control the select's combobox button (e.g. from `getByLabelText`)
 * @param {string | RegExp} name the option's accessible name
 * @returns {void}
 */
export function chooseOption(control, name) {
  fireEvent.click(control);
  const list = document.getElementById(control.getAttribute('aria-controls') ?? '');
  if (!list) throw new Error('The control has no listbox');
  fireEvent.mouseDown(within(list).getByRole('option', { name }));
}
