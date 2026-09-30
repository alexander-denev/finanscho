import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { DateInput } from '../../../src/ui/components/DateInput.jsx';

describe('DateInput', () => {
  it('is a labelled date input that reports input events', () => {
    const onInput = vi.fn();
    render(<DateInput label="Date" value="2024-05-01" onInput={onInput} />);
    const input = screen.getByLabelText('Date');
    expect(input.getAttribute('type')).toBe('date');
    fireEvent.input(input, { target: { value: '2024-05-02' } });
    expect(onInput).toHaveBeenCalledWith('2024-05-02');
  });
});
