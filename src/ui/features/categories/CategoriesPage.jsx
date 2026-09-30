import { useSignal } from '@preact/signals';
import { useStores } from '../../context/StoresProvider.jsx';
import { Button } from '../../components/Button.jsx';
import { Dialog } from '../../components/Dialog.jsx';
import { Icon } from '../../components/Icon.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Swatch } from '../../components/Swatch.jsx';
import { t } from '../../i18n/i18n.js';
import { CategoryForm } from './CategoryForm.jsx';
import styles from './CategoriesPage.module.css';

/** @typedef {import('../../../core/domain/category.js').Category} Category */
/** @typedef {import('./CategoryForm.jsx').CategoryDraft} CategoryDraft */

/**
 * @typedef {object} CategoryListProps
 * @property {string} title
 * @property {readonly Category[]} items
 * @property {(id: string) => void} onSelect
 */

/**
 * @param {CategoryListProps} props
 * @returns {import('preact').JSX.Element | null}
 */
function CategoryList({ title, items, onSelect }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.list}>
        {items.map((category) => (
          <li key={category.id}>
            <button type="button" className={styles.row} onClick={() => onSelect(category.id)}>
              <Swatch color={category.color} />
              <Icon name={category.icon} />
              <span className={styles.name}>{category.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Income and expense categories; add, edit, archive, and restore.
 * @returns {import('preact').JSX.Element}
 */
export function CategoriesPage() {
  const { categories, toasts } = useStores();
  const editing = useSignal(/** @type {{ id: string | null } | null} */ (null));
  const editingId = editing.value?.id ?? null;
  const category = editingId ? categories.byId.value.get(editingId) : undefined;
  const archived = categories.all.value.filter((c) => c.archived);

  /** @type {CategoryDraft} */
  const initial = category
    ? { name: category.name, kind: category.kind, color: category.color, icon: category.icon }
    : { name: '', kind: 'expense', color: 'teal', icon: 'dots' };

  const close = () => {
    editing.value = null;
  };
  /** @param {string | null} id */
  const open = (id) => {
    editing.value = { id };
  };

  /** @param {CategoryDraft} draft */
  const save = async (draft) => {
    if (editingId) await categories.update(editingId, draft);
    else await categories.create(draft);
    toasts.show('toast.categorySaved');
    close();
  };

  const toggleArchived = async () => {
    if (!category) return;
    await categories.setArchived(category.id, !category.archived);
    toasts.show('toast.categorySaved');
    close();
  };

  return (
    <>
      <PageHeader
        title={t('categories.title')}
        actions={
          <Button variant="primary" icon="plus" onClick={() => open(null)}>
            {t('categories.add')}
          </Button>
        }
      />
      <CategoryList
        title={t('categories.expense')}
        items={categories.expense.value}
        onSelect={open}
      />
      <CategoryList
        title={t('categories.income')}
        items={categories.income.value}
        onSelect={open}
      />
      <CategoryList title={t('categories.archivedSection')} items={archived} onSelect={open} />
      <Dialog
        open={editing.value !== null}
        title={editingId ? t('categories.edit') : t('categories.add')}
        onClose={close}
      >
        <CategoryForm
          initial={initial}
          isNew={!editingId}
          onSubmit={save}
          onCancel={close}
          extraActions={
            category && (
              <Button variant="danger" onClick={() => void toggleArchived()}>
                {category.archived ? t('common.unarchive') : t('common.archive')}
              </Button>
            )
          }
        />
      </Dialog>
    </>
  );
}
