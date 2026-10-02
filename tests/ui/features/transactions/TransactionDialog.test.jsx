import { describe, expect, it, vi } from 'vitest';
import { signal } from '@preact/signals';
import { fireEvent, screen, within } from '@testing-library/preact';
import { TransactionDialog } from '../../../../src/ui/features/transactions/TransactionDialog.jsx';
import { createUiStores, renderWithStores } from '../../../helpers/renderWithStores.jsx';

describe('TransactionDialog', () => {
  it('closes and opens the add-account dialog when there is no account yet', async () => {
    const ui = await createUiStores({ path: '/' });
    const onClose = vi.fn();
    renderWithStores(
      <TransactionDialog request={signal({ id: null })} onClose={onClose} />,
      ui.stores,
    );
    const dialog = await screen.findByRole('dialog', { name: 'Add transaction' });
    expect(within(dialog).getByText('Add an account before recording transactions.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add account' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ui.stores.router.currentPath.value).toBe('/accounts/new');
  });
});
