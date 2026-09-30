import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { MonthPicker } from '../../../src/ui/components/MonthPicker.jsx';

describe('MonthPicker', () => {
  it('MonthPicker steps months and can clear to all months', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <MonthPicker
        label="Month"
        value="2024-01"
        fallback="2024-05"
        onChange={onChange}
        allLabel="All months"
      />,
    );
    expect(screen.getByText('January 2024')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(onChange).toHaveBeenLastCalledWith('2023-12');
    fireEvent.click(screen.getByRole('button', { name: 'All months' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    rerender(
      <MonthPicker
        label="Month"
        value={null}
        fallback="2024-05"
        onChange={onChange}
        allLabel="All months"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(onChange).toHaveBeenLastCalledWith('2024-05');
  });
});
