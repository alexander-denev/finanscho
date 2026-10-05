/**
 * The short lines that stand for each "When", check, and step on the automation pages, e.g.
 * "Every 2 weeks on Fri" or "Transfer 10% · Checking → Savings". Weekday and month names come
 * from `Intl` in the user's language.
 */

import { parseMoney } from '../../../core/domain/money.js';
import { formatMoney, getLocale, t } from '../../i18n/i18n.js';

/** @typedef {import('./automationDraft.js').ConditionDraft} ConditionDraft */
/** @typedef {import('./automationDraft.js').GroupDraft} GroupDraft */
/** @typedef {import('./automationDraft.js').ActionDraft} ActionDraft */

/**
 * A "When" in the shape the service takes or stores (numbers may still be strings).
 * @typedef {object} TriggerLike
 * @property {string} type
 * @property {number | string} [every]
 * @property {string} [unit]
 * @property {Array<number | string>} [weekdays]
 * @property {{ kind: string, day?: number | string, nth?: number | string, weekday?: number | string }} [monthDay]
 * @property {number | string} [month]
 * @property {number | string} [day]
 * @property {string} [weekend]
 */

/**
 * Names the user's accounts and categories.
 * @typedef {object} Names
 * @property {(accountId: string) => string} account
 * @property {(categoryId: string) => string} category
 * @property {(accountId: string) => string} currencyOf
 */

/**
 * The weekday's name, e.g. "Mon" (short) or "Monday" (long).
 * @param {number} isoWeekday 1 = Monday … 7 = Sunday
 * @param {'short' | 'long'} width
 * @returns {string}
 */
export function weekdayName(isoWeekday, width) {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(getLocale(), { weekday: width, timeZone: 'UTC' }).format(
    Date.UTC(2024, 0, isoWeekday),
  );
}

/**
 * @param {number} month 1-12
 * @returns {string} e.g. "January"
 */
export function monthName(month) {
  return new Intl.DateTimeFormat(getLocale(), { month: 'long', timeZone: 'UTC' }).format(
    Date.UTC(2024, month - 1, 1),
  );
}

/**
 * @param {number} month 1-12
 * @param {number} day
 * @returns {string} e.g. "1 January" or "January 1", as the language writes it
 */
function dayOfYear(month, day) {
  return new Intl.DateTimeFormat(getLocale(), {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(2024, month - 1, day));
}

/**
 * @param {TriggerLike} trigger
 * @returns {string} what the schedule picks within each round, e.g. "Mon, Tue" or "day 15"
 */
function onWhat(trigger) {
  switch (trigger.unit) {
    case 'week':
      return (trigger.weekdays ?? []).map((d) => weekdayName(Number(d), 'short')).join(', ');
    case 'month': {
      const monthDay = trigger.monthDay;
      if (monthDay?.kind === 'weekday') {
        return t('automations.text.nthWeekday', {
          nth: t(`automations.nth.${Number(monthDay.nth)}`),
          weekday: weekdayName(Number(monthDay.weekday), 'long'),
        });
      }
      const day = Number(monthDay?.day);
      return day === 31 ? t('automations.text.lastDay') : t('automations.text.day', { day });
    }
    case 'year':
      return dayOfYear(Number(trigger.month), Number(trigger.day));
    default:
      return '';
  }
}

/**
 * One "When" as a short line.
 * @param {TriggerLike} trigger
 * @returns {string}
 */
export function describeTrigger(trigger) {
  if (trigger.type === 'transactionRecorded') return t('automations.summary.transactionRecorded');
  const every = Number(trigger.every);
  const unit = trigger.unit ?? 'month';
  const everyDayOfTheWeek =
    unit === 'week' && every === 1 && new Set((trigger.weekdays ?? []).map(Number)).size === 7;
  if ((unit === 'day' && every === 1) || everyDayOfTheWeek) return t('automations.text.everyDay');
  const repeat =
    every === 1
      ? t(`automations.text.every.${unit}`)
      : t(`automations.text.everyN.${unit}`, { n: every });
  const line = unit === 'day' ? repeat : t('automations.text.on', { repeat, on: onWhat(trigger) });
  const weekendApplies =
    unit === 'year' || (unit === 'month' && trigger.monthDay?.kind !== 'weekday');
  return weekendApplies && trigger.weekend && trigger.weekend !== 'keep'
    ? t('automations.text.withWeekend', {
        line,
        rule: t(`automations.text.weekend.${trigger.weekend}`),
      })
    : line;
}

/**
 * @param {string} amount typed amount
 * @param {string} currency
 * @returns {string}
 */
function money(amount, currency) {
  const parsed = parseMoney(amount, currency);
  return parsed.ok ? formatMoney(parsed.minor, currency) : amount;
}

/**
 * One check as a short line, e.g. "Type is Income" or "Payee contains “ACME”".
 * @param {ConditionDraft} condition
 * @param {Names} names
 * @returns {string}
 */
export function describeCondition(condition, names) {
  const what = t(`automations.field.${condition.field}`);
  const how = t(`automations.op.${condition.op}`);
  /** @type {string} */
  let value;
  switch (condition.field) {
    case 'account':
    case 'toAccount':
      value = names.account(condition.accountId);
      break;
    case 'kind':
      value = t(`kind.${condition.kind}`);
      break;
    case 'category':
      if (condition.op === 'isEmpty')
        return t('automations.text.check', { what, how, value: '' }).trim();
      value = names.category(condition.categoryId);
      break;
    case 'payee':
      value = t('automations.text.quoted', { text: condition.text });
      break;
    default:
      value = money(condition.amount, condition.currency);
  }
  return t('automations.text.check', { what, how, value });
}

/**
 * A group as a short line, e.g. "Any of: Payee contains “ACME”, Amount is at least €1,000.00".
 * @param {GroupDraft} group
 * @param {Names} names
 * @returns {string}
 */
export function describeGroup(group, names) {
  if (group.items.length === 0) return t('automations.text.emptyGroup');
  return t(`automations.text.group.${group.match}`, {
    checks: group.items.map((item) => describeCondition(item, names)).join(', '),
  });
}

/**
 * One step as a short line, e.g. "Expense €800.00 · Checking · Rent {month}" or "Set Groceries
 * budget to €300.00".
 * @param {ActionDraft} action
 * @param {Names} names
 * @returns {string}
 */
export function describeAction(action, names) {
  const percent = action.amountType === 'percent';
  if (action.type === 'setBudget') {
    return t('automations.text.setBudget', {
      category: names.category(action.budgetCategoryId),
      amount: percent
        ? t('automations.text.percentOfRecorded', { percent: action.amount })
        : money(action.amount, action.currency),
    });
  }
  const amount = percent
    ? t('automations.text.percent', { percent: action.amount })
    : money(action.amount, names.currencyOf(action.accountId));
  const where =
    action.kind === 'transfer'
      ? `${names.account(action.accountId)} → ${names.account(action.toAccountId)}`
      : names.account(action.accountId);
  return [`${t(`kind.${action.kind}`)} ${amount}`, where, action.payee, action.note]
    .filter((part) => part && part.trim())
    .join(' · ');
}
