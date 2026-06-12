import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type CogsReport, type CogsIssueLine } from '../api/financialReports';
import { BidiText } from '../components/BidiText';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { COGS_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function CogsReportPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<CogsReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const lines = report?.issueLines ?? [];
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
      const r = await financialReportsApi.cogs(token, from || undefined, to || undefined);
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

  const renderRow = (line: CogsIssueLine) => (
    <tr key={line.movementId}>
      <td>{line.movementDate}</td>
      <td>{line.articleCode}</td>
      <td>
        <BidiText>{line.productName}</BidiText>
      </td>
      <td className="num">{line.quantity}</td>
      <td className="num">{formatIls(line.totalCostIls)}</td>
      <td>{line.notes ?? '—'}</td>
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
        resize={COGS_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading title={t('reports.cogsTitle')} count={t('products.results', { count: total })} />
            <div className="dt-panel__toolbar-actions">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.cogsRun')}
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
              {t('reports.cogsHint')}
            </p>
          </>
        }
        summary={
          report ? (
            <div className="inventory-valuation-summary" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              <span>{t('reports.cogsOpening')}: {formatIls(report.openingInventoryIls)}</span>
              <span>{t('reports.cogsPurchases')}: {formatIls(report.purchasesToInventoryIls)}</span>
              <span>{t('reports.cogsClosing')}: {formatIls(report.closingInventoryIls)}</span>
              <strong>{t('reports.cogsFormula')}: {formatIls(report.cogsByFormulaIls)}</strong>
              <span>{t('reports.cogsFromIssues')}: {formatIls(report.cogsFromIssuesIls)}</span>
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
              <th>{t('reports.cogsColDate')}</th>
              <th>{t('products.article')}</th>
              <th>{t('products.name')}</th>
              <th className="num">{t('warehouse.quantity')}</th>
              <th className="num">{t('reports.cogsColCost')}</th>
              <th>{t('businessExpenses.notes')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="muted">
                  {t('reports.cogsEmpty')}
                </td>
              </tr>
            ) : (
              pageItems.map(renderRow)
            )}
          </tbody>
        </table>
      </DataTablePanel>
    </div>
  );
}
