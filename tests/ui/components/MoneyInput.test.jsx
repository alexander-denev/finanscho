import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { MoneyInput } from '../../../src/ui/components/MoneyInput.jsx';

describe('MoneyInput', () => {
  it('MoneyInput uses a decimal keyboard and shows the currency symbol', () => {
    const onInput = vi.fn();
    render(<MoneyInput label="Amount" value="12" onInput={onInput} currency="EUR" />);
    const input = screen.getByLabelText('Amount');
    expect(input.getAttribute('inputmode')).toBe('decimal');
    expect(screen.getByText('€')).toBeTruthy();
    fireEvent.input(input, { target: { value: '12,5' } });
    expect(onInput).toHaveBeenCalledWith('12,5');
  });
});
