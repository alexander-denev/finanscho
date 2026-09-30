import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Select } from '../../../src/ui/components/Select.jsx';

describe('Select', () => {
  it('reports changes with onChange', () => {
    const onChange = vi.fn();
    render(
      <Select
        label="Account"
        value="a"
        options={[
          { value: 'a', label: 'Main' },
          { value: 'b', label: 'Cash' },
        ]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledWith('b');
  });
});
