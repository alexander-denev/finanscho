import { SWATCHES } from '../../../core/domain/account.js';
import { CATEGORY_ICONS } from '../../../core/domain/category.js';
import { Button } from '../../components/Button.jsx';
import { InlineMessage } from '../../components/InlineMessage.jsx';
import { SegmentedControl } from '../../components/SegmentedControl.jsx';
import { SwatchPicker } from '../../components/SwatchPicker.jsx';
import { TextField } from '../../components/TextField.jsx';
import { useFormState } from '../../hooks/useFormState.js';
import { t } from '../../i18n/i18n.js';
import { IconPicker } from './IconPicker.jsx';
import styles from './CategoryForm.module.css';

/** @typedef {{ name: string, kind: string, color: string, icon: string }} CategoryDraft */

/**
 * @typedef {object} CategoryFormProps
 * @property {CategoryDraft} initial
 * @property {boolean} isNew the kind can only be chosen when creating
 * @property {(draft: CategoryDraft) => Promise<void>} onSubmit
 * @property {() => void} onCancel
 * @property {import('preact').ComponentChildren} [extraActions]
 */

/**
 * Create/edit form for a category.
 * @param {CategoryFormProps} props
 * @returns {import('preact').JSX.Element}
 */
export function CategoryForm({ initial, isNew, onSubmit, onCancel, extraActions }) {
  const form = useFormState(initial);
  const draft = form.draft.value;

  /** @param {SubmitEvent} event */
  const handleSubmit = async (event) => {
    event.preventDefault();
    await form.submit(onSubmit);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <TextField
        label={t('categories.name')}
        value={draft.name}
        error={form.errors.value.name ? t(form.errors.value.name) : null}
        required
        onInput={(name) => form.update({ name })}
      />
      {isNew ? (
        <SegmentedControl
          legend={t('categories.kind')}
          value={draft.kind}
          options={[
            { value: 'expense', label: t('kind.expense') },
            { value: 'income', label: t('kind.income') },
          ]}
          onChange={(kind) => form.update({ kind })}
        />
      ) : (
        <p className={styles.fixed}>
          {t(`kind.${draft.kind}`)} — {t('categories.kindFixed')}
        </p>
      )}
      <SwatchPicker
        legend={t('categories.color')}
        value={draft.color}
        options={SWATCHES.map((swatch) => ({ value: swatch, label: t(`swatch.${swatch}`) }))}
        onChange={(color) => form.update({ color })}
      />
      <IconPicker
        legend={t('categories.icon')}
        value={draft.icon}
        options={CATEGORY_ICONS.map((icon) => ({ value: icon, label: t(`icon.${icon}`) }))}
        onChange={(icon) => form.update({ icon })}
      />
      {form.formError.value && <InlineMessage tone="error">{form.formError.value}</InlineMessage>}
      <div className={styles.actions}>
        {extraActions}
        <span className={styles.spacer} />
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" disabled={form.busy.value}>
          {form.busy.value ? t('common.saving') : t('categories.save')}
        </Button>
      </div>
    </form>
  );
}
