import { describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { fireEvent, render, screen } from '@testing-library/preact';
import { ComboBox } from '../../../src/ui/components/ComboBox.jsx';

const OPTIONS = [
  { value: 'Bakery', detail: 'Groceries' },
  { value: 'Lidl', detail: 'Groceries' },
  { value: 'Lido café' },
  { value: 'Billa' },
];

/** @param {{ onInput?: (value: string) => void }} props */
function Harness({ onInput = () => {} }) {
  const [value, setValue] = useState('');
  return (
    <ComboBox
      label="Payee"
      value={value}
      options={OPTIONS}
      onInput={(next) => {
        setValue(next);
        onInput(next);
      }}
    />
  );
}

const input = () =>
  /** @type {HTMLInputElement} */ (screen.getByRole('combobox', { name: 'Payee' }));
const optionNames = () => screen.queryAllByRole('option').map((o) => o.getAttribute('aria-label'));

describe('ComboBox', () => {
  it('shows recent options on focus and filters as you type, prefix matches first', () => {
    render(<Harness />);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    fireEvent.focus(input());
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(optionNames()).toEqual(['Bakery, Groceries', 'Lidl, Groceries', 'Lido café', 'Billa']);
    fireEvent.input(input(), { target: { value: 'l' } });
    // "Lidl" and "Lido café" start with "l"; "Billa" only contains it.
    expect(optionNames()).toEqual(['Lidl, Groceries', 'Lido café', 'Billa']);
    fireEvent.input(input(), { target: { value: 'lidl' } });
    expect(optionNames()).toEqual([]);
    expect(input().getAttribute('aria-expanded')).toBe('false');
  });

  it('chooses with the keyboard and closes on Escape without letting it bubble', () => {
    const onInput = vi.fn();
    const onOuterKeyDown = vi.fn();
    document.addEventListener('keydown', onOuterKeyDown);
    render(<Harness onInput={onInput} />);
    fireEvent.input(input(), { target: { value: 'l' } });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'ArrowDown' });
    const active = input().getAttribute('aria-activedescendant') ?? '';
    expect(document.getElementById(active)?.getAttribute('aria-label')).toBe('Lido café');
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onInput).toHaveBeenLastCalledWith('Lido café');
    expect(input().value).toBe('Lido café');
    expect(input().getAttribute('aria-expanded')).toBe('false');

    fireEvent.input(input(), { target: { value: 'b' } });
    expect(input().getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().getAttribute('aria-expanded')).toBe('false');
    const bubbled = onOuterKeyDown.mock.calls.map(([event]) => event.key);
    document.removeEventListener('keydown', onOuterKeyDown);
    // An enclosing <dialog> must not see this Escape, or it would close too.
    expect(bubbled).toContain('ArrowDown');
    expect(bubbled).not.toContain('Escape');
  });

  it('chooses an option with the pointer', () => {
    const onInput = vi.fn();
    render(<Harness onInput={onInput} />);
    fireEvent.focus(input());
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Billa' }));
    expect(onInput).toHaveBeenLastCalledWith('Billa');
    expect(input().value).toBe('Billa');
  });
});
