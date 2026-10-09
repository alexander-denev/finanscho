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
    fireEvent.click(within(dialog).getByRole('button', { name: 'Icon Other' }));
    const icons = await screen.findByRole('dialog', { name: 'Choose an icon' });
    fireEvent.click(within(icons).getByRole('button', { name: 'Work' }));
    expect(within(dialog).getByRole('button', { name: 'Icon Work' })).toBeTruthy();
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

  it('deletes an unused category and explains why a used one stays', async () => {
    const ui = await createUiStores({ path: '/categories' });
    const account = await ui.stores.accounts.create({
      name: 'Main',
      type: 'checking',
      currency: 'EUR',
      openingBalance: '0',
    });
    await ui.stores.transactions.save({
      kind: 'expense',
      date: '2024-05-10',
      amount: '1',
      accountId: account.id,
      categoryId: 'seed:groceries',
    });
    await ui.settled();
    renderWithStores(<CategoriesPage />, ui.stores);

    fireEvent.click(screen.getByRole('button', { name: 'Groceries' }));
    let dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(
      await within(dialog).findByText(
        'This category has transactions or automations that use it, so it can’t be deleted. Archive it instead.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Travel' }));
    dialog = await screen.findByRole('dialog', { name: 'Edit category' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete category' });
    expect(within(confirm).getByText('Delete Travel? This can’t be undone.')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete category' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Travel' })).toBeNull());
    expect(ui.stores.toasts.toasts.value.map((t) => t.key)).toContain('toast.categoryDeleted');
  });
});
