import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { financialReportsApi, type ExpenseReport, type ExpenseReportLine } from '../api/financialReports';
import { useAuth } from '../context/AuthContext';
import { BidiText } from '../components/BidiText';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { EXPENSE_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import { buildReportPdfFileName } from '../lib/pdfDownload';

import '../styles/purchase-receipts.css';
import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

function formatOriginalAmount(line: ExpenseReportLine): string {
  if (line.amountOriginal == null) return '—';
  const cur = line.currency.trim().toUpperCase();
  if (cur === 'ILS' || cur === 'NIS') return formatIls(line.amountOriginal);
  return `${line.amountOriginal.toFixed(2)} ${line.currency}`;
}

export function ExpenseReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();

  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef({ from, to });

  const lines = report?.lines ?? [];
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
      const r = await financialReportsApi.expenses(token, from || undefined, to || undefined);
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

  const onDateRangeChange = (nextFrom: string, nextTo: string, preset: ReportDatePresetId | '') => {
    setFrom(nextFrom);
    setTo(nextTo);
    setDatePreset(preset);
  };

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
      buildReportPdfFileName('reports.pdfFileName_expenses', { from: params.from, to: params.to })
    );
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await financialReportsApi.fetchExpensesPdfBlob(
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

  const renderRow = (line: ExpenseReportLine) => (
    <tr key={line.purchaseReceiptId}>
      <td>{line.documentDate}</td>
      <td>
        <Link to={`/purchase-receipts/${line.purchaseReceiptId}`} className="btn-link">
          {line.receiptNumber}
        </Link>
      </td>
      <td>
        <BidiText>{line.supplierName}</BidiText>
      </td>
      <td>
        <BidiText>{line.supplierInvoiceNumber ?? '—'}</BidiText>
      </td>
      <td className="num">{formatOriginalAmount(line)}</td>
      <td className="num">{formatIls(line.amountIls)}</td>
      <td className="num">{line.lineCount}</td>
    </tr>
  );

  return (
    <div className="page inventory-page">
      <header className="inventory-page-header">
        <Link to="/reports" className="btn-link inventory-back-link">
          ← {t('inventory.backToReports')}
        </Link>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={EXPENSE_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('reports.purchasesGrTitle')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.expenseRun')}
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
              onChange={onDateRangeChange}
            />
            <p className="muted dt-panel__hint" style={{ margin: 0, width: '100%' }}>
              {t('reports.purchasesGrHint')}
            </p>
          </>
        }
        summary={
          report ? (
            <p className="inventory-valuation-summary">
              {t('reports.expenseSummary', {
                from: report.from ?? (from || t('reports.datePresetAll')),
                to: report.to ?? (to || t('reports.datePresetAll')),
                receipts: report.receiptCount,
                total: report.grandTotalIls.toFixed(2),
              })}
            </p>
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
              <th>{t('purchaseReceipts.documentDate')}</th>
              <th>{t('purchaseReceipts.colNumber')}</th>
              <th>{t('purchaseReceipts.colSupplier')}</th>
              <th>{t('purchaseReceipts.supplierInvoiceNumber')}</th>
              <th className="num">{t('reports.expenseColAmount')}</th>
              <th className="num">{t('reports.incomeColAmountIls')}</th>
              <th className="num">{t('reports.expenseColLines')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="muted">
                  {t('reports.expenseEmpty')}
                </td>
              </tr>
            ) : (
              pageItems.map(renderRow)
            )}
          </tbody>
          {report && lines.length > 0 && (
            <tfoot>
              <tr className="data-table__total-row">
                <td colSpan={5}>{t('reports.incomeGrandTotal')}</td>
                <td className="num">{formatIls(report.grandTotalIls)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </DataTablePanel>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.purchasesGrTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />
    </div>
  );
}
