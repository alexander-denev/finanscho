import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { Dialog } from '../../../src/ui/components/Dialog.jsx';

function Harness({ onClose = () => {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <Dialog
        open={open}
        title="Edit thing"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <label>
          Name
          <input />
        </label>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens as a modal with a labelled title and renders children only while open', async () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open it' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit thing' });
    expect(/** @type {HTMLDialogElement} */ (dialog).open).toBe(true);
    expect(screen.getByLabelText('Name')).toBeTruthy();
  });

  it('closes from the close button and returns focus to the trigger', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole('button', { name: 'Open it' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByLabelText('Name')).toBeNull();
  });
});
