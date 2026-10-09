import { describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { IconPicker } from '../../../src/ui/components/IconPicker.jsx';

/**
 * @param {{ initial: string | null, automatic?: boolean, onChange?: (value: string | null) => void }} props
 */
function Harness({ initial, automatic = false, onChange = () => {} }) {
  const [value, setValue] = useState(initial);
  return (
    <IconPicker
      label="Icon"
      value={value}
      automatic={automatic ? { icon: 'bank', label: 'Automatic (Checking)' } : undefined}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe('IconPicker', () => {
  it('opens a window of grouped icons, and choosing one closes it and returns focus', async () => {
    const onChange = vi.fn();
    render(<Harness initial="cart" onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: 'Icon Cart' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Choose an icon' });
    const money = within(dialog).getByRole('region', { name: 'Money' });
    expect(within(money).getByRole('button', { name: 'Piggy bank' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cart' }).getAttribute('aria-current')).toBe(
      'true',
    );
    fireEvent.click(within(money).getByRole('button', { name: 'Piggy bank' }));
    expect(onChange).toHaveBeenCalledWith('piggyBank');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', { name: 'Icon Piggy bank' })).toBe(document.activeElement);
  });

  it('finds icons by name, search words, or group', async () => {
    render(<Harness initial="cart" />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon Cart' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an icon' });
    const search = within(dialog).getByLabelText('Search icons');
    fireEvent.input(search, { target: { value: 'supermarket' } });
    expect(within(dialog).getByRole('button', { name: 'Cart' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Dog' })).toBeNull();
    fireEvent.input(search, { target: { value: 'pets' } });
    expect(within(dialog).getByRole('button', { name: 'Dog' })).toBeTruthy();
    fireEvent.input(search, { target: { value: 'zzz' } });
    expect(within(dialog).getByText('No icons match. Try another word.')).toBeTruthy();
  });

  it('offers the automatic icon first and reports it as null', async () => {
    const onChange = vi.fn();
    render(<Harness initial="gem" automatic onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Icon Gem' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose an icon' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Automatic (Checking)' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole('button', { name: 'Icon Automatic (Checking)' })).toBeTruthy();
  });
});
