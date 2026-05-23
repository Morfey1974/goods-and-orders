import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COMPLIANCE_DOCUMENT_KINDS,
  findComplianceDoc,
  tenantAssetsApi,
  type ComplianceDocumentKind,
  type TenantAssetsSummary,
} from '../../api/tenantAssets';
import { ComplianceEmailModal } from './ComplianceEmailModal';

type Props = {
  token: string;
  summary: TenantAssetsSummary | null;
  onSummaryChange: (s: TenantAssetsSummary) => void;
  onError: (msg: string) => void;
  onMessage: (msg: string) => void;
};

export function TenantComplianceSection({
  token,
  summary,
  onSummaryChange,
  onError,
  onMessage,
}: Props) {
  const { t } = useTranslation();
  const fileRefs = useRef<Partial<Record<ComplianceDocumentKind, HTMLInputElement | null>>>({});
  const [busyKind, setBusyKind] = useState<ComplianceDocumentKind | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  const uploadedCount = summary?.complianceDocuments.length ?? 0;

  const upload = async (kind: ComplianceDocumentKind, file: File) => {
    setBusyKind(kind);
    onError('');
    try {
      const updated = await tenantAssetsApi.uploadCompliance(token, kind, file);
      onSummaryChange(updated);
      onMessage(t('settings.complianceUploaded'));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyKind(null);
    }
  };

  const remove = async (kind: ComplianceDocumentKind) => {
    if (!window.confirm(t('settings.complianceDeleteConfirm'))) return;
    setBusyKind(kind);
    onError('');
    try {
      const updated = await tenantAssetsApi.deleteCompliance(token, kind);
      onSummaryChange(updated);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusyKind(null);
    }
  };

  const download = async (kind: ComplianceDocumentKind, fileName: string) => {
    onError('');
    try {
      const blob = await tenantAssetsApi.fetchComplianceBlob(token, kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || `${kind}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <>
      <p className="field-hint settings-compliance-intro">{t('settings.complianceIntro')}</p>
      <div className="settings-compliance-grid">
        {COMPLIANCE_DOCUMENT_KINDS.map((kind) => {
          const doc = findComplianceDoc(summary, kind);
          const busy = busyKind === kind;
          return (
            <div key={kind} className="settings-compliance-card">
              <p className="settings-compliance-card-title">{t(`settings.complianceDoc.${kind}`)}</p>
              <div className="settings-compliance-card-body">
                {doc ? (
                  <>
                    <div className="settings-compliance-pdf-icon" aria-hidden="true">
                      PDF
                    </div>
                    <p className="settings-compliance-file-name" title={doc.originalFileName}>
                      {doc.originalFileName}
                    </p>
                    <div className="settings-compliance-card-tools">
                      <button
                        type="button"
                        className="settings-compliance-icon-btn"
                        title={t('settings.downloadFile')}
                        onClick={() => void download(kind, doc.originalFileName)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="settings-compliance-icon-btn settings-compliance-icon-btn--danger"
                        title={t('settings.removeFile')}
                        disabled={busy}
                        onClick={() => void remove(kind)}
                      >
                        ×
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="muted settings-compliance-empty">{t('settings.notUploaded')}</p>
                )}
              </div>
              <input
                ref={(el) => {
                  fileRefs.current[kind] = el;
                }}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(kind, f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm settings-compliance-upload-btn"
                disabled={busy}
                onClick={() => fileRefs.current[kind]?.click()}
              >
                {doc ? t('settings.replaceFile') : t('settings.uploadPdf')}
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-primary settings-compliance-share-btn"
        disabled={uploadedCount === 0}
        onClick={() => setEmailOpen(true)}
      >
        {t('settings.complianceShareEmail')}
      </button>

      {emailOpen && summary && (
        <ComplianceEmailModal
          token={token}
          summary={summary}
          onClose={() => setEmailOpen(false)}
          onSent={(_msg, stub) =>
            onMessage(stub ? t('settings.complianceEmailStub') : t('settings.complianceEmailSent'))
          }
          onError={onError}
        />
      )}
    </>
  );
}
