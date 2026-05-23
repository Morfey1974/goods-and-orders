import { useTranslation } from 'react-i18next';
import { AppModal } from '../ui/AppModal';

const PDF_PREVIEW_SIZE_KEY = 'ordermgmt.document-pdf-preview-size';

type Props = {
  open: boolean;
  title: string;
  pdfUrl: string | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onDownload?: () => void;
};

export function DocumentPdfPreviewModal({
  open,
  title,
  pdfUrl,
  loading,
  error,
  onClose,
  onDownload,
}: Props) {
  const { t } = useTranslation();

  return (
    <AppModal
      open={open}
      onClose={onClose}
      ariaLabel={title}
      className="doc-pdf-preview-modal"
      overlayClassName="doc-pdf-preview-overlay"
      noCard
      resize={{
        storageKey: PDF_PREVIEW_SIZE_KEY,
        defaultSize: { width: 1000, height: 780 },
        minWidth: 640,
        minHeight: 480,
      }}
    >
      <header className="doc-pdf-preview-header">
        <h2>{title}</h2>
        <div className="doc-pdf-preview-actions">
          {onDownload && pdfUrl && (
            <button type="button" className="btn btn-secondary" onClick={onDownload}>
              {t('documents.downloadPdf')}
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
        {!loading && !error && pdfUrl && (
          <iframe title={title} src={pdfUrl} className="doc-pdf-preview-frame" />
        )}
      </div>
    </AppModal>
  );
}
