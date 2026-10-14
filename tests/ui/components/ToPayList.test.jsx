import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/preact';
import { ToPayList } from '../../../src/ui/components/ToPayList.jsx';
import { toPayListItem } from '../../../src/ui/components/toPayListItem.js';

/** @typedef {import('../../../src/ui/components/toPayListItem.js').ToPayListItem} ToPayListItem */

/**
 * @param {Partial<ToPayListItem>} over
 * @returns {ToPayListItem}
 */
const item = (over) => ({
  id: 'tp',
  title: 'Rent',
  details: 'Housing · Checking',
  icon: 'home',
  color: 'teal',
  minor: 80000,
  currency: 'EUR',
  kind: 'expense',
  dueDate: null,
  automatic: false,
  ...over,
});

describe('ToPayList', () => {
  it('counts the days left: yellow on the due date, red after it', () => {
    render(
      <ToPayList
        today="2024-05-15"
        items={[
          item({ id: 'a', title: 'Ahead', dueDate: '2024-05-20' }),
          item({ id: 't', title: 'Tomorrow', dueDate: '2024-05-16' }),
          item({ id: 'd', title: 'Today', dueDate: '2024-05-15' }),
          item({ id: 'o', title: 'Yesterday', dueDate: '2024-05-14' }),
          item({ id: 'l', title: 'Late', dueDate: '2024-05-12' }),
          item({ id: 'n', title: 'Whenever', dueDate: null }),
        ]}
        onSelect={() => {}}
        onPay={() => {}}
        onDelete={() => {}}
      />,
    );
    /** @param {string} title */
    const row = (title) => /** @type {HTMLElement} */ (screen.getByText(title).closest('li'));
    expect(row('Ahead').textContent).toContain('Due May 20, 2024 · 5 days left');
    expect(row('Tomorrow').textContent).toContain('1 day left');
    expect(within(row('Today')).getByText(/Due today/).className).toMatch(/today/);
    expect(within(row('Yesterday')).getByText(/1 day overdue/).className).toMatch(/overdue/);
    expect(row('Late').textContent).toContain('3 days overdue');
    expect(row('Whenever').textContent).not.toContain('Due');
    expect(row('Ahead').textContent).toContain('-€800.00');
  });

  it('marks automatic To pays and calls back for open, pay, and delete', () => {
    const onSelect = vi.fn();
    const onPay = vi.fn();
    const onDelete = vi.fn();
    render(
      <ToPayList
        label="To pays"
        today="2024-05-15"
        items={[item({ id: 'x', automatic: true })]}
        onSelect={onSelect}
        onPay={onPay}
        onDelete={onDelete}
      />,
    );
    const list = screen.getByRole('list', { name: 'To pays' });
    expect(within(list).getByText('Automatic')).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: /^Rent/ }));
    fireEvent.click(within(list).getByRole('button', { name: 'Pay Rent' }));
    fireEvent.click(within(list).getByRole('button', { name: 'Delete Rent' }));
    expect(onSelect).toHaveBeenCalledWith('x');
    expect(onPay).toHaveBeenCalledWith('x');
    expect(onDelete).toHaveBeenCalledWith('x');
  });

  it('describes a To pay like a transaction row', () => {
    const accounts = new Map([
      ['a1', { name: 'Checking', currency: 'EUR' }],
      ['a2', { name: 'Savings', currency: 'EUR' }],
    ]);
    const categories = new Map([
      ['c1', { name: 'Housing', icon: /** @type {const} */ ('home'), color: 'teal' }],
    ]);
    /** @type {import('../../../src/core/domain/toPay.js').ToPay} */
    const base = {
      id: 'tp',
      kind: 'expense',
      amountMinor: 100,
      accountId: 'a1',
      toAccountId: null,
      categoryId: 'c1',
      payee: '',
      note: 'June',
      dueDate: null,
      automationId: 'auto',
      createdAt: 't',
      updatedAt: 't',
      deleted: false,
    };
    expect(toPayListItem(base, { accounts, categories })).toMatchObject({
      title: 'Housing',
      details: 'Housing · Checking — June',
      icon: 'home',
      automatic: true,
    });
    expect(
      toPayListItem(
        { ...base, kind: 'transfer', toAccountId: 'a2', categoryId: null, note: '' },
        { accounts, categories },
      ),
    ).toMatchObject({
      title: 'Transfer to Savings',
      details: 'Checking → Savings',
      icon: 'transfer',
    });
  });
});
