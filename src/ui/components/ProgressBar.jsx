import styles from './ProgressBar.module.css';

/**
 * @typedef {object} ProgressBarProps
 * @property {number} ratio 0 … 1 (values above 1 fill the bar)
 * @property {'under' | 'near' | 'over'} tone
 * @property {string} label accessible description, e.g. "Groceries: 80% of budget spent"
 */

/**
 * A thin progress bar. Tone is conveyed by color and by the label text, never by color alone.
 * @param {ProgressBarProps} props
 * @returns {import('preact').JSX.Element}
 */
export function ProgressBar({ ratio, tone, label }) {
  const safe = Number.isFinite(ratio) ? Math.max(0, ratio) : 1;
  const percent = Math.round(safe * 100);
  return (
    <div
      className={`${styles.track} ${styles[tone]}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(percent, 100)}
      aria-valuetext={`${percent}%`}
      style={{ '--progress': Math.min(safe, 1) }}
    >
      <div className={styles.fill} />
    </div>
  );
}
