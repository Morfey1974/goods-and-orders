import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type Form1342Report } from '../api/financialReports';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { FORM1342_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/inventory.css';
import '../styles/reports.css';

function buildTaxYearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current + 1; year >= 2000; year -= 1) years.push(year);
  return years;
}

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

function formatRate(value: number): string {
  return `${value.toFixed(4).replace(/\.?0+$/, '')}%`;
}

export function Form1342ReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState<Form1342Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const taxYearOptions = useMemo(() => buildTaxYearOptions(), []);

  const lines = report?.lines ?? [];
  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(lines, [
    taxYear,
  ]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const r = await financialReportsApi.form1342(token, taxYear);
      setReport(r);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token, taxYear, setPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPdf = async () => {
    if (!token) return;
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    try {
      const blob = await financialReportsApi.fetchForm1342PdfBlob(token, taxYear);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfLoading(false);
    }
  };

  const closePdf = () => {
    setPdfOpen(false);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setPdfError(null);
  };

  return (
    <div className="page inventory-page">
      <header className="inventory-page-header">
        <Link to="/reports" className="btn-link inventory-back-link">
          ← {t('inventory.backToReports')}
        </Link>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={FORM1342_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('reports.form1342Title')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions reports-toolbar-actions">
              <label className="reports-field reports-year-field">
                <span>{t('reports.form1342TaxYear')}</span>
                <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))}>
                  {taxYearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.form1342Run')}
              </button>
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void openPdf()}>
                {t('reports.form1342Pdf')}
              </button>
            </div>
          </div>
        }
        toolbarSecondary={
          <p className="muted dt-panel__hint" style={{ margin: 0, width: '100%' }}>
            {t('reports.form1342Hint')}
          </p>
        }
        pagination={{
          page,
          pageCount,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      >
        {report && (
          <p className="muted" style={{ margin: '0 0 0.75rem' }}>
            {t('reports.form1342Summary', {
              year: report.taxYear,
              total: formatIls(report.totalCurrentYearDepreciationIls),
            })}
          </p>
        )}
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('reports.form1342ColAsset')}</th>
              <th>{t('reports.form1342ColDates')}</th>
              <th className="num">{t('reports.form1342ColOriginal')}</th>
              <th className="num">{t('reports.form1342ColDepreciable')}</th>
              <th className="num">{t('reports.form1342ColRate')}</th>
              <th className="num">{t('reports.form1342ColYearDep')}</th>
              <th className="num">{t('reports.form1342ColAccumulated')}</th>
              <th className="num">{t('reports.form1342ColBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={9} className="muted">
                  {t('reports.form1342Empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((row) => (
                <tr key={row.instanceId}>
                  <td>{row.rowNumber}</td>
                  <td>{row.assetDescription}</td>
                  <td>
                    {row.acquisitionDate}
                    <br />
                    <span className="muted">{row.inServiceDate}</span>
                  </td>
                  <td className="num">{formatIls(row.originalCostIls)}</td>
                  <td className="num">{formatIls(row.totalDepreciableIls)}</td>
                  <td className="num">{formatRate(row.claimedDepreciationRatePercent)}</td>
                  <td className="num">{formatIls(row.currentYearDepreciationIls)}</td>
                  <td className="num">{formatIls(row.totalAccumulatedDepreciationIls)}</td>
                  <td className="num">{formatIls(row.remainingBalanceIls)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.form1342Title')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        onDownload={() => token && void financialReportsApi.downloadForm1342Pdf(token, taxYear)}
      />
    </div>
  );
}
