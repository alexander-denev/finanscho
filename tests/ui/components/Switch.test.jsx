import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Switch } from '../../../src/ui/components/Switch.jsx';

describe('Switch', () => {
  it('is a labelled switch with a linked hint', () => {
    const onChange = vi.fn();
    render(<Switch label="Repeat" hint="Every month" checked={false} onChange={onChange} />);
    const control = /** @type {HTMLInputElement} */ (
      screen.getByRole('switch', { name: 'Repeat' })
    );
    expect(control.checked).toBe(false);
    const hintId = control.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(hintId)?.textContent).toBe('Every month');
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
