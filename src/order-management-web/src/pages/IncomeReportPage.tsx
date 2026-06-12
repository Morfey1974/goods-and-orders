import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { financialReportsApi, type IncomeReport, type IncomeReportLine } from '../api/financialReports';
import { useAuth } from '../context/AuthContext';
import { BidiText } from '../components/BidiText';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { INCOME_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/purchase-receipts.css';
import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function IncomeReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();

  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<IncomeReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
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
      const r = await financialReportsApi.income(token, from || undefined, to || undefined);
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
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await financialReportsApi.fetchIncomePdfBlob(
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

  const onDownloadPdf = async () => {
    if (!token) return;
    const params = pdfParamsRef.current ?? buildPdfParams();
    try {
      await financialReportsApi.downloadIncomePdf(token, params.from || undefined, params.to || undefined);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Error');
    }
  };

  const paymentTypeLabel = (type: string) => {
    const key = `documents.receiptPay.${type}`;
    const label = t(key);
    return label === key ? type : label;
  };

  const renderRow = (line: IncomeReportLine) => (
    <tr key={`${line.receiptId}-${line.paymentDate}-${line.paymentType}-${line.amount}`}>
      <td>{line.paymentDate}</td>
      <td>
        <Link to={`/documents?highlight=${encodeURIComponent(line.documentNumber)}`} className="btn-link">
          {line.documentNumber}
        </Link>
      </td>
      <td>{line.receiptDate}</td>
      <td>
        <BidiText>{line.customerName}</BidiText>
      </td>
      <td>{paymentTypeLabel(line.paymentType)}</td>
      <td>
        <BidiText>{line.detail ?? '—'}</BidiText>
      </td>
      <td className="num">
        {line.currency !== 'ILS' && line.currency !== 'NIS'
          ? `${line.amount.toFixed(2)} ${line.currency}`
          : formatIls(line.amount)}
      </td>
      <td className="num">{formatIls(line.amountIls)}</td>
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
        resize={INCOME_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('reports.incomeTitle')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.incomeRun')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={loading || !report}
                onClick={() => void openPdfPreview()}
              >
                {t('warehouse.viewReportPdf')}
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
              {t('reports.incomeHint')}
            </p>
          </>
        }
        summary={
          report ? (
            <p className="inventory-valuation-summary">
              {t('reports.incomeSummary', {
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
              <th>{t('reports.incomeColPaymentDate')}</th>
              <th>{t('reports.incomeColReceipt')}</th>
              <th>{t('reports.incomeColReceiptDate')}</th>
              <th>{t('customers.name')}</th>
              <th>{t('documents.receiptColPayType')}</th>
              <th>{t('documents.receiptColDetail')}</th>
              <th className="num">{t('reports.incomeColAmount')}</th>
              <th className="num">{t('reports.incomeColAmountIls')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={8} className="muted">
                  {t('reports.incomeEmpty')}
                </td>
              </tr>
            ) : (
              pageItems.map(renderRow)
            )}
          </tbody>
          {report && lines.length > 0 && (
            <tfoot>
              <tr className="data-table__total-row">
                <td colSpan={7}>{t('reports.incomeGrandTotal')}</td>
                <td className="num">{formatIls(report.grandTotalIls)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </DataTablePanel>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.incomeTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        onDownload={() => void onDownloadPdf()}
      />
    </div>
  );
}
