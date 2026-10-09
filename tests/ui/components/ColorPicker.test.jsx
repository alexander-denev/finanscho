import { describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { ColorPicker } from '../../../src/ui/components/ColorPicker.jsx';

const OPTIONS = [
  { value: 'teal', label: 'Teal' },
  { value: 'rose', label: 'Rose' },
];

/** @param {{ onChange: (value: string) => void }} props */
function Harness({ onChange }) {
  const [value, setValue] = useState('teal');
  return (
    <ColorPicker
      label="Color"
      value={value}
      options={OPTIONS}
      customLabel="Custom color"
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('ColorPicker', () => {
  it('shows the chosen color and opens a window to pick another', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color Teal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a color' });
    expect(within(dialog).getByRole('button', { name: 'Teal' }).getAttribute('aria-current')).toBe(
      'true',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rose' }));
    expect(onChange).toHaveBeenCalledWith('rose');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Color Rose' })).toBeTruthy();
  });

  it('takes a custom color from the color wheel, in lowercase', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Color Teal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a color' });
    fireEvent.input(within(dialog).getByLabelText('Custom color'), {
      target: { value: '#AA3366' },
    });
    expect(onChange).toHaveBeenCalledWith('#aa3366');
    expect(screen.getByRole('button', { name: 'Color Custom color' })).toBeTruthy();
  });
});
