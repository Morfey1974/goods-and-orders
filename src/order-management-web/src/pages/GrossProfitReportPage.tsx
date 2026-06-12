import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type GrossProfitReport } from '../api/financialReports';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { useAuth } from '../context/AuthContext';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';

import '../styles/inventory.css';

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function GrossProfitReportPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [report, setReport] = useState<GrossProfitReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const r = await financialReportsApi.grossProfit(token, from || undefined, to || undefined);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, t]);

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

      <section className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0, flex: '1 1 auto' }}>{t('reports.grossProfitTitle')}</h1>
          <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
            {loading ? t('settings.saving') : t('reports.grossProfitRun')}
          </button>
        </div>

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
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {t('reports.grossProfitHint')}
        </p>

        {report && (
          <div className="inventory-valuation-summary" style={{ marginTop: '1.5rem' }}>
            <p>
              {t('reports.grossProfitSummary', {
                from: report.from ?? (from || t('reports.datePresetAll')),
                to: report.to ?? (to || t('reports.datePresetAll')),
                invoices: report.chargeInvoiceCount,
              })}
            </p>
            <table className="data-table data-table--compact" style={{ maxWidth: 480, marginTop: '1rem' }}>
              <tbody>
                <tr>
                  <td>{t('reports.grossProfitRevenue')}</td>
                  <td className="num">{formatIls(report.revenueIls)}</td>
                </tr>
                <tr>
                  <td>{t('reports.cogsTitle')}</td>
                  <td className="num">{formatIls(report.cogsIls)}</td>
                </tr>
                <tr className="data-table__total-row">
                  <td>{t('reports.grossProfitTotal')}</td>
                  <td className="num">{formatIls(report.grossProfitIls)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
