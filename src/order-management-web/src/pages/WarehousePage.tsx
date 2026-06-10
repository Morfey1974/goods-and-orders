import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { warehouseApi, type StockBalance, type Warehouse } from '../api/warehouse';
import { AppModal } from '../components/ui/AppModal';
import { WarehouseManageModal } from '../components/WarehouseManageModal';
import { WarehouseMovementsModal } from '../components/WarehouseMovementsModal';
import { BidiText } from '../components/BidiText';
import { DataTablePanel } from '../components/ui/DataTablePanel';
import { DataTablePanelHeading } from '../components/ui/DataTablePanelHeading';
import { ProductCodeCell } from '../components/products/ProductCodeCell';
import { useDataTablePagination } from '../hooks/useDataTablePagination';
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  WAREHOUSE_BALANCE_COLUMN_CLASS,
  WAREHOUSE_BALANCE_COLUMN_WIDTHS_KEY,
  WAREHOUSE_BALANCE_DEFAULT_WIDTHS,
  visibleWarehouseBalanceColumns,
  type WarehouseBalanceColumnKey,
} from '../lib/warehouseBalancesColumns';
import { renderDataTableHeaderCell } from '../lib/renderDataTableHeader';
import { WAREHOUSE_BALANCES_PANEL_RESIZE, WAREHOUSE_RECEIPT_RESIZE } from '../lib/resizablePanelKeys';
import { formatStockQuantity, normalizeStockQuantity } from '../lib/stockQuantity';
import { useAuth } from '../context/AuthContext';

import '../styles/documents.css';
import '../styles/inventory.css';
import '../styles/warehouse.css';

const ALL_WAREHOUSES = '';

export function WarehousePage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterWarehouseId, setFilterWarehouseId] = useState(ALL_WAREHOUSES);
  const [search, setSearch] = useState('');
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [products, setProducts] = useState<
    { id: string; articleCode: string; legacySku?: string | null; name: string }[]
  >([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [receipt, setReceipt] = useState({
    warehouseId: '',
    productId: '',
    quantity: 1,
    notes: '',
  });

  const showWarehouseColumn = filterWarehouseId === ALL_WAREHOUSES;
  const visibleColumns = useMemo(
    () => visibleWarehouseBalanceColumns(showWarehouseColumn),
    [showWarehouseColumn]
  );

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    WAREHOUSE_BALANCE_COLUMN_WIDTHS_KEY,
    WAREHOUSE_BALANCE_DEFAULT_WIDTHS
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return balances;
    return balances.filter(
      (b) =>
        b.articleCode.toLowerCase().includes(q) ||
        (b.legacySku ?? '').toLowerCase().includes(q) ||
        b.productName.toLowerCase().includes(q) ||
        b.warehouseName.toLowerCase().includes(q)
    );
  }, [balances, search]);

  const { page, setPage, pageSize, setPageSize, pageCount, pageItems, total } = useDataTablePagination(
    filtered,
    [filterWarehouseId, showWarehouseColumn, search]
  );

  const loadWarehouses = useCallback(() => {
    if (!token) return;
    warehouseApi.list(token).then(setWarehouses).catch(() => {});
  }, [token]);

  const selectedWarehouseId = filterWarehouseId || undefined;

  const load = useCallback(() => {
    if (!token) return;
    warehouseApi.balances(token, selectedWarehouseId).then(setBalances).catch((e) => setError(e.message));
    const whForProducts = filterWarehouseId || warehouses.find((w) => w.kind === 'Components')?.id;
    if (whForProducts) {
      warehouseApi
        .stockProducts(token, whForProducts)
        .then((p) =>
          setProducts(p.map((x) => ({ id: x.id, articleCode: x.articleCode, legacySku: x.legacySku, name: x.name })))
        )
        .catch(() => {});
    }
  }, [token, selectedWarehouseId, filterWarehouseId, warehouses]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    load();
  }, [load]);

  const onReceipt = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !receipt.productId) return;
    setError('');
    try {
      await warehouseApi.receipt(token, {
        productId: receipt.productId,
        quantity: normalizeStockQuantity(receipt.quantity),
        notes: receipt.notes || undefined,
        warehouseId: receipt.warehouseId || filterWarehouseId || undefined,
      });
      setMessage(t('warehouse.receiptOk'));
      setReceiptOpen(false);
      setReceipt({ warehouseId: filterWarehouseId, productId: '', quantity: 1, notes: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const openReceipt = () => {
    setReceipt({
      warehouseId: filterWarehouseId,
      productId: '',
      quantity: 1,
      notes: '',
    });
    const whId = filterWarehouseId || warehouses[0]?.id;
    if (whId && token) {
      warehouseApi
        .stockProducts(token, whId)
        .then((p) =>
          setProducts(p.map((x) => ({ id: x.id, articleCode: x.articleCode, legacySku: x.legacySku, name: x.name })))
        );
    }
    setReceiptOpen(true);
  };

  const columnLabel = (key: WarehouseBalanceColumnKey): string => {
    switch (key) {
      case 'warehouse':
        return t('products.warehouseCol');
      case 'article':
        return t('products.articleCol');
      case 'product':
        return t('products.name');
      case 'qty':
        return t('warehouse.qty');
      default:
        return key;
    }
  };

  const renderHeaderCell = (colKey: WarehouseBalanceColumnKey) =>
    renderDataTableHeaderCell(
      colKey,
      columnLabel(colKey),
      WAREHOUSE_BALANCE_COLUMN_CLASS[colKey],
      onResizeHandleMouseDown,
      t('products.resizeColumn'),
      colKey === 'product',
      'inv'
    );

  const renderCell = (colKey: WarehouseBalanceColumnKey, b: StockBalance) => {
    const className = WAREHOUSE_BALANCE_COLUMN_CLASS[colKey];
    switch (colKey) {
      case 'warehouse':
        return (
          <td key={colKey} className={className}>
            <BidiText>{b.warehouseName}</BidiText>
          </td>
        );
      case 'article':
        return (
          <td key={colKey} className={className}>
            <ProductCodeCell articleCode={b.articleCode} legacySku={b.legacySku} />
          </td>
        );
      case 'product':
        return (
          <td key={colKey} className={className}>
            <BidiText>{b.productName}</BidiText>
          </td>
        );
      case 'qty':
        return (
          <td key={colKey} className={className}>
            {formatStockQuantity(b.quantity)}
          </td>
        );
      default:
        return null;
    }
  };

  return (
    <div className="page warehouse-page">
      {message && <div className="success-banner">{message}</div>}
      {error && !receiptOpen && !manageOpen && !movementsOpen && <div className="error-banner">{error}</div>}

      <DataTablePanel
        resize={WAREHOUSE_BALANCES_PANEL_RESIZE}
        toolbar={
          <>
            <div className="dt-panel__toolbar-row">
              <DataTablePanelHeading
                title={t('nav.warehouse')}
                count={t('products.results', { count: total })}
              />
              <div className="dt-panel__toolbar-actions warehouse-toolbar-actions">
                <Link to="/warehouse/opening-balance" className="btn btn-secondary">
                  {t('inventory.openingNav')}
                </Link>
                <Link to="/reports/inventory-valuation" className="btn btn-secondary">
                  {t('inventory.valuationNav')}
                </Link>
                <button type="button" className="btn btn-secondary" onClick={() => setManageOpen(true)}>
                  {t('warehouse.manageWarehouses')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setMovementsOpen(true)}>
                  {t('warehouse.viewMovements')}
                </button>
                <Link to="/purchase-receipts/new" className="btn btn-secondary">
                  {t('purchaseReceipts.add')}
                </Link>
                <button type="button" className="btn btn-secondary" onClick={openReceipt}>
                  {t('warehouse.receipt')}
                </button>
              </div>
            </div>
          </>
        }
        toolbarSecondary={
          <div className="dt-panel-filters warehouse-list-filters">
            <label className="dt-panel-search warehouse-list-filter warehouse-list-filter--search">
              <span>{t('warehouse.search')}</span>
              <input
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('warehouse.searchPlaceholder')}
              />
            </label>
            <label className="warehouse-filter-label warehouse-list-filter warehouse-list-filter--warehouse">
              <span>{t('warehouse.filterBy')}</span>
              <select value={filterWarehouseId} onChange={(e) => setFilterWarehouseId(e.target.value)}>
                <option value={ALL_WAREHOUSES}>{t('warehouse.allWarehouses')}</option>
                {warehouses
                  .filter((w) => w.isActive)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
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
        <div className="inv-report-wrap">
          <table className="inv-report-table" style={{ minWidth: tableMinWidth }}>
            <colgroup>
              {visibleColumns.map((key) => (
                <col key={key} className={WAREHOUSE_BALANCE_COLUMN_CLASS[key]} style={{ width: widths[key] }} />
              ))}
            </colgroup>
            <thead>
              <tr>{visibleColumns.map((key) => renderHeaderCell(key))}</tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="inv-report-empty muted">
                    {t('warehouse.empty')}
                  </td>
                </tr>
              ) : (
                pageItems.map((b) => (
                  <tr key={`${b.warehouseId}-${b.productId}`}>
                    {visibleColumns.map((key) => renderCell(key, b))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DataTablePanel>

      <WarehouseManageModal
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        token={token ?? ''}
        onChanged={() => {
          loadWarehouses();
          load();
        }}
      />

      <WarehouseMovementsModal
        open={movementsOpen}
        onClose={() => setMovementsOpen(false)}
        token={token ?? ''}
        warehouseId={selectedWarehouseId}
        showWarehouseColumn={showWarehouseColumn}
      />

      <AppModal
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        ariaLabel={t('warehouse.receipt')}
        className="app-modal-panel warehouse-receipt-modal"
        overlayClassName="warehouse-receipt-overlay"
        noCard
        closeOnBackdrop={false}
        resize={WAREHOUSE_RECEIPT_RESIZE}
      >
        <header className="app-modal-panel__header">
          <h2>{t('warehouse.receipt')}</h2>
          <button
            type="button"
            className="app-modal-panel__close"
            onClick={() => setReceiptOpen(false)}
            aria-label={t('products.close')}
          >
            ×
          </button>
        </header>
        <div className="app-modal-panel__body app-modal-panel__body--form">
          <p className="muted">{t('warehouse.receiptHint')}</p>
          <form className="form-grid" onSubmit={onReceipt}>
            {error && <div className="error-banner">{error}</div>}
            <label>
              {t('products.warehouseCol')}
              <select
                value={receipt.warehouseId}
                onChange={(e) => {
                  const whId = e.target.value;
                  setReceipt({ ...receipt, warehouseId: whId, productId: '' });
                  if (token && whId) {
                    warehouseApi
                      .stockProducts(token, whId)
                      .then((p) =>
                        setProducts(
                          p.map((x) => ({
                            id: x.id,
                            articleCode: x.articleCode,
                            legacySku: x.legacySku,
                            name: x.name,
                          }))
                        )
                      );
                  }
                }}
                required
              >
                <option value="">—</option>
                {warehouses
                  .filter((w) => w.isActive)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('products.name')}
              <select
                value={receipt.productId}
                onChange={(e) => setReceipt({ ...receipt, productId: e.target.value })}
                required
              >
                <option value="">—</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.articleCode}
                    {p.legacySku ? ` (${p.legacySku})` : ''} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('warehouse.qty')}
              <input
                type="number"
                min={0.0001}
                step={1}
                value={receipt.quantity}
                onChange={(e) => setReceipt({ ...receipt, quantity: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              {t('warehouse.notes')}
              <input value={receipt.notes} onChange={(e) => setReceipt({ ...receipt, notes: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost-inline" onClick={() => setReceiptOpen(false)}>
                {t('settings.cancel')}
              </button>
              <button type="submit" className="btn btn-primary">
                {t('submit')}
              </button>
            </div>
          </form>
        </div>
      </AppModal>
    </div>
  );
}
