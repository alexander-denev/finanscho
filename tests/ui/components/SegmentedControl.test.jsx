import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { SegmentedControl } from '../../../src/ui/components/SegmentedControl.jsx';

describe('SegmentedControl', () => {
  it('is a labelled radio group', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        legend="Type"
        value="expense"
        options={[
          { value: 'expense', label: 'Expense' },
          { value: 'income', label: 'Income' },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Type' })).toBeTruthy();
    const expense = /** @type {HTMLInputElement} */ (
      screen.getByRole('radio', { name: 'Expense' })
    );
    expect(expense.checked).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Income' }));
    expect(onChange).toHaveBeenCalledWith('income');
  });
});
