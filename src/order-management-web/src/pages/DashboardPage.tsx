import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { documentsApi, type Document } from '../api/documents';
import { financialReportsApi } from '../api/financialReports';
import { inventoryApi } from '../api/inventory';
import { tenantAssetsApi } from '../api/tenantAssets';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { DASHBOARD_OPEN_DOCS_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import { formatReportRangeLabel, getReportDatePresetRange } from '../lib/reportDatePresets';
import '../styles/dashboard.css';

const UNFINISHED_STATUSES = new Set(['Draft', 'Sent', 'Open']);

const STATUS_CLASS: Record<string, string> = {
  Draft: 'draft',
  Sent: 'sent',
  Open: 'open',
};

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function isUnfinished(doc: Document) {
  return UNFINISHED_STATUSES.has(doc.status);
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [incomeIls, setIncomeIls] = useState(0);
  const [expensesIls, setExpensesIls] = useState(0);
  const [cogsIls, setCogsIls] = useState(0);
  const [operatingIls, setOperatingIls] = useState(0);
  const [inventoryIls, setInventoryIls] = useState(0);
  const [openDocuments, setOpenDocuments] = useState<Document[]>([]);
  const [receivableIls, setReceivableIls] = useState(0);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const period = useMemo(() => getReportDatePresetRange('thisMonth'), []);
  const periodLabel = formatReportRangeLabel(period.from, period.to, i18n.language);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const [income, expenses, cogs, operating, valuation, documents] = await Promise.all([
          financialReportsApi.income(token, period.from, period.to),
          financialReportsApi.expenses(token, period.from, period.to),
          financialReportsApi.cogs(token, period.from, period.to),
          financialReportsApi.operatingExpenses(token, period.from, period.to),
          inventoryApi.valuation(token),
          documentsApi.list(token),
        ]);

        if (cancelled) return;

        const unfinished = documents.groups
          .flatMap((g) => g.documents)
          .filter(isUnfinished)
          .sort((a, b) => b.issueDate.localeCompare(a.issueDate));

        setIncomeIls(income.grandTotalIls);
        setExpensesIls(expenses.grandTotalIls);
        setCogsIls(cogs.cogsFromIssuesIls);
        setOperatingIls(operating.grandTotalRecognizedIls);
        setInventoryIls(valuation.grandTotalIls);
        setOpenDocuments(unfinished);
        setReceivableIls(documents.summary.totalReceivable);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t('dashboard.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, period.from, period.to, t]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const summary = await tenantAssetsApi.getSummary(token);
        if (cancelled || !summary.hasLogo) return;
        const blob = await tenantAssetsApi.fetchLogoBlob(token);
        if (cancelled) return;
        setLogoUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch {
        if (!cancelled) setLogoUrl(null);
      }
    })();

    return () => {
      cancelled = true;
      setLogoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, [token]);

  const statusLabel = (status: string) => {
    const key = status.toLowerCase() as 'draft' | 'sent' | 'open';
    return t(`documents.statuses.${key}`, { defaultValue: status });
  };

  const typeLabel = (documentType: string) =>
    t(`documents.types.${documentType}`, { defaultValue: documentType });

  return (
    <div className="page dashboard-page">
      <div className="dashboard-centered">
        <div className="dashboard-welcome-row">
          {logoUrl && (
            <img src={logoUrl} alt="" className="dashboard-logo" />
          )}
          <p className="dashboard-welcome">
            {t('dashboard.welcome')}, <strong>{user?.businessName}</strong>
          </p>
        </div>
        {periodLabel && <p className="dashboard-period muted">{periodLabel}</p>}

        {error && <p className="form-error">{error}</p>}

        <section className="dashboard-kpi-grid" aria-label={t('dashboard.kpiSection')}>
        <div className="dashboard-kpi-card">
          <span className="label">{t('dashboard.kpiIncome')}</span>
          <span className="value">{loading ? '…' : formatMoney(incomeIls)}</span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="label">{t('dashboard.kpiExpenses')}</span>
          <span className="value">{loading ? '…' : formatMoney(expensesIls)}</span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="label">{t('dashboard.kpiCogs')}</span>
          <span className="value">{loading ? '…' : formatMoney(cogsIls)}</span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="label">{t('dashboard.kpiOperating')}</span>
          <span className="value">{loading ? '…' : formatMoney(operatingIls)}</span>
        </div>
        <div className="dashboard-kpi-card">
          <span className="label">{t('dashboard.kpiInventory')}</span>
          <span className="value">{loading ? '…' : formatMoney(inventoryIls)}</span>
        </div>
      </section>
      </div>

      <DataTablePanel
        resize={DASHBOARD_OPEN_DOCS_PANEL_RESIZE}
        className="dashboard-open-docs-panel"
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('dashboard.openDocumentsTitle')}
              count={
                !loading && openDocuments.length > 0 ? openDocuments.length : undefined
              }
            />
            {!loading && openDocuments.length > 0 && (
              <p className="dashboard-receivable">
                {t('dashboard.openDocumentsReceivable')}:{' '}
                <strong>{formatMoney(receivableIls)}</strong>
              </p>
            )}
          </div>
        }
      >
        {loading ? (
          <p className="muted dashboard-open-docs-empty">{t('dashboard.loading')}</p>
        ) : openDocuments.length === 0 ? (
          <p className="muted dashboard-open-docs-empty">{t('dashboard.openDocumentsEmpty')}</p>
        ) : (
          <table className="dt-panel-table dashboard-open-table">
            <thead>
              <tr>
                <th>{t('documents.colNumber')}</th>
                <th>{t('documents.colType')}</th>
                <th>{t('documents.colCustomer')}</th>
                <th>{t('documents.colDate')}</th>
                <th className="num">{t('documents.colAmount')}</th>
                <th>{t('documents.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {openDocuments.map((doc) => (
                <tr key={doc.id}>
                  <td>{doc.documentNumber || '—'}</td>
                  <td>{typeLabel(doc.documentType)}</td>
                  <td>{doc.customerName || '—'}</td>
                  <td>{formatDate(doc.issueDate)}</td>
                  <td className="num">{formatMoney(doc.totalAmount)}</td>
                  <td>
                    <span className={`doc-status ${STATUS_CLASS[doc.status] ?? ''}`}>
                      {statusLabel(doc.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DataTablePanel>
    </div>
  );
}
