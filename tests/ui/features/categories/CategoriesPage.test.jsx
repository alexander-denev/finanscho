import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { CategoriesPage } from '../../../../src/ui/features/categories/CategoriesPage.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('CategoriesPage', () => {
  it('lists seeded categories and adds a new income category', async () => {
    const ui = await createUiStores({ path: '/categories' });
    renderWithStores(<CategoriesPage />, ui.stores);
    expect(screen.getByRole('heading', { name: 'Expense categories' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Groceries' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add category' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add category' });
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Side gigs' } });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Income' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Work' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));

    const income = await screen.findByRole('heading', { name: 'Income categories' });
    const section = /** @type {HTMLElement} */ (income.closest('section'));
    expect(await within(section).findByRole('button', { name: 'Side gigs' })).toBeTruthy();
  });

  it('renames and archives a category', async () => {
    const ui = await createUiStores({ path: '/categories' });
    renderWithStores(<CategoriesPage />, ui.stores);
    fireEvent.click(screen.getByRole('button', { name: 'Travel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    expect(within(dialog).queryByRole('radio', { name: 'Income' })).toBeNull();
    fireEvent.input(within(dialog).getByLabelText('Name'), { target: { value: 'Trips' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save category' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Trips' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Archive' }));
    const archived = await screen.findByRole('heading', { name: 'Archived categories' });
    await waitFor(() =>
      expect(
        within(/** @type {HTMLElement} */ (archived.closest('section'))).getByRole('button', {
          name: 'Trips',
        }),
      ).toBeTruthy(),
    );
  });
});
