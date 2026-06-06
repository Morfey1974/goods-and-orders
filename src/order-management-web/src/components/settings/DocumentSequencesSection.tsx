import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { documentSequencesApi, type DocumentSequence } from '../../api/documentSequences';

type Props = {
  token: string;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

const KIND_LABEL_KEYS: Record<string, string> = {
  Quote: 'documents.types.Quote',
  Order: 'documents.types.Order',
  ChargeInvoice: 'documents.types.ChargeInvoice',
  Receipt: 'documents.types.Receipt',
};

export function DocumentSequencesSection({ token, onError, onMessage }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DocumentSequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    documentSequencesApi
      .list(token)
      .then(setRows)
      .catch((e) => onError(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token]);

  const onChangeNext = (kind: string, value: string) => {
    const nextNumber = value === '' ? 1 : Math.max(1, parseInt(value, 10) || 1);
    setRows((prev) =>
      prev.map((r) =>
        r.kind === kind
          ? { ...r, nextNumber, preview: String(nextNumber) }
          : r
      )
    );
  };

  const onSubmit = async () => {
    onError('');
    onMessage('');
    setSaving(true);
    try {
      const updated = await documentSequencesApi.update(
        token,
        rows.map((r) => ({ kind: r.kind, nextNumber: r.nextNumber }))
      );
      setRows(updated);
      onMessage(t('settings.documentSequences.saved'));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="muted">{t('settings.documentSequences.loading')}</p>;

  return (
    <div className="document-sequences-form">
      <p className="field-hint">{t('settings.documentSequences.hint')}</p>
      <div className="table-wrap">
        <table className="data-table document-sequences-table">
          <thead>
            <tr>
              <th>{t('settings.documentSequences.documentType')}</th>
              <th>{t('settings.documentSequences.maxUsed')}</th>
              <th>{t('settings.documentSequences.nextNumber')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind}>
                <td>{t(KIND_LABEL_KEYS[row.labelKey] ?? row.labelKey)}</td>
                <td>
                  {row.maxUsedNumber != null ? (
                    <code>{row.maxUsedNumber}</code>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={row.nextNumber}
                    onChange={(e) => onChangeNext(row.kind, e.target.value)}
                    className="document-sequence-input"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="settings-inline-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void onSubmit()}>
          {saving ? t('settings.saving') : t('settings.documentSequences.save')}
        </button>
      </div>
    </div>
  );
}
