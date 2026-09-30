import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/preact';
import { AppShell } from '../../../src/app/AppShell.jsx';
import { createUiStores, renderWithStores } from '../../helpers/renderWithStores.jsx';

describe('AppShell', () => {
  it('renders navigation, marks the current page, and offers the add action', async () => {
    const { stores } = await createUiStores({ path: '/budgets' });
    const onAdd = vi.fn();
    renderWithStores(
      <AppShell onAddTransaction={onAdd}>
        <h1>Page</h1>
      </AppShell>,
      stores,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav).toBeTruthy();
    const current = screen.getByRole('link', { name: 'Budgets' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('main')).toBeTruthy();
    const addButtons = screen.getAllByRole('button', { name: 'Add transaction' });
    fireEvent.click(addButtons[0]);
    expect(onAdd).toHaveBeenCalled();
    expect(screen.getAllByText('Sync off').length).toBeGreaterThan(0);
  });

  it('shows toasts from the toast store', async () => {
    const { stores } = await createUiStores();
    renderWithStores(<AppShell onAddTransaction={() => {}}>x</AppShell>, stores);
    stores.toasts.show('toast.transactionSaved');
    expect(await screen.findByText('Transaction saved.')).toBeTruthy();
  });
});
