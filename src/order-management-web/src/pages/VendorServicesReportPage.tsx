import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type VendorServicesReport } from '../api/financialReports';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { VENDOR_SERVICES_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function VendorServicesReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<VendorServicesReport | null>(null);
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
      const r = await financialReportsApi.vendorServices(token, from || undefined, to || undefined);
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

  return (
    <div className="page inventory-page">
      <header className="inventory-page-header">
        <Link to="/reports" className="btn-link inventory-back-link">
          ← {t('inventory.backToReports')}
        </Link>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={VENDOR_SERVICES_REPORT_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('reports.vendorServicesTitle')}
              count={t('products.results', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
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
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.vendorServicesRun')}
              </button>
            </div>
          </div>
        }
        toolbarSecondary={
          <p className="muted dt-panel__hint" style={{ margin: 0, width: '100%' }}>
            {t('reports.vendorServicesHint')}
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
            {t('reports.vendorServicesSummary', { total: formatIls(report.grandTotalIls) })}
          </p>
        )}
        <table className="data-table data-table--compact">
          <thead>
            <tr>
              <th>{t('reports.vendorServicesColDate')}</th>
              <th>{t('reports.vendorServicesColVendor')}</th>
              <th>{t('reports.vendorServicesColSource')}</th>
              <th>{t('reports.vendorServicesColCategory')}</th>
              <th>{t('reports.vendorServicesColDesc')}</th>
              <th className="num">{t('reports.expenseColAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && !loading ? (
              <tr>
                <td colSpan={6} className="muted">
                  {t('reports.vendorServicesEmpty')}
                </td>
              </tr>
            ) : (
              pageItems.map((row, idx) => (
                <tr key={`${row.serviceDate}-${row.vendorName}-${idx}`}>
                  <td>{row.serviceDate}</td>
                  <td>{row.vendorName}</td>
                  <td>
                    {row.receiptNumber
                      ? `${t(`reports.vendorServicesSource.${row.sourceKind}`)} ${row.receiptNumber}`
                      : t(`reports.vendorServicesSource.${row.sourceKind}`)}
                  </td>
                  <td>{row.category}</td>
                  <td>{row.description ?? '—'}</td>
                  <td className="num">{formatIls(row.amountIls)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>
    </div>
  );
}
