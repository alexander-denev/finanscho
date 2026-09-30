import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { Toast } from '../../../src/ui/components/Toast.jsx';

describe('Toast', () => {
  it('Toast announces messages and can be dismissed', () => {
    const onDismiss = vi.fn();
    render(
      <Toast
        toasts={[{ id: 7, message: 'Transaction saved.', tone: 'info' }]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Transaction saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
