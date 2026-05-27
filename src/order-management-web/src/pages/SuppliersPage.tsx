import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { suppliersApi, type Supplier } from '../api/suppliers';
import { CatalogRowMenu } from '../components/products/CatalogRowMenu';
import { AppModal } from '../components/ui/AppModal';
import { useAuth } from '../context/AuthContext';
import '../styles/customers.css';
import '../styles/products-catalog.css';

export function SuppliersPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [list, setList] = useState<Supplier[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const [activatingAll, setActivatingAll] = useState(false);
  const [message, setMessage] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const rowMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [rowMenuSupplier, setRowMenuSupplier] = useState<Supplier | null>(null);

  const [inactiveCount, setInactiveCount] = useState(0);

  const load = useCallback(() => {
    if (!token) return;
    const opts = {
      country: country.trim() || undefined,
      search: search.trim() || undefined,
    };
    Promise.all([
      suppliersApi.list(token, { ...opts, includeInactive }),
      suppliersApi.list(token, { ...opts, includeInactive: true }),
    ])
      .then(([visible, all]) => {
        setList(visible);
        setInactiveCount(all.filter((s) => !s.isActive).length);
      })
      .catch((e) => setError(e.message));
  }, [token, includeInactive, country, search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (
        !el.closest('.action-plus-wrap') &&
        !el.closest('.row-menu--portal')
      ) {
        setRowMenuSupplier(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const toggleRowMenu = (supplier: Supplier, btn: HTMLButtonElement) => {
    if (rowMenuSupplier?.id === supplier.id) {
      setRowMenuSupplier(null);
      rowMenuAnchorRef.current = null;
    } else {
      rowMenuAnchorRef.current = btn;
      setRowMenuSupplier(supplier);
    }
  };

  const filtered = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [list]
  );

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    setImportSuccess(false);
    setError('');
    try {
      const r = await suppliersApi.importCsv(token, file, updateExisting);
      setImportResult(
        t('suppliers.importDone', {
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

  const onActivateAll = async () => {
    if (!token || inactiveCount === 0) return;
    if (!window.confirm(t('suppliers.activateAllConfirm', { count: inactiveCount }))) return;
    setActivatingAll(true);
    setError('');
    setMessage('');
    try {
      const n = await suppliersApi.activateAll(token);
      setMessage(t('suppliers.activateAllDone', { count: n }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setActivatingAll(false);
    }
  };

  return (
    <div className="page customers-page">
      <div className="customers-page-toolbar">
        <div className="customers-page-title-row">
          <h1>{t('nav.suppliers')}</h1>
          <span className="customers-count-badge">
            {t('suppliers.resultsCount', { count: filtered.length })}
          </span>
        </div>
        <div className="customers-page-actions">
          {inactiveCount > 0 && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={activatingAll}
              onClick={onActivateAll}
            >
              {activatingAll ? t('suppliers.activatingAll') : t('suppliers.activateAll')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            title={t('suppliers.import')}
            onClick={() => setImportOpen(true)}
          >
            ⬇ {t('suppliers.import')}
          </button>
          <Link to="/purchase-receipts/new" className="btn btn-secondary">
            + {t('purchaseReceipts.add')}
          </Link>
          <Link to="/suppliers/new" className="btn btn-primary customers-add-btn">
            + {t('suppliers.add')}
          </Link>
        </div>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && !importOpen && <div className="error-banner">{error}</div>}

      <div className="customers-filters card">
        <label className="customers-search">
          <span className="sr-only">{t('suppliers.search')}</span>
          <input
            type="search"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('suppliers.searchPlaceholder')}
          />
        </label>
        <label>
          <span className="muted" style={{ fontSize: '0.82rem' }}>{t('suppliers.countryFilter')}</span>
          <input
            type="text"
            maxLength={2}
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            placeholder="IL"
            style={{ width: '4rem', marginLeft: '0.35rem' }}
          />
        </label>
        <label className="customers-filter-active">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          {t('suppliers.showInactive')}
        </label>
      </div>

      <div className="card customers-table-wrap">
        <table className="customers-table">
          <thead>
            <tr>
              <th>{t('suppliers.colName')}</th>
              <th>{t('customers.status')}</th>
              <th>{t('suppliers.colCountry')}</th>
              <th>{t('suppliers.colTaxId')}</th>
              <th>{t('suppliers.colCurrency')}</th>
              <th>{t('suppliers.colContact')}</th>
              <th className="customers-col-actions">{t('products.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className={!s.isActive ? 'customers-row--inactive' : ''}
                onClick={() => navigate(`/suppliers/${s.id}`)}
              >
                <td className="customers-cell-name">
                  <span className="customers-name-link">{s.name}</span>
                </td>
                <td>
                  {s.isActive ? (
                    <span className="customers-badge customers-badge--active">{t('suppliers.active')}</span>
                  ) : (
                    <span className="customers-badge customers-badge--inactive">{t('suppliers.inactive')}</span>
                  )}
                </td>
                <td>{s.countryCode || '—'}</td>
                <td>{s.taxId || '—'}</td>
                <td>{s.defaultCurrency}</td>
                <td>{s.email || s.phone || s.mobilePhone || '—'}</td>
                <td className="customers-cell-actions table-actions-cell" onClick={(e) => e.stopPropagation()}>
                  <div className="action-plus-wrap">
                    <button
                      type="button"
                      className={`action-plus-btn${rowMenuSupplier?.id === s.id ? ' is-open' : ''}`}
                      aria-label={t('suppliers.rowActions')}
                      aria-expanded={rowMenuSupplier?.id === s.id}
                      aria-haspopup="menu"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowMenu(s, e.currentTarget);
                      }}
                    >
                      +
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="muted customers-empty">{t('suppliers.empty')}</p>}
      </div>

      <CatalogRowMenu
        open={rowMenuSupplier !== null}
        anchorRef={rowMenuAnchorRef}
      >
        {rowMenuSupplier && (
          <>
            <button
              type="button"
              onClick={() => {
                setRowMenuSupplier(null);
                navigate(`/suppliers/${rowMenuSupplier.id}`);
              }}
            >
              {t('suppliers.actionEdit')}
            </button>
            <button
              type="button"
              onClick={() => {
                setRowMenuSupplier(null);
                navigate(`/purchase-receipts/new?supplierId=${rowMenuSupplier.id}`);
              }}
            >
              {t('suppliers.addPurchaseReceipt')}
            </button>
          </>
        )}
      </CatalogRowMenu>

      <AppModal
        open={importOpen}
        onClose={closeImport}
        preventClose={importing}
        size="md"
        className="customers-import-modal"
        overlayClassName="customers-import-overlay"
      >
        <h2>{t('suppliers.importTitle')}</h2>
        <p className="muted">{t('suppliers.importHint')}</p>
        <label className="customers-import-option">
          <input
            type="checkbox"
            checked={updateExisting}
            onChange={(e) => setUpdateExisting(e.target.checked)}
          />
          {t('suppliers.importUpdateExisting')}
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
          {importing ? t('suppliers.importing') : t('suppliers.importChooseFile')}
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
