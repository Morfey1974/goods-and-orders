import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { financialReportsApi, type IncomeReport, type IncomeReportLine } from '../api/financialReports';
import { useAuth } from '../context/AuthContext';
import { BidiText } from '../components/BidiText';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import {
  getReportDatePresetRange,
  REPORT_DATE_PRESETS,
  type ReportDatePresetId,
} from '../lib/reportDatePresets';
import { INCOME_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/purchase-receipts.css';
import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function IncomeReportPage() {
  const { t } = useTranslation();
  const { token } = useAuth();

  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<IncomeReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  const onPresetChange = (preset: string) => {
    if (!preset) {
      setDatePreset('');
      return;
    }
    const id = preset as ReportDatePresetId;
    const range = getReportDatePresetRange(id);
    setDatePreset(id);
    setFrom(range.from);
    setTo(range.to);
  };

  const presetLabel = (id: ReportDatePresetId) => {
    switch (id) {
      case 'today':
        return t('reports.datePresetToday');
      case 'week':
        return t('reports.datePresetWeek');
      case 'month':
        return t('reports.datePresetMonth');
      case 'twoMonths':
        return t('reports.datePresetTwoMonths');
      case 'thisYear':
        return t('reports.datePresetThisYear');
      case 'lastYear':
        return t('reports.datePresetLastYear');
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
            </div>
          </div>
        }
        toolbarSecondary={
          <>
            <label className="pr-field">
              <span>{t('reports.datePresets')}</span>
              <select value={datePreset} onChange={(e) => onPresetChange(e.target.value)}>
                <option value="">{t('reports.datePresetSelect')}</option>
                {REPORT_DATE_PRESETS.map((id) => (
                  <option key={id} value={id}>
                    {presetLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="pr-field pr-field--date">
              <span>{t('reports.dateFrom')}</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setDatePreset('');
                }}
              />
            </label>
            <label className="pr-field pr-field--date">
              <span>{t('reports.dateTo')}</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setDatePreset('');
                }}
              />
            </label>
            <p className="muted dt-panel__hint" style={{ margin: 0 }}>
              {t('reports.incomeHint')}
            </p>
          </>
        }
        summary={
          report ? (
            <p className="inventory-valuation-summary">
              {t('reports.incomeSummary', {
                from: report.from ?? from,
                to: report.to ?? to,
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
    </div>
  );
}
