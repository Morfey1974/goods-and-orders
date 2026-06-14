import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type OperatingExpensesReport } from '../api/financialReports';
import { type BusinessExpense } from '../api/businessExpenses';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { OPERATING_EXPENSES_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import { buildReportPdfFileName } from '../lib/pdfDownload';

import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

function expenseTypeLabel(row: BusinessExpense, t: (key: string) => string) {
  if (row.isHomeMixed && row.homeExpenseType) return t(`homeExpenseType.${row.homeExpenseType}`);
  if (!row.isHomeMixed && row.operatingExpenseType) return t(`operatingExpenseType.${row.operatingExpenseType}`);
  return '—';
}

export function OperatingExpensesReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<OperatingExpensesReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef({ from, to });

  const lines = report?.expenseLines ?? [];
  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(lines, [
    from,
    to,
  ]);

  const load = useCallback(async () => {
    if (!token) return;
    if (from && to && from > to) {
      setError(t('reports.incomeDateError'));
      setReport(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const r = await financialReportsApi.operatingExpenses(token, from || undefined, to || undefined);
      setReport(r);
      setPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, t, setPage]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokePdfUrl = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }, [pdfUrl]);

  const buildPdfParams = useCallback(() => ({ from, to }), [from, to]);

  const closePdf = () => {
    setPdfOpen(false);
    revokePdfUrl();
    setPdfError(null);
    setPdfLoading(false);
  };

  const openPdfPreview = async () => {
    if (!token) return;
    const params = buildPdfParams();
    pdfParamsRef.current = params;
    setPdfDownloadFileName(
      buildReportPdfFileName('reports.pdfFileName_operatingExpenses', { from: params.from, to: params.to })
    );
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await financialReportsApi.fetchOperatingExpensesPdfBlob(
        token,
        params.from || undefined,
        params.to || undefined
      );
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfLoading(false);
    }
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
        resize={OPERATING_EXPENSES_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('reports.operatingExpensesTitle')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.operatingExpensesRun')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading || !report}
                onClick={() => void openPdfPreview()}
              >
                {t('reports.viewPdf')}
              </button>
            </div>
          </div>
        }
        toolbarSecondary={
          <>
            <ReportDateRangePicker
              from={from}
              to={to}
              presetId={datePreset}
              onChange={(nextFrom, nextTo, preset) => {
                setFrom(nextFrom);
                setTo(nextTo);
                setDatePreset(preset);
              }}
            />
            <p className="muted dt-panel__hint" style={{ margin: 0, width: '100%' }}>
              {t('reports.operatingExpensesHint')}
            </p>
          </>
        }
        summary={
          report ? (
            <div className="inventory-valuation-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <span>
                {t('reports.opExHomeMixed')}: {formatIls(report.homeMixedTotalIls)} →{' '}
                {formatIls(report.homeMixedRecognizedIls)}
              </span>
              <span>
                {t('reports.opExDirect')}: {formatIls(report.operatingDirectTotalIls)}
              </span>
              <span>
                {t('reports.opExDepreciation')}: {formatIls(report.depreciationIls)}
              </span>
              <strong>
                {t('reports.incomeGrandTotal')}: {formatIls(report.grandTotalRecognizedIls)}
              </strong>
            </div>
          ) : undefined
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
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>{t('businessExpenses.colDate')}</th>
              <th>{t('businessExpenses.colType')}</th>
              <th>{t('businessExpenses.notes')}</th>
              <th className="num">{t('businessExpenses.colAmount')}</th>
              <th className="num">{t('businessExpenses.colRecognized')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="muted">
                  {t('reports.operatingExpensesEmpty')}
                </td>
              </tr>
            ) : (
              pageItems.map((row) => (
                <tr key={row.id}>
                  <td>{row.expenseDate}</td>
                  <td>{expenseTypeLabel(row, t)}</td>
                  <td>{row.notes ?? '—'}</td>
                  <td className="num">{formatIls(row.amountIls)}</td>
                  <td className="num">{formatIls(row.recognizedAmountIls)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {report && report.depreciationLines.length > 0 && (
          <>
            <h3 style={{ margin: '1.5rem 0 0.5rem' }}>{t('reports.opExDepreciationLines')}</h3>
            <table className="data-table data-table--compact">
              <thead>
                <tr>
                  <th>{t('fixedAssets.colName')}</th>
                  <th>{t('fixedAssets.colCategory')}</th>
                  <th className="num">{t('fixedAssets.colAnnualDepreciation')}</th>
                  <th className="num">{t('reports.opExPeriodDepreciation')}</th>
                </tr>
              </thead>
              <tbody>
                {report.depreciationLines.map((line) => (
                  <tr key={line.assetId}>
                    <td>{line.name}</td>
                    <td>{t(`depreciationCategory.${line.category}`)}</td>
                    <td className="num">{formatIls(line.annualDepreciationIls)}</td>
                    <td className="num">{formatIls(line.periodDepreciationIls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </DataTablePanel>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.operatingExpensesTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />
    </div>
  );
}
