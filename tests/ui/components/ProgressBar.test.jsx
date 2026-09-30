import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { ProgressBar } from '../../../src/ui/components/ProgressBar.jsx';

describe('ProgressBar', () => {
  it('ProgressBar exposes progress to assistive technology', () => {
    render(<ProgressBar ratio={1.25} tone="over" label="Dining: 125% of budget spent" />);
    const bar = screen.getByRole('progressbar', { name: 'Dining: 125% of budget spent' });
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('125%');
  });
});
