import { Amount } from '../../components/Amount.jsx';
import { formatDate, formatMoney, formatMonth, t } from '../../i18n/i18n.js';
import styles from './AutomationPreview.module.css';

/** @typedef {import('../../../core/services/AutomationService.js').AutomationPreview} Preview */
/** @typedef {import('../../../core/domain/automation.js').AutomationResult} AutomationResult */

/**
 * @typedef {object} AutomationPreviewProps
 * @property {Preview | null} preview null while the form is incomplete
 * @property {boolean} hasSchedule show the next dates
 * @property {boolean} reacts show the recent transactions that would set it off
 * @property {(accountId: string) => string} currencyOf
 * @property {(categoryId: string) => string | undefined} categoryName
 */

/**
 * What the automation being edited would do: its next dates and the recent transactions that
 * would set it off, each with what it would make. Nothing here is saved.
 * @param {AutomationPreviewProps} props
 * @returns {import('preact').JSX.Element}
 */
export function AutomationPreview({ preview, hasSchedule, reacts, currencyOf, categoryName }) {
  /**
   * @param {AutomationResult[]} results
   * @returns {import('preact').JSX.Element}
   */
  const resultList = (results) =>
    results.length === 0 ? (
      <p className={styles.muted}>{t('automations.preview.nothing')}</p>
    ) : (
      <ul className={styles.results}>
        {results.map((result) => (
          <li key={result.record.id} className={styles.result}>
            {result.entity === 'budgets' ? (
              <span>
                {t('automations.preview.setBudget', {
                  category: categoryName(result.record.categoryId) ?? '',
                  month: formatMonth(result.record.month),
                  amount: formatMoney(result.record.limitMinor, result.record.currency),
                })}
              </span>
            ) : (
              <>
                <span className={styles.title}>
                  {result.record.payee ||
                    (result.record.categoryId ? categoryName(result.record.categoryId) : '') ||
                    t(`kind.${result.record.kind}`)}
                  {result.record.note && (
                    <span className={styles.muted}> — {result.record.note}</span>
                  )}
                </span>
                <Amount
                  minor={result.record.amountMinor}
                  currency={currencyOf(result.record.accountId)}
                  kind={result.record.kind}
                />
              </>
            )}
          </li>
        ))}
      </ul>
    );

  return (
    <section className={styles.root} aria-label={t('automations.preview')} aria-live="polite">
      <h3 className={styles.heading}>{t('automations.preview')}</h3>
      {preview === null ? (
        <p className={styles.muted}>{t('automations.preview.incomplete')}</p>
      ) : (
        <>
          {hasSchedule && (
            <div className={styles.block}>
              <h4 className={styles.subheading}>{t('automations.preview.dates')}</h4>
              {preview.dates.length === 0 ? (
                <p className={styles.muted}>{t('automations.preview.noDates')}</p>
              ) : (
                <ul className={styles.entries}>
                  {preview.dates.map((entry) => (
                    <li key={entry.date}>
                      <time className={styles.date} dateTime={entry.date}>
                        {formatDate(entry.date, 'weekday')}
                      </time>
                      {resultList(entry.results)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {reacts && (
            <div className={styles.block}>
              <h4 className={styles.subheading}>{t('automations.preview.matches')}</h4>
              {preview.matches.length === 0 && (
                <p className={styles.muted}>{t('automations.preview.noMatches')}</p>
              )}
              <ul className={styles.entries}>
                {preview.matches.map(({ source, results }) => (
                  <li key={source.id}>
                    <span className={styles.source}>
                      <time className={styles.date} dateTime={source.date}>
                        {formatDate(source.date, 'short')}
                      </time>
                      <span className={styles.title}>
                        {source.payee ||
                          (source.categoryId ? categoryName(source.categoryId) : '') ||
                          t(`kind.${source.kind}`)}
                      </span>
                      <Amount
                        minor={source.amountMinor}
                        currency={currencyOf(source.accountId)}
                        kind={source.kind}
                      />
                    </span>
                    {resultList(results)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
