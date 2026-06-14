import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DOCUMENT_PDF_PREVIEW_RESIZE } from '../../lib/resizablePanelKeys';
import { pdfPreviewFrameSrc, saveUrlAsFile } from '../../lib/pdfDownload';
import { AppModal } from '../ui/AppModal';

type Props = {
  open: boolean;
  title: string;
  pdfUrl: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** Preferred save name, e.g. "דוח רווח והפסד 01/01/2025 – 31/12/2025.pdf" */
  downloadFileName?: string;
  /** Optional override; default saves the preview blob via the system save dialog. */
  onDownload?: () => void | Promise<void>;
  /** When true, show image instead of PDF iframe. */
  isImage?: boolean;
  downloadLabel?: string;
};

export function DocumentPdfPreviewModal({
  open,
  title,
  pdfUrl,
  loading,
  error,
  onClose,
  downloadFileName,
  onDownload,
  isImage = false,
  downloadLabel,
}: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const canSave = Boolean(pdfUrl && (downloadFileName || onDownload));

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (onDownload) {
        await onDownload();
        return;
      }
      if (pdfUrl && downloadFileName) {
        await saveUrlAsFile(pdfUrl, downloadFileName);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      className="doc-pdf-preview-modal"
      overlayClassName="doc-pdf-preview-overlay"
      noCard
      resize={DOCUMENT_PDF_PREVIEW_RESIZE}
    >
      <header className="doc-pdf-preview-header">
        <h2>{title}</h2>
        <div className="doc-pdf-preview-actions">
          {canSave && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? t('settings.saving') : (downloadLabel ?? t('documents.savePdf'))}
            </button>
          )}
          <button type="button" className="btn btn-ghost-inline" onClick={onClose}>
            {t('settings.cancel')}
          </button>
        </div>
      </header>
      <div className="doc-pdf-preview-body">
        {loading && <p className="muted">{t('documents.loading')}</p>}
        {error && <div className="error-banner">{error}</div>}
        {!loading && !error && pdfUrl && isImage && (
          <img src={pdfUrl} alt={title} className="doc-pdf-preview-image" />
        )}
        {!loading && !error && pdfUrl && !isImage && (
          <iframe title={title} src={pdfPreviewFrameSrc(pdfUrl)} className="doc-pdf-preview-frame" />
        )}
      </div>
    </AppModal>
  );
}
