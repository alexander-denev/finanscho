import { ButtonLink } from '../../components/ButtonLink.jsx';
import { EmptyState } from '../../components/EmptyState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { t } from '../../i18n/i18n.js';

/**
 * Shown for unknown routes.
 * @returns {import('preact').JSX.Element}
 */
export function NotFoundPage() {
  return (
    <>
      <PageHeader title={t('notFound.title')} />
      <EmptyState
        title={t('notFound.body')}
        action={
          <ButtonLink href="#/" variant="primary">
            {t('notFound.action')}
          </ButtonLink>
        }
      />
    </>
  );
}
