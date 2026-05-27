import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { COMPLIANCE_EMAIL_RESIZE } from '../../lib/resizablePanelKeys';
import { AppModal } from '../ui/AppModal';
import {
  COMPLIANCE_DOCUMENT_KINDS,
  findComplianceDoc,
  tenantAssetsApi,
  type ComplianceDocumentKind,
  type TenantAssetsSummary,
} from '../../api/tenantAssets';

type Props = {
  token: string;
  summary: TenantAssetsSummary;
  defaultRecipients?: string;
  onClose: () => void;
  onSent: (message: string, isStub: boolean) => void;
  onError: (msg: string) => void;
};

export function ComplianceEmailModal({
  token,
  summary,
  defaultRecipients,
  onClose,
  onSent,
  onError,
}: Props) {
  const { t } = useTranslation();
  const uploadedKinds = COMPLIANCE_DOCUMENT_KINDS.filter((k) => findComplianceDoc(summary, k));
  const [recipients, setRecipients] = useState(defaultRecipients ?? '');
  const [subject, setSubject] = useState(t('settings.complianceEmailDefaultSubject'));
  const [body, setBody] = useState('');
  const [selected, setSelected] = useState<ComplianceDocumentKind[]>([...uploadedKinds]);
  const [sending, setSending] = useState(false);

  const toggleKind = (kind: ComplianceDocumentKind) => {
    setSelected((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const list = recipients
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) {
      onError(t('settings.complianceEmailRecipientsRequired'));
      return;
    }
    if (selected.length === 0) {
      onError(t('settings.complianceEmailDocsRequired'));
      return;
    }
    setSending(true);
    onError('');
    try {
      const res = await tenantAssetsApi.sendComplianceEmail(token, {
        recipients: list,
        subject: subject.trim() || undefined,
        body: body.trim() || undefined,
        documentKinds: selected,
      });
      onSent(res.message, res.stub);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSending(false);
    }
  };

  return (
    <AppModal
      open
      onClose={onClose}
      ariaLabel={t('settings.complianceEmailTitle')}
      className="app-modal-panel settings-compliance-email-modal"
      overlayClassName="settings-compliance-email-overlay"
      noCard
      closeOnBackdrop={false}
      preventClose={sending}
      resize={COMPLIANCE_EMAIL_RESIZE}
    >
      <header className="app-modal-panel__header">
        <h2 id="compliance-email-title">{t('settings.complianceEmailTitle')}</h2>
        <button
          type="button"
          className="app-modal-panel__close"
          onClick={onClose}
          disabled={sending}
          aria-label={t('products.close')}
        >
          ×
        </button>
      </header>
      <div className="app-modal-panel__body app-modal-panel__body--form">
        <form onSubmit={onSubmit}>
          <label className="settings-field">
            <span className="settings-field-label-row">{t('settings.complianceEmailRecipients')}</span>
            <input
              type="text"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder={t('settings.complianceEmailRecipientsPlaceholder')}
              required
            />
            <span className="field-hint">{t('settings.complianceEmailRecipientsHint')}</span>
          </label>
          <label className="settings-field">
            <span className="settings-field-label-row">{t('settings.complianceEmailSubject')}</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="settings-field">
            <span className="settings-field-label-row">{t('settings.complianceEmailBody')}</span>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('settings.complianceEmailBodyPlaceholder')}
            />
          </label>
          <fieldset className="settings-compliance-email-docs">
            <legend>{t('settings.complianceEmailAttach')}</legend>
            {uploadedKinds.length === 0 ? (
              <p className="muted">{t('settings.complianceEmailNoDocs')}</p>
            ) : (
              uploadedKinds.map((kind) => (
                <label key={kind} className="settings-compliance-email-doc-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(kind)}
                    onChange={() => toggleKind(kind)}
                  />
                  {t(`settings.complianceDoc.${kind}`)}
                </label>
              ))
            )}
          </fieldset>
          <div className="settings-compliance-email-actions">
            <button type="button" className="btn btn-ghost-inline" onClick={onClose} disabled={sending}>
              {t('settings.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={sending || uploadedKinds.length === 0}
            >
              {sending ? t('settings.sending') : t('settings.complianceEmailSend')}
            </button>
          </div>
        </form>
      </div>
    </AppModal>
  );
}
