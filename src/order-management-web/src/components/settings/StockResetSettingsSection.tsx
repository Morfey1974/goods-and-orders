import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inventoryApi } from '../../api/inventory';
import { ConfirmDialog } from '../ConfirmDialog';
import { clearOpeningDraft } from '../../lib/inventoryOpeningDraft';
import { useAuth } from '../../context/AuthContext';

type Props = {
  token: string;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
};

export function StockResetSettingsSection({ token, onError, onMessage }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onConfirm = async () => {
    setBusy(true);
    onError('');
    try {
      const result = await inventoryApi.resetStock(token);
      if (user?.tenantId) clearOpeningDraft(user.tenantId);
      onMessage(
        t('settings.stockReset.success', {
          movements: result.movementsDeleted,
          balances: result.balancesDeleted,
        })
      );
      setConfirmOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="settings-stock-reset">
        <p className="muted settings-stock-reset-hint">{t('settings.stockReset.hint')}</p>
        <button type="button" className="btn btn-danger" onClick={() => setConfirmOpen(true)}>
          {t('settings.stockReset.action')}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={t('settings.stockReset.confirmTitle')}
        message={t('settings.stockReset.confirmMessage')}
        confirmLabel={t('settings.stockReset.confirmAction')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={busy}
        onConfirm={() => void onConfirm()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
