import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { warehouseApi, type StockBalance, type Warehouse } from '../api/warehouse';
import { AppModal } from '../components/ui/AppModal';
import { WarehouseManageModal } from '../components/WarehouseManageModal';
import { WarehouseMovementsModal } from '../components/WarehouseMovementsModal';
import { WAREHOUSE_RECEIPT_RESIZE } from '../lib/resizablePanelKeys';
import { formatStockQuantity, normalizeStockQuantity } from '../lib/stockQuantity';
import { useAuth } from '../context/AuthContext';
import '../styles/documents.css';

const ALL_WAREHOUSES = '';

export function WarehousePage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filterWarehouseId, setFilterWarehouseId] = useState(ALL_WAREHOUSES);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [products, setProducts] = useState<{ id: string; articleCode: string; name: string }[]>([]);
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

  const loadWarehouses = useCallback(() => {
    if (!token) return;
    warehouseApi.list(token).then(setWarehouses).catch(() => {});
  }, [token]);

  const selectedWarehouseId = filterWarehouseId || undefined;
  const showWarehouseColumn = filterWarehouseId === ALL_WAREHOUSES;

  const load = useCallback(() => {
    if (!token) return;
    warehouseApi.balances(token, selectedWarehouseId).then(setBalances).catch((e) => setError(e.message));
    const whForProducts = filterWarehouseId || warehouses.find((w) => w.kind === 'Components')?.id;
    if (whForProducts) {
      warehouseApi.stockProducts(token, whForProducts).then((p) =>
        setProducts(p.map((x) => ({ id: x.id, articleCode: x.articleCode, name: x.name })))
      ).catch(() => {});
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
      warehouseApi.stockProducts(token, whId).then((p) =>
        setProducts(p.map((x) => ({ id: x.id, articleCode: x.articleCode, name: x.name })))
      );
    }
    setReceiptOpen(true);
  };

  return (
    <div className="page">
      <div className="page-header">
        <h1>{t('nav.warehouse')}</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost-inline" onClick={() => setManageOpen(true)}>
            {t('warehouse.manageWarehouses')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setMovementsOpen(true)}>
            {t('warehouse.viewMovements')}
          </button>
          <button type="button" className="btn btn-primary" onClick={openReceipt}>
            {t('warehouse.receipt')}
          </button>
        </div>
      </div>

      <div className="documents-toolbar">
        <label className="warehouse-filter-label">
          {t('warehouse.filterBy')}
          <select
            value={filterWarehouseId}
            onChange={(e) => setFilterWarehouseId(e.target.value)}
          >
            <option value={ALL_WAREHOUSES}>{t('warehouse.allWarehouses')}</option>
            {warehouses.filter((w) => w.isActive).map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </label>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && !receiptOpen && !manageOpen && !movementsOpen && <div className="error-banner">{error}</div>}

      <h2>{t('warehouse.balances')}</h2>
      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {showWarehouseColumn && <th>{t('products.warehouseCol')}</th>}
              <th>{t('products.article')}</th>
              <th>{t('products.name')}</th>
              <th>{t('warehouse.qty')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b) => (
              <tr key={`${b.warehouseId}-${b.productId}`}>
                {showWarehouseColumn && <td>{b.warehouseName}</td>}
                <td><code>{b.articleCode}</code></td>
                <td>{b.productName}</td>
                <td>{formatStockQuantity(b.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {balances.length === 0 && <p className="muted empty-table">{t('warehouse.empty')}</p>}
      </div>

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
                    warehouseApi.stockProducts(token, whId).then((p) =>
                      setProducts(p.map((x) => ({ id: x.id, articleCode: x.articleCode, name: x.name })))
                    );
                  }
                }}
                required
              >
                <option value="">—</option>
                {warehouses.filter((w) => w.isActive).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
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
                  <option key={p.id} value={p.id}>{p.articleCode} — {p.name}</option>
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
              <button type="submit" className="btn btn-primary">{t('submit')}</button>
            </div>
          </form>
        </div>
      </AppModal>
    </div>
  );
}
