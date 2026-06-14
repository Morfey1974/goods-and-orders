import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  financialReportsApi,
  type PlCogsMethod,
  type ProfitAndLossReport,
} from '../api/financialReports';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { useAuth } from '../context/AuthContext';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { buildReportPdfFileName } from '../lib/pdfDownload';

import '../styles/inventory.css';

const PL_COGS_METHODS: PlCogsMethod[] = ['CashBasis', 'InventoryFormula', 'IssueWriteOffs'];

function formatIls(value: number): string {
  return `${value.toFixed(2)} ₪`;
}

export function ProfitAndLossReportPage() {
  usePersistReportsCategory();
  const { t } = useTranslation();
  const { token } = useAuth();
  const defaultRange = useMemo(() => getReportDatePresetRange('thisYear'), []);
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [datePreset, setDatePreset] = useState<ReportDatePresetId | ''>('thisYear');
  const [cogsMethod, setCogsMethod] = useState<PlCogsMethod>('CashBasis');
  const [report, setReport] = useState<ProfitAndLossReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef({ from, to, cogsMethod });

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
      const r = await financialReportsApi.profitAndLoss(token, from || undefined, to || undefined, cogsMethod);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [token, from, to, cogsMethod, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokePdfUrl = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }, [pdfUrl]);

  const buildPdfParams = useCallback(() => ({ from, to, cogsMethod }), [from, to, cogsMethod]);

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
      buildReportPdfFileName('reports.pdfFileName_pl', { from: params.from, to: params.to })
    );
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await financialReportsApi.fetchProfitAndLossPdfBlob(
        token,
        params.from || undefined,
        params.to || undefined,
        params.cogsMethod
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

      <section className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
          <h1 style={{ margin: 0, flex: '1 1 auto' }}>{t('reports.plTitle')}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-end' }}>
            <label className="reports-field" style={{ margin: 0, minWidth: '14rem' }}>
              <span>{t('reports.plCogsMethod')}</span>
              <select value={cogsMethod} onChange={(e) => setCogsMethod(e.target.value as PlCogsMethod)}>
                {PL_COGS_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {t(`reports.plCogsMethod_${method}`)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
              {loading ? t('settings.saving') : t('reports.plRun')}
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
          {t('reports.plHint')}
        </p>
        <p className="muted" style={{ marginTop: '0.35rem', fontSize: '0.88rem' }}>
          {t(`reports.plCogsMethodHint_${cogsMethod}`)}
        </p>

        {report && (
          <div className="inventory-valuation-summary" style={{ marginTop: '1.5rem' }}>
            <table className="data-table data-table--compact" style={{ maxWidth: 560 }}>
              <tbody>
                <tr>
                  <td>{t('reports.grossProfitRevenue')}</td>
                  <td className="num">{formatIls(report.revenueIls)}</td>
                </tr>
                <tr>
                  <td>
                    {t('reports.cogsTitle')}
                    <span className="muted" style={{ marginInlineStart: '0.35rem', fontSize: '0.85em' }}>
                      ({t(`reports.plCogsMethod_${report.cogsMethod}`)})
                    </span>
                  </td>
                  <td className="num">− {formatIls(report.cogsIls)}</td>
                </tr>
                <tr className="data-table__total-row">
                  <td>{t('reports.grossProfitTotal')}</td>
                  <td className="num">{formatIls(report.grossProfitIls)}</td>
                </tr>
                <tr>
                  <td colSpan={2}>
                    <strong>{t('reports.plRecognizedExpenses')}</strong>
                  </td>
                </tr>
                <tr>
                  <td className="muted" style={{ paddingLeft: '1.5rem' }}>
                    {t('reports.opExHomeMixed')}
                  </td>
                  <td className="num">− {formatIls(report.homeMixedRecognizedIls)}</td>
                </tr>
                <tr>
                  <td className="muted" style={{ paddingLeft: '1.5rem' }}>
                    {t('reports.opExDirect')}
                  </td>
                  <td className="num">− {formatIls(report.operatingDirectRecognizedIls)}</td>
                </tr>
                <tr>
                  <td className="muted" style={{ paddingLeft: '1.5rem' }}>
                    {t('reports.opExDepreciation')}
                  </td>
                  <td className="num">− {formatIls(report.depreciationIls)}</td>
                </tr>
                <tr className="data-table__total-row">
                  <td>{t('reports.plNetProfit')}</td>
                  <td className="num">{formatIls(report.netProfitIls)}</td>
                </tr>
              </tbody>
            </table>

            {report.operatingByCategory.length > 0 && (
              <>
                <h3 style={{ marginTop: '1.5rem' }}>{t('reports.plByCategory')}</h3>
                <table className="data-table data-table--compact" style={{ maxWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>{t('businessExpenses.expenseKind')}</th>
                      <th className="num">{t('reports.expenseColAmount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.operatingByCategory.map((row) => (
                      <tr key={row.category}>
                        <td>{t(`operatingExpenseType.${row.category}`, { defaultValue: row.category })}</td>
                        <td className="num">{formatIls(row.amountIls)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </section>

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.plPdfTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />
    </div>
  );
}
