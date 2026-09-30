import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/preact';
import { Amount } from '../../../src/ui/components/Amount.jsx';

describe('Amount', () => {
  it('Amount shows direction with a sign and a hidden label, not color alone', () => {
    const { container } = render(
      <>
        <Amount minor={1230} currency="EUR" kind="expense" />
        <Amount minor={250000} currency="EUR" kind="income" />
        <Amount minor={-500} currency="EUR" kind="signed" />
        <Amount minor={700} currency="EUR" kind="transfer" />
      </>,
    );
    const texts = [...container.querySelectorAll(':scope > span')].map((el) => el.textContent);
    expect(texts).toEqual([
      'Expense -€12.30',
      'Income +€2,500.00',
      'Negative -€5.00',
      'Transfer ⇄ €7.00',
    ]);
  });
});
