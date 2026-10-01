import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/preact';
import { InstallInstructionsDialog } from '../../../src/ui/components/InstallInstructionsDialog.jsx';

/** @param {Partial<import('../../../src/ui/components/InstallInstructionsDialog.jsx').InstallInstructionsDialogProps>} props */
function renderDialog(props) {
  const handlers = { onInstall: vi.fn(), onExportBackup: vi.fn(), onClose: vi.fn() };
  render(<InstallInstructionsDialog open guidance="manual" {...handlers} {...props} />);
  return handlers;
}

describe('InstallInstructionsDialog', () => {
  it('walks iOS Safari users through Add to Home Screen and warns that data stays in Safari', () => {
    const handlers = renderDialog({ guidance: 'iosSafari' });
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(steps).toEqual([
      'Tap the Share button in Safari’s toolbar.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add. Finanscho appears on your home screen.',
    ]);
    expect(screen.getByText('Your data stays here in Safari')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export backup first' }));
    expect(handlers.onExportBackup).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Your data carries over to the installed app.')).toBeNull();
  });

  it('sends other iOS browsers to Safari first', () => {
    renderDialog({ guidance: 'iosOtherBrowser' });
    expect(screen.getByText(/Open it in Safari/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export backup first' })).toBeTruthy();
  });

  it('explains that Firefox on the desktop cannot install, with a data warning', () => {
    renderDialog({ guidance: 'firefoxDesktop' });
    expect(screen.getByText(/can’t install web apps/)).toBeTruthy();
    expect(screen.getByText('Your data stays in this browser')).toBeTruthy();
  });

  it('says data carries over where the installed app shares storage', () => {
    renderDialog({ guidance: 'manual' });
    expect(screen.getByText('Your data carries over to the installed app.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Export backup first' })).toBeNull();
  });

  it('offers the browser prompt when one is available, and shows export errors', () => {
    const handlers = renderDialog({ guidance: 'prompt', exportError: 'Something went wrong.' });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(handlers.onInstall).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
  });
});
