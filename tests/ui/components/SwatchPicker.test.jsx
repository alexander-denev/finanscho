import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { SwatchPicker } from '../../../src/ui/components/SwatchPicker.jsx';

describe('SwatchPicker', () => {
  it('names each swatch for assistive technology', () => {
    const onChange = vi.fn();
    render(
      <SwatchPicker
        legend="Color"
        value="teal"
        options={[
          { value: 'teal', label: 'Teal' },
          { value: 'rose', label: 'Rose' },
        ]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole('group', { name: 'Color' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Rose' }));
    expect(onChange).toHaveBeenCalledWith('rose');
  });
});
