import { useSignal } from '@preact/signals';
import { useStores } from '../context/StoresProvider.jsx';
import { formatMoney, hasTranslation, t } from '../i18n/i18n.js';

/**
 * @param {unknown} error
 * @returns {string} the i18n key describing the error
 */
function errorKey(error) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    const key = `errors.${error.code}`;
    if (hasTranslation(key)) return key;
  }
  return 'errors.unknown';
}

/**
 * Pay and Delete for To pays, shared by the To pay page, its dialog, and the dashboard. Each
 * confirms with a toast (errors too). `busy` is set while one runs, so a double tap can't pay
 * twice.
 * @returns {{
 *   pay: (id: string) => Promise<boolean>,
 *   remove: (id: string) => Promise<boolean>,
 *   busy: import('@preact/signals').ReadonlySignal<boolean>,
 * }}
 */
export function useToPayActions() {
  const { toPays, accounts, toasts } = useStores();
  const busy = useSignal(false);

  /**
   * @param {() => Promise<void>} action
   * @returns {Promise<boolean>} whether it succeeded
   */
  const run = async (action) => {
    if (busy.peek()) return false;
    busy.value = true;
    try {
      await action();
      return true;
    } catch (error) {
      toasts.show(errorKey(error), {}, 'error');
      return false;
    } finally {
      busy.value = false;
    }
  };

  return {
    busy,
    pay: (id) =>
      run(async () => {
        const payment = await toPays.pay(id);
        const account = accounts.byId.peek().get(payment.accountId);
        const currency = account?.currency ?? 'EUR';
        toasts.show('toast.toPayPaid', {
          payee: payment.payee || t(`kind.${payment.kind}`),
          amount: formatMoney(payment.amountMinor, currency),
          account: account?.name ?? '',
        });
      }),
    remove: (id) =>
      run(async () => {
        await toPays.remove(id);
        toasts.show('toast.toPayDeleted');
      }),
  };
}
