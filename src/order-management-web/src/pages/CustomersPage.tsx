import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { catalogApi, type Customer } from '../api/catalog';
import { AppModal } from '../components/ui/AppModal';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { useAuth } from '../context/AuthContext';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  CUSTOMERS_COLUMN_CLASS,
  CUSTOMERS_COLUMN_KEYS,
  CUSTOMERS_COLUMN_WIDTHS_KEY,
  CUSTOMERS_DEFAULT_WIDTHS,
  CUSTOMERS_TEXT_START_COLUMNS,
  type CustomersColumnKey,
} from '../lib/listTableColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { CUSTOMERS_PANEL_RESIZE } from '../lib/resizablePanelKeys';

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function idDisplay(c: Customer) {
  const parts = [c.osekNumber, c.teudatZehut].filter(Boolean);
  return parts.length ? parts.join(' / ') : '—';
}

export function CustomersPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<Customer[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    CUSTOMERS_COLUMN_WIDTHS_KEY,
    CUSTOMERS_DEFAULT_WIDTHS
  );

  const load = useCallback(() => {
    if (!token) return;
    catalogApi.customers
      .list(token, includeInactive)
      .then(setList)
      .catch((e) => setError(e.message));
  }, [token, includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = list;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.documentName ?? '').toLowerCase().includes(q) ||
          (c.mobilePhone ?? '').includes(q) ||
          (c.phone ?? '').includes(q) ||
          (c.email ?? '').toLowerCase().includes(q) ||
          (c.city ?? '').toLowerCase().includes(q)
      );
    }
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [list, search]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(filtered, [
    search,
    includeInactive,
  ]);

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    setImportSuccess(false);
    setError('');
    try {
      const r = await catalogApi.customers.importCsv(token, file, updateExisting);
      setImportResult(
        t('customers.importDone', {
          imported: r.importedCount,
          updated: r.updatedCount,
          skipped: r.skippedCount,
          errors: r.errorCount,
        })
      );
      setImportSuccess(r.importedCount > 0 || r.updatedCount > 0);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportResult(null);
    setImportSuccess(false);
  };

  const columnLabel = (key: CustomersColumnKey): string => {
    switch (key) {
      case 'name':
        return t('customers.colName');
      case 'documentName':
        return t('customers.documentName');
      case 'mobile':
        return t('customers.colMobile');
      case 'id':
        return t('customers.colId');
      case 'paymentTerms':
        return t('customers.paymentTerms');
      case 'discount':
        return t('customers.discount');
      case 'created':
        return t('customers.colCreated');
      case 'actions':
        return '';
      default:
        return key;
    }
  };

  const cellClass = (key: CustomersColumnKey) =>
    `${CUSTOMERS_COLUMN_CLASS[key]}${CUSTOMERS_TEXT_START_COLUMNS.has(key) ? ' dt-col-text-start' : ''}`;

  return (
    <div className="page customers-page">
      {error && !importOpen && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={CUSTOMERS_PANEL_RESIZE}
        toolbar={
          <div className="dt-panel__toolbar-row">
            <DataTablePanelHeading
              title={t('nav.customers')}
              count={t('customers.resultsCount', { count: total })}
            />
            <div className="dt-panel__toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary"
                title={t('customers.import')}
                onClick={() => setImportOpen(true)}
              >
                ⬇ {t('customers.import')}
              </button>
              <Link to="/customers/new" className="btn btn-primary">
                + {t('customers.add')}
              </Link>
            </div>
          </div>
        }
        toolbarSecondary={
          <div className="dt-panel-filters">
            <label className="dt-panel-search">
              <span className="sr-only">{t('customers.search')}</span>
              <input
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('customers.searchPlaceholder')}
              />
            </label>
            <label className="dt-panel-filter-check">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              {t('customers.showInactive')}
            </label>
          </div>
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
        <table className="dt-panel-table" style={{ minWidth: tableMinWidth }}>
          <colgroup>
            {CUSTOMERS_COLUMN_KEYS.map((key) => (
              <col key={key} style={{ width: widths[key] }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {CUSTOMERS_COLUMN_KEYS.map((key) =>
                key === 'actions' ? (
                  <th key={key} className={CUSTOMERS_COLUMN_CLASS[key]} aria-hidden="true" />
                ) : (
                  renderDataTableHeaderCell(
                    key,
                    columnLabel(key),
                    CUSTOMERS_COLUMN_CLASS[key],
                    onResizeHandleMouseDown,
                    t('products.resizeColumn'),
                    CUSTOMERS_TEXT_START_COLUMNS.has(key)
                  )
                )
              )}
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={CUSTOMERS_COLUMN_KEYS.length} className="dt-panel-empty muted">
                  {t('customers.empty')}
                </td>
              </tr>
            ) : (
              pageItems.map((c) => (
                <tr
                  key={c.id}
                  className={`dt-panel-row-clickable${!c.isActive ? ' customers-row--inactive' : ''}`}
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <td className={cellClass('name')}>
                    <span className="customers-name-link">{c.name}</span>
                    {c.isActive ? (
                      <span className="customers-badge customers-badge--active">{t('customers.active')}</span>
                    ) : (
                      <span className="customers-badge customers-badge--inactive">{t('customers.inactive')}</span>
                    )}
                  </td>
                  <td className={`${cellClass('documentName')} bidi-auto`}>{c.documentName || c.name}</td>
                  <td className={cellClass('mobile')}>{c.mobilePhone || c.phone || '—'}</td>
                  <td className={cellClass('id')}>{idDisplay(c)}</td>
                  <td className={cellClass('paymentTerms')}>{c.paymentTerms || '—'}</td>
                  <td className={cellClass('discount')}>
                    {c.defaultDiscountPercent > 0 ? `${c.defaultDiscountPercent}%` : '—'}
                  </td>
                  <td className={cellClass('created')}>{formatDate(c.createdAt)}</td>
                  <td className={`${cellClass('actions')} customers-cell-actions`}>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/customers/${c.id}`);
                      }}
                    >
                      {t('customers.edit')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </DataTablePanel>

      <AppModal
        open={importOpen}
        onClose={closeImport}
        preventClose={importing}
        size="md"
        className="customers-import-modal"
        overlayClassName="customers-import-overlay"
      >
        <h2>{t('customers.importTitle')}</h2>
        <p className="muted">{t('customers.importHint')}</p>
        <label className="customers-import-option">
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
          />
          {t('customers.importUpdateExisting')}
        </label>
        <input
          ref={importInputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={onImportFile}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={importing}
          onClick={() => importInputRef.current?.click()}
        >
          {importing ? t('customers.importing') : t('customers.importChooseFile')}
        </button>
        {importResult && (
          <div className={importSuccess ? 'success-banner' : 'error-banner'}>{importResult}</div>
        )}
        <div className="customers-import-modal-actions">
          <button type="button" className="btn btn-ghost-inline" onClick={closeImport}>
            {t('settings.cancel')}
          </button>
        </div>
      </AppModal>
    </div>
  );
}
