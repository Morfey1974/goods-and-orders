import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { warehouseApi, type WarehouseReportPdfParams } from '../api/warehouse';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportCard } from '../components/reports/ReportCard';
import { ReportRunModal, type ReportRunKind } from '../components/reports/ReportRunModal';
import { useAuth } from '../context/AuthContext';
import '../styles/reports.css';

type ReportCategoryId = 'warehouse';

type ReportDef = {
  id: string;
  kind: ReportRunKind;
  titleKey: string;
  descKey: string;
};

const REPORT_CATEGORIES: { id: ReportCategoryId; labelKey: string; reports: ReportDef[] }[] = [
  {
    id: 'warehouse',
    labelKey: 'reports.categoryWarehouse',
    reports: [
      {
        id: 'balances',
        kind: 'balances',
        titleKey: 'reports.balancesTitle',
        descKey: 'reports.balancesDesc',
      },
      {
        id: 'movements',
        kind: 'movements',
        titleKey: 'reports.movementsTitle',
        descKey: 'reports.movementsDesc',
      },
    ],
  },
];

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { token } = useAuth();
  const [activeCategory, setActiveCategory] = useState<ReportCategoryId>('warehouse');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  const [runOpen, setRunOpen] = useState(false);
  const [runKind, setRunKind] = useState<ReportRunKind>('balances');

  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const downloadParamsRef = useRef<WarehouseReportPdfParams | undefined>(undefined);

  useEffect(() => {
    if (!token) return;
    warehouseApi.list(token).then((list) => setWarehouses(list.map((w) => ({ id: w.id, name: w.name })))).catch(() => {});
  }, [token]);

  const activeReports = REPORT_CATEGORIES.find((c) => c.id === activeCategory)?.reports ?? [];
  const isRtl = i18n.language === 'he';

  const revokePdfUrl = () => {
    setPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const closePdf = () => {
    setPdfOpen(false);
    revokePdfUrl();
    setPdfError(null);
    setPdfLoading(false);
  };

  const openReport = (kind: ReportRunKind) => {
    setRunKind(kind);
    setRunOpen(true);
    setError('');
  };

  const fetchPdf = useCallback(async (kind: ReportRunKind, params: WarehouseReportPdfParams) => {
    if (!token) return null;
    return kind === 'balances'
      ? warehouseApi.fetchBalancesReportPdfBlob(token, params)
      : warehouseApi.fetchMovementsReportPdfBlob(token, params);
  }, [token]);

  const onPreview = async (params: WarehouseReportPdfParams) => {
    if (!token) return;
    downloadParamsRef.current = params;
    setPdfOpen(true);
    setPdfTitle(runKind === 'balances' ? t('reports.balancesPdfTitle') : t('reports.movementsPdfTitle'));
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    setError('');

    try {
      const blob = await fetchPdf(runKind, params);
      if (blob) setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfLoading(false);
    }
  };

  const onDownload = async (params?: WarehouseReportPdfParams) => {
    if (!token) return;
    const p = params ?? downloadParamsRef.current;
    try {
      if (runKind === 'balances') {
        await warehouseApi.downloadBalancesReportPdf(token, p);
      } else {
        await warehouseApi.downloadMovementsReportPdf(token, p);
      }
      if (params) setRunOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      if (pdfOpen) setPdfError(msg);
      else setError(msg);
    }
  };

  return (
    <div className={`page reports-page${isRtl ? ' reports-page--rtl' : ''}`}>
      <h1>{t('reports.title')}</h1>
      <p className="muted reports-intro">{t('reports.intro')}</p>
      {error && <div className="error-banner">{error}</div>}

      <nav className="reports-tabs" aria-label={t('reports.title')}>
        {REPORT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`reports-tab${activeCategory === cat.id ? ' reports-tab--active' : ''}`}
            onClick={() => setActiveCategory(cat.id)}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </nav>

      <section className="reports-category">
        <div className="reports-cards-grid">
          {activeReports.map((report) => (
            <ReportCard
              key={report.id}
              title={t(report.titleKey)}
              description={t(report.descKey)}
              onOpen={() => openReport(report.kind)}
            />
          ))}
        </div>
      </section>

      <ReportRunModal
        open={runOpen}
        kind={runKind}
        warehouses={warehouses}
        onClose={() => setRunOpen(false)}
        onPreview={onPreview}
        onDownload={onDownload}
      />

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={pdfTitle}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        onDownload={() => onDownload()}
      />
    </div>
  );
}
