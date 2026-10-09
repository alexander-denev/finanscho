import { describe, expect, it, vi } from 'vitest';
import { useState } from 'preact/hooks';
import { fireEvent, render, screen } from '@testing-library/preact';
import { IconSelect } from '../../../src/ui/components/IconSelect.jsx';

/** @type {import('../../../src/ui/components/IconSelect.jsx').IconSelectOption[]} */
const OPTIONS = [
  { value: '', label: 'Uncategorized', icon: 'help' },
  { value: 'groceries', label: 'Groceries', icon: 'cart', color: 'olive', group: 'Expense' },
  { value: 'gifts', label: 'Gifts', icon: 'gift', color: 'rose', group: 'Expense', disabled: true },
  { value: 'games', label: 'Games', icon: 'gamepad', color: 'plum', group: 'Expense' },
  { value: 'salary', label: 'Salary', icon: 'briefcase', color: 'teal', group: 'Income' },
];

/** @param {{ onChange?: (value: string) => void }} props */
function Harness({ onChange = () => {} }) {
  const [value, setValue] = useState('groceries');
  return (
    <IconSelect
      label="Category"
      value={value}
      options={OPTIONS}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const control = () => screen.getByRole('combobox', { name: 'Category' });
const activeOption = () =>
  document.getElementById(control().getAttribute('aria-activedescendant') ?? '');

describe('IconSelect', () => {
  it('shows the chosen option and lists every option in its group when opened', () => {
    render(<Harness />);
    expect(control().textContent).toContain('Groceries');
    expect(control().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(control());
    expect(control().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('group', { name: 'Income' }).textContent).toContain('Salary');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Uncategorized',
      'Groceries',
      'Gifts',
      'Games',
      'Salary',
    ]);
    expect(activeOption()?.textContent).toBe('Groceries');
  });

  it('chooses with the pointer and closes', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(control());
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Salary' }));
    expect(onChange).toHaveBeenCalledWith('salary');
    expect(control().textContent).toContain('Salary');
    expect(control().getAttribute('aria-expanded')).toBe('false');
  });

  it('moves with the arrow keys past disabled options and chooses with Enter', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.keyDown(control(), { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toBe('Groceries');
    fireEvent.keyDown(control(), { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toBe('Games');
    fireEvent.keyDown(control(), { key: 'End' });
    expect(activeOption()?.textContent).toBe('Salary');
    fireEvent.keyDown(control(), { key: 'Home' });
    expect(activeOption()?.textContent).toBe('Uncategorized');
    fireEvent.keyDown(control(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('jumps to an option by typing its first letters', () => {
    render(<Harness />);
    fireEvent.keyDown(control(), { key: 'g' });
    expect(activeOption()?.textContent).toBe('Games');
    fireEvent.keyDown(control(), { key: 'r' });
    expect(activeOption()?.textContent).toBe('Groceries');
  });

  it('cycles through the matches when one letter is repeated, skipping disabled ones', () => {
    render(<Harness />);
    fireEvent.keyDown(control(), { key: 'g' });
    expect(activeOption()?.textContent).toBe('Games');
    fireEvent.keyDown(control(), { key: 'g' });
    expect(activeOption()?.textContent).toBe('Groceries');
  });

  it('closes on Escape without letting an enclosing dialog see it', () => {
    const onOuterKeyDown = vi.fn();
    document.addEventListener('keydown', onOuterKeyDown);
    render(<Harness />);
    fireEvent.click(control());
    fireEvent.keyDown(control(), { key: 'Escape' });
    document.removeEventListener('keydown', onOuterKeyDown);
    expect(control().getAttribute('aria-expanded')).toBe('false');
    // An enclosing <dialog> must not see this Escape, or it would close too.
    expect(onOuterKeyDown).not.toHaveBeenCalled();
  });
});
