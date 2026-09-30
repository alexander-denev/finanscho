import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { TextField } from '../../../src/ui/components/TextField.jsx';

describe('TextField', () => {
  it('TextField labels the input, reports every keystroke, and links hint and error', () => {
    const onInput = vi.fn();
    render(
      <TextField label="Payee" value="" onInput={onInput} hint="Who you paid" error="Too long" />,
    );
    const input = screen.getByLabelText('Payee');
    fireEvent.input(input, { target: { value: 'Market' } });
    expect(onInput).toHaveBeenCalledWith('Market');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    const texts = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['Who you paid', 'Too long']);
  });
});
