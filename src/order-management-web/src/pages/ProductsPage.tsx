import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogApi, PRODUCT_TYPES, type Product } from '../api/catalog';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppModal } from '../components/ui/AppModal';
import { CatalogRowMenu } from '../components/products/CatalogRowMenu';
import { ProductEditModal } from '../components/products/ProductEditModal';
import { ProductPhoto } from '../components/products/ProductPhoto';
import { normalizeStockQuantity } from '../lib/stockQuantity';
import { warehouseLabelForProductType } from '../lib/warehouseLabel';
import '../styles/products-catalog.css';

const PAGE_SIZES = [50, 100, 200] as const;

type SortKey = 'articleCode' | 'name' | 'unitPrice' | 'stockQuantity' | 'isActive';
type SortDir = 'asc' | 'desc';

function tracksStock(type: string) {
  return ['ComponentPart', 'FinishedGood', 'Bundle', 'Spare'].includes(type);
}

export function ProductsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [list, setList] = useState<Product[]>([]);
  const [components, setComponents] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStock, setFilterStock] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [pageSize, setPageSize] = useState<number>(100);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('articleCode');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [actionsOpen, setActionsOpen] = useState(false);
  const [rowMenuId, setRowMenuId] = useState<string | null>(null);
  const rowMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const tableTopRef = useRef<HTMLDivElement>(null);
  const skipPageScrollRef = useRef(true);

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStock, setImportStock] = useState(true);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'general' | 'movements'>('general');
  const [editing, setEditing] = useState<Product | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [nextArticle, setNextArticle] = useState('');

  const load = useCallback(() => {
    if (!token) return;
    catalogApi.products.list(token).then(setList).catch((e) => setError(e.message));
    catalogApi.products.list(token, 'ComponentPart').then(setComponents).catch(() => {});
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActionsOpen(false);
      }
      const el = e.target as HTMLElement;
      if (!el.closest('.row-menu-wrap') && !el.closest('.row-menu--portal')) {
        setRowMenuId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((p) => {
      if (filterType && p.productType !== filterType) return false;
      if (filterStatus === 'active' && !p.isActive) return false;
      if (filterStatus === 'inactive' && p.isActive) return false;
      const stock = p.stockQuantity ?? 0;
      if (filterStock === 'inStock' && stock <= 0) return false;
      if (filterStock === 'zero' && stock > 0) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.articleCode.toLowerCase().includes(q) ||
        (p.legacySku?.toLowerCase().includes(q) ?? false) ||
        (p.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [list, search, filterType, filterStock, filterStatus]);

  const sorted = useMemo(() => {
    const items = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'articleCode':
          cmp = a.articleCode.localeCompare(b.articleCode, undefined, { numeric: true });
          break;
        case 'name':
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
          break;
        case 'unitPrice':
          cmp = a.unitPrice - b.unitPrice;
          break;
        case 'stockQuantity': {
          const sa = tracksStock(a.productType) ? (a.stockQuantity ?? 0) : -1;
          const sb = tracksStock(b.productType) ? (b.stockQuantity ?? 0) : -1;
          cmp = sa - sb;
          break;
        }
        case 'isActive':
          cmp = Number(a.isActive) - Number(b.isActive);
          break;
        default:
          break;
      }
      if (cmp === 0 && sortKey !== 'articleCode') {
        cmp = a.articleCode.localeCompare(b.articleCode, undefined, { numeric: true });
      }
      return cmp * dir;
    });
    return items;
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageItems = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const rowMenuProduct = useMemo(() => {
    if (!rowMenuId) return null;
    return pageItems.find((p) => p.id === rowMenuId) ?? sorted.find((p) => p.id === rowMenuId) ?? null;
  }, [rowMenuId, pageItems, sorted]);

  const toggleRowMenu = (productId: string, btn: HTMLButtonElement) => {
    if (rowMenuId === productId) {
      setRowMenuId(null);
      rowMenuAnchorRef.current = null;
    } else {
      rowMenuAnchorRef.current = btn;
      setRowMenuId(productId);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortMark = (key: SortKey) => {
    if (sortKey !== key) return '⇅';
    return sortDir === 'asc' ? '▲' : '▼';
  };

  const sortThProps = (key: SortKey) => ({
    className: `catalog-th-sortable${sortKey === key ? ' sorted' : ''}`,
    onClick: () => toggleSort(key),
    onKeyDown: (e: KeyboardEvent<HTMLTableCellElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSort(key);
      }
    },
    'aria-sort': (sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none') as
      | 'ascending'
      | 'descending'
      | 'none',
    tabIndex: 0,
  });

  useEffect(() => {
    setPage(0);
  }, [search, filterType, filterStock, filterStatus, pageSize, sortKey, sortDir]);

  useEffect(() => {
    if (skipPageScrollRef.current) {
      skipPageScrollRef.current = false;
      return;
    }
    tableTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [page]);

  const loadNextArticle = async (type: string) => {
    if (!token) return;
    const r = await catalogApi.products.peekArticle(token, type);
    setNextArticle(r.articleCode);
  };

  const closeProductModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDuplicateFrom(null);
  };

  const openCreate = () => {
    setEditing(null);
    setDuplicateFrom(null);
    setModalTab('general');
    loadNextArticle('ComponentPart');
    setModalOpen(true);
  };

  const openEdit = async (p: Product, tab: 'general' | 'movements' = 'general') => {
    if (!token) return;
    setRowMenuId(null);
    setError('');
    setDuplicateFrom(null);
    try {
      const fresh = await catalogApi.products.get(token, p.id);
      setEditing(fresh);
      setModalTab(tab);
      setNextArticle(fresh.articleCode);
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onProductUpdated = (updated: Product) => {
    setEditing(updated);
    setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  };

  const onQuickPrice = async (p: Product, value: number) => {
    if (!token || value === p.unitPrice) return;
    try {
      const updated = await catalogApi.products.quickUpdate(token, p.id, {
        unitPrice: value,
        version: p.version,
      });
      setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === updated.id) setEditing(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onQuickStock = async (p: Product, value: number) => {
    if (!token || !tracksStock(p.productType)) return;
    const qty = normalizeStockQuantity(value);
    const current = normalizeStockQuantity(p.stockQuantity ?? 0);
    if (qty === current) return;
    try {
      const updated = await catalogApi.products.quickUpdate(token, p.id, {
        stockQuantity: qty,
        version: p.version,
      });
      setList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      if (editing?.id === updated.id) setEditing(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onDuplicate = async (p: Product) => {
    if (!token) return;
    setRowMenuId(null);
    setError('');
    try {
      const fresh = await catalogApi.products.get(token, p.id);
      setEditing(null);
      setDuplicateFrom(fresh);
      setModalTab('general');
      await loadNextArticle(fresh.productType);
      setModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const requestDelete = (p: Product) => {
    setRowMenuId(null);
    setDeleteTarget(p);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleteBusy(true);
    try {
      await catalogApi.products.delete(token, deleteTarget.id);
      setMessage(t('products.deleted'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const onExport = async () => {
    if (!token) return;
    setActionsOpen(false);
    try {
      await catalogApi.products.exportCsv(token);
      setMessage(t('products.exported'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onDeactivateAll = async () => {
    if (!token) return;
    setActionsOpen(false);
    if (!window.confirm(t('products.deactivateAllConfirm'))) return;
    try {
      const r = await catalogApi.products.deactivateAll(token);
      setMessage(t('products.deactivatedAll', { count: r.deactivated }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const restoreImported = async () => {
    if (!token) return;
    try {
      const r = await catalogApi.products.reactivateImported(token);
      setMessage(t('products.reactivated', { count: r.reactivated }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    e.target.value = '';
    setImporting(true);
    setImportResult(null);
    setImportSuccess(false);
    setError('');
    try {
      const r = await catalogApi.products.importCsv(token, file, 'ComponentPart', importStock);
      let reactivated = 0;
      if (r.importedCount === 0 && r.skippedCount > 0) {
        const fix = await catalogApi.products.reactivateImported(token);
        reactivated = fix.reactivated;
      }
      setImportResult(
        t('products.importDone', {
          imported: r.importedCount,
          skipped: r.skippedCount,
          errors: r.errorCount,
          reactivated,
        })
      );
      setImportSuccess(r.importedCount > 0 || reactivated > 0);
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
    setError('');
  };

  return (
    <div className="page products-catalog-page">
      <div className="catalog-header">
        <div className="catalog-title-row">
          <h1>{t('nav.products')}</h1>
          <span className="result-count">
            {t('products.results', { count: filtered.length })}
          </span>
        </div>
        <div className="catalog-header-actions">
          <button type="button" className="btn-new-item" onClick={openCreate}>
            + {t('products.newItem')}
          </button>
          <div className="icon-toolbar" ref={actionsRef}>
            <button
              type="button"
              className="icon-btn"
              title={t('products.import')}
              onClick={() => setImportOpen(true)}
            >
              ⬇
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('products.export')}
              onClick={onExport}
            >
              ⬆
            </button>
            <div className="dropdown-wrap">
              <button
                type="button"
                className={`icon-btn ${actionsOpen ? 'active' : ''}`}
                title={t('products.actions')}
                onClick={() => setActionsOpen((v) => !v)}
              >
                💼
              </button>
              {actionsOpen && (
                <div className="dropdown-menu">
                  <button type="button" onClick={() => setFiltersVisible((v) => !v)}>
                    {filtersVisible ? t('products.hideFilters') : t('products.showFilters')}
                  </button>
                  <button type="button" onClick={() => { setActionsOpen(false); setImportOpen(true); }}>
                    {t('products.importItems')}
                  </button>
                  <button type="button" onClick={onExport}>
                    {t('products.exportItems')}
                  </button>
                  <button type="button" className="danger" onClick={onDeactivateAll}>
                    {t('products.deactivateAll')}
                  </button>
                  <button type="button" disabled title={t('products.comingSoon')}>
                    {t('products.bulkSku')}
                  </button>
                  <button type="button" disabled title={t('products.comingSoon')}>
                    {t('products.transferWarehouses')}
                  </button>
                </div>
              )}
            </div>
          </div>
          {list.length === 0 && (
            <button type="button" className="btn btn-secondary" onClick={restoreImported}>
              {t('products.showImported')}
            </button>
          )}
        </div>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && !modalOpen && !importOpen && <div className="error-banner">{error}</div>}

      {filtersVisible && (
        <div className="catalog-filters-bar">
          <div className="catalog-search">
            <span className="catalog-search-icon">🔍</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">{t('products.filterSkuType')}</option>
            {PRODUCT_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {t(`products.types.${pt}`)}
              </option>
            ))}
          </select>
          <select value={filterStock} onChange={(e) => setFilterStock(e.target.value)}>
            <option value="">{t('products.filterStock')}</option>
            <option value="inStock">{t('products.stockIn')}</option>
            <option value="zero">{t('products.stockZero')}</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">{t('products.filterStatus')}</option>
            <option value="active">{t('products.statusActive')}</option>
            <option value="inactive">{t('products.statusInactive')}</option>
          </select>
          <div className="page-size-select">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label={t('products.pageSize')}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="card catalog-table-wrap" ref={tableTopRef}>
        <div className="catalog-table-scroll">
        <table className="catalog-table">
          <thead>
            <tr>
              <th>{t('products.colImage')}</th>
              <th {...sortThProps('articleCode')}>
                <span className="catalog-th-sort-label">
                  {t('products.articleCol')}
                  <span className="sort-indicator" aria-hidden>
                    {sortMark('articleCode')}
                  </span>
                </span>
              </th>
              <th {...sortThProps('name')}>
                <span className="catalog-th-sort-label">
                  {t('products.name')}
                  <span className="sort-indicator" aria-hidden>
                    {sortMark('name')}
                  </span>
                </span>
              </th>
              <th>{t('products.warehouseCol')}</th>
              <th {...sortThProps('unitPrice')}>
                <span className="catalog-th-sort-label">
                  {t('products.price')}
                  <span className="sort-indicator" aria-hidden>
                    {sortMark('unitPrice')}
                  </span>
                </span>
              </th>
              <th {...sortThProps('stockQuantity')}>
                <span className="catalog-th-sort-label">
                  {t('products.stock')}
                  <span className="sort-indicator" aria-hidden>
                    {sortMark('stockQuantity')}
                  </span>
                </span>
              </th>
              <th {...sortThProps('isActive')}>
                <span className="catalog-th-sort-label">
                  {t('products.status')}
                  <span className="sort-indicator" aria-hidden>
                    {sortMark('isActive')}
                  </span>
                </span>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((p) => (
              <tr key={p.id} className={!p.isActive ? 'row-inactive' : ''}>
                <td>
                  {token && (
                    <ProductPhoto
                      key={`${p.id}-${p.hasImage}-${p.version}`}
                      productId={p.id}
                      token={token}
                      hasImage={p.hasImage}
                      alt={p.name}
                      size="sm"
                      className="product-cell-thumb"
                      previewable
                    />
                  )}
                </td>
                <td>
                  <code>{p.articleCode}</code>
                </td>
                <td className="product-cell-name">
                  <strong>{p.name}</strong>
                  {p.description && <div className="sub">{p.description}</div>}
                </td>
                <td>{warehouseLabelForProductType(p.productType, t)}</td>
                <td>
                  <input
                    type="number"
                    className="catalog-inline-input price"
                    min={0}
                    step={0.01}
                    defaultValue={p.unitPrice}
                    key={`${p.id}-price-${p.version}`}
                    onBlur={(e) => onQuickPrice(p, Number(e.target.value))}
                  />
                </td>
                <td>
                  {tracksStock(p.productType) ? (
                    <input
                      type="number"
                      className="catalog-inline-input"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      defaultValue={normalizeStockQuantity(p.stockQuantity ?? 0)}
                      key={`${p.id}-stock-${p.version}-${p.stockQuantity}`}
                      onBlur={(e) => onQuickStock(p, Number(e.target.value))}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  {p.isActive ? (
                    <span className="status-active">{t('products.statusActive')}</span>
                  ) : (
                    <span className="status-inactive">{t('products.statusInactive')}</span>
                  )}
                </td>
                <td>
                  <div className={`row-menu-wrap${rowMenuId === p.id ? ' is-open' : ''}`}>
                    <button
                      type="button"
                      className="row-menu-btn"
                      onClick={(e) => toggleRowMenu(p.id, e.currentTarget)}
                      aria-label={t('products.actions')}
                      aria-expanded={rowMenuId === p.id}
                    >
                      ⋮
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {filtered.length === 0 && (
          <p className="muted empty-table">{t('products.empty')}</p>
        )}
        {filtered.length > pageSize && (
          <div className="catalog-pagination">
            <button
              type="button"
              className="btn btn-ghost-inline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ←
            </button>
            <span className="muted">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              className="btn btn-ghost-inline"
              disabled={page >= pageCount - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              →
            </button>
          </div>
        )}
      </div>

      <AppModal open={importOpen} onClose={closeImport} preventClose={importing} size="md">
            <h2>{t('products.importTitle')}</h2>
            <p className="muted">{t('products.importHint')}</p>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={importStock}
                onChange={(e) => setImportStock(e.target.checked)}
              />
              {t('products.importStock')}
            </label>
            <label className="import-file-label">
              <span className="btn btn-primary">
                {importing ? t('products.importing') : t('products.chooseFile')}
              </span>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={onImportFile}
                disabled={importing}
                hidden
              />
            </label>
            {importResult && (
              <div className={importSuccess ? 'success-banner' : 'error-banner'}>
                {importResult}
              </div>
            )}
            <div className="modal-actions">
              {!importSuccess && (
                <button
                  type="button"
                  className="btn btn-ghost-inline"
                  onClick={closeImport}
                  disabled={importing}
                >
                  {t('settings.cancel')}
                </button>
              )}
              {importSuccess && (
                <button type="button" className="btn btn-primary" onClick={closeImport}>
                  {t('products.done')}
                </button>
              )}
            </div>
      </AppModal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('products.deleteConfirmTitle')}
        message={t('products.deleteConfirm', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('products.actionDelete')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />

      <CatalogRowMenu open={rowMenuProduct !== null} anchorRef={rowMenuAnchorRef}>
        {rowMenuProduct && (
          <>
            <button type="button" onClick={() => openEdit(rowMenuProduct)}>
              ✎ {t('products.actionEdit')}
            </button>
            <button type="button" onClick={() => onDuplicate(rowMenuProduct)}>
              ⧉ {t('products.actionDuplicate')}
            </button>
            {tracksStock(rowMenuProduct.productType) && (
              <button type="button" onClick={() => openEdit(rowMenuProduct, 'movements')}>
                ⚖ {t('products.actionMovements')}
              </button>
            )}
            <button type="button" disabled title={t('products.comingSoon')}>
              📄 {t('products.actionDocuments')}
            </button>
            <button type="button" className="danger" onClick={() => requestDelete(rowMenuProduct)}>
              🗑 {t('products.actionDelete')}
            </button>
          </>
        )}
      </CatalogRowMenu>

      <ProductEditModal
        open={modalOpen}
        token={token ?? ''}
        product={editing}
        duplicateFrom={duplicateFrom}
        nextArticle={nextArticle}
        components={components}
        initialTab={modalTab}
        onClose={closeProductModal}
        onSaved={(msg) => {
          setMessage(msg);
          closeProductModal();
          load();
        }}
        onError={setError}
        onProductUpdated={onProductUpdated}
      />
    </div>
  );
}
