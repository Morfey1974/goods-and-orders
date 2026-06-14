import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { financialReportsApi, type VendorServicesReport } from '../api/financialReports';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { ReportDateRangePicker } from '../components/reports/ReportDateRangePicker';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { usePersistReportsCategory } from '../hooks/usePersistReportsCategory';
import { getReportDatePresetRange, type ReportDatePresetId } from '../lib/reportDatePresets';
import { buildReportPdfFileName } from '../lib/pdfDownload';
import { VENDOR_SERVICES_REPORT_PANEL_RESIZE } from '../lib/resizablePanelKeys';

import '../styles/inventory.css';
import '../styles/reports.css';

const SOURCE_KINDS = ['LandedCost', 'GrService', 'Journal'] as const;

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
  const [search, setSearch] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [report, setReport] = useState<VendorServicesReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDownloadFileName, setPdfDownloadFileName] = useState('');
  const pdfParamsRef = useRef({ from, to });

  const lines = report?.lines ?? [];

  const sourceLabel = useCallback(
    (sourceKind: string) => t(`reports.vendorServicesSource.${sourceKind}` as 'reports.vendorServicesSource.LandedCost'),
    [t]
  );

  const vendorFilterOptions = useMemo(() => {
    const names = new Set<string>();
    for (const row of lines) {
      const name = row.vendorName?.trim();
      if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [lines]);

  const categoryFilterOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const row of lines) {
      const category = row.category?.trim();
      if (category) categories.add(category);
    }
    return [...categories].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [lines]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((row) => {
      if (filterVendor && row.vendorName !== filterVendor) return false;
      if (filterSource && row.sourceKind !== filterSource) return false;
      if (filterCategory && row.category !== filterCategory) return false;
      if (!q) return true;
      const haystack = [row.description, row.receiptNumber, row.category, sourceLabel(row.sourceKind)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [lines, search, filterVendor, filterSource, filterCategory, sourceLabel]);

  const filteredTotal = useMemo(
    () => filtered.reduce((sum, row) => sum + row.amountIls, 0),
    [filtered]
  );

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(filtered, [
    from,
    to,
    search,
    filterVendor,
    filterSource,
    filterCategory,
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
      buildReportPdfFileName('reports.pdfFileName_vendorServices', { from: params.from, to: params.to })
    );
    setPdfOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    revokePdfUrl();
    try {
      const blob = await financialReportsApi.fetchVendorServicesPdfBlob(
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
    <div className="page inventory-page vendor-services-page">
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
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
                {loading ? t('settings.saving') : t('reports.vendorServicesRun')}
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
          <div className="vs-list-toolbar">
            <div className="dt-panel-filters vs-list-filters">
              <label className="vs-list-filter vs-list-filter--search">
                <span>{t('reports.vendorServicesSearch')}</span>
                <input
                  type="search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('reports.vendorServicesSearchPlaceholder')}
                />
              </label>
              <label className="vs-list-filter vs-list-filter--vendor">
                <span>{t('reports.vendorServicesFilterVendor')}</span>
                <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}>
                  <option value="">{t('reports.vendorServicesAllVendors')}</option>
                  {vendorFilterOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vs-list-filter vs-list-filter--source">
                <span>{t('reports.vendorServicesFilterSource')}</span>
                <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
                  <option value="">{t('reports.vendorServicesAllSources')}</option>
                  {SOURCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {sourceLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="vs-list-filter vs-list-filter--category">
                <span>{t('reports.vendorServicesFilterCategory')}</span>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="">{t('reports.vendorServicesAllCategories')}</option>
                  {categoryFilterOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
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
            <p className="muted vs-list-hint">{t('reports.vendorServicesHint')}</p>
          </div>
        }
        summary={
          report && total > 0 ? (
            <span>{t('reports.vendorServicesSummary', { total: formatIls(filteredTotal) })}</span>
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
                      ? `${sourceLabel(row.sourceKind)} ${row.receiptNumber}`
                      : sourceLabel(row.sourceKind)}
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

      <DocumentPdfPreviewModal
        open={pdfOpen}
        title={t('reports.vendorServicesTitle')}
        pdfUrl={pdfUrl}
        loading={pdfLoading}
        error={pdfError}
        onClose={closePdf}
        downloadFileName={pdfDownloadFileName}
      />
    </div>
  );
}
