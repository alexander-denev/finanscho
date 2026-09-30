import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { EmptyState } from '../../../src/ui/components/EmptyState.jsx';
import { Button } from '../../../src/ui/components/Button.jsx';

describe('EmptyState', () => {
  it('EmptyState tells the user what to do', () => {
    render(
      <EmptyState title="No accounts yet" body="Add one." action={<Button>Add account</Button>} />,
    );
    expect(screen.getByRole('heading', { name: 'No accounts yet' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add account' })).toBeTruthy();
  });
});
