import { describe, expect, it } from 'vitest';
import {
  createAutomation,
  normalizeAutomationInput,
} from '../../../../src/core/domain/automation.js';
import {
  automationToDraft,
  newAutomationDraft,
  toAutomationInput,
  triggerDraft,
} from '../../../../src/ui/features/automations/automationDraft.js';

const refs = {
  accounts: new Map([['c', { currency: 'EUR' }]]),
  /** @type {Map<string, { kind: 'income' | 'expense' }>} */
  categories: new Map([['g', { kind: 'expense' }]]),
  defaultCurrency: 'EUR',
};
const today = '2024-05-15';

describe('automation draft', () => {
  it('starts a new automation empty', () => {
    const draft = newAutomationDraft({ today, defaults: { accountId: 'c', currency: 'EUR' } });
    expect(draft).toMatchObject({
      triggers: [],
      actions: [],
      conditions: { match: 'all', items: [] },
      startDate: today,
    });
  });

  it('turns "first time: next week" into a phase and back', () => {
    const draft = newAutomationDraft({ today, defaults: { accountId: 'c', currency: 'EUR' } });
    draft.triggers = [
      {
        ...triggerDraft('schedule', today),
        every: '2',
        unit: 'week',
        weekdays: [5],
        firstRound: '1',
      },
    ];
    draft.actions = [
      {
        ...newAutomationDraft({
          today,
          defaults: { accountId: 'c', currency: 'EUR' },
          budget: { categoryId: 'g', limit: '300' },
        }).actions[0],
      },
    ];
    draft.name = 'Fortnight';
    const fields = normalizeAutomationInput(toAutomationInput(draft, today), refs);
    const automation = createAutomation(fields, { id: 'a', now: 'n' });
    const back = automationToDraft(automation, {
      currencyOf: () => 'EUR',
      defaultCurrency: 'EUR',
      today,
    });
    expect(back.triggers[0]).toMatchObject({
      every: '2',
      unit: 'week',
      weekdays: [5],
      firstRound: '1',
    });
    // A week later, the same schedule's next round is this week.
    const later = automationToDraft(automation, {
      currencyOf: () => 'EUR',
      defaultCurrency: 'EUR',
      today: '2024-05-22',
    });
    expect(later.triggers[0].firstRound).toBe('0');
  });
});
