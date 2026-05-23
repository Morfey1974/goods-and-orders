import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { warehouseApi, type StockBalance, type StockMovement, type Warehouse } from '../api/warehouse';
import { AppModal } from '../components/ui/AppModal';
import { WarehouseManageModal } from '../components/WarehouseManageModal';
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
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [products, setProducts] = useState<{ id: string; articleCode: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
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

  const load = useCallback(() => {
    if (!token) return;
    warehouseApi.balances(token, selectedWarehouseId).then(setBalances).catch((e) => setError(e.message));
    warehouseApi.movements(token, 50, selectedWarehouseId).then(setMovements).catch(() => {});
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

  const showWarehouseColumn = filterWarehouseId === ALL_WAREHOUSES;

  const visibleBalances = useMemo(
    () => balances.filter((b) => b.quantity !== 0 || !showWarehouseColumn),
    [balances, showWarehouseColumn]
  );

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
      {error && !receiptOpen && !manageOpen && <div className="error-banner">{error}</div>}

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
            {visibleBalances.map((b) => (
              <tr key={`${b.warehouseId}-${b.productId}`}>
                {showWarehouseColumn && <td>{b.warehouseName}</td>}
                <td><code>{b.articleCode}</code></td>
                <td>{b.productName}</td>
                <td>{formatStockQuantity(b.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleBalances.length === 0 && <p className="muted empty-table">{t('warehouse.empty')}</p>}
      </div>

      <h2>{t('warehouse.movements')}</h2>
      <div className="card table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('products.article')}</th>
              <th>{t('warehouse.type')}</th>
              <th>{t('warehouse.qty')}</th>
              <th>{t('warehouse.after')}</th>
              <th>{t('warehouse.date')}</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td><code>{m.articleCode}</code></td>
                <td>{t(`warehouse.moveTypes.${m.movementType}`)}</td>
                <td>{formatStockQuantity(m.quantity)}</td>
                <td>{m.balanceAfter}</td>
                <td>{new Date(m.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
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

      <AppModal open={receiptOpen} onClose={() => setReceiptOpen(false)} size="md">
            <h2>{t('warehouse.receipt')}</h2>
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
      </AppModal>
    </div>
  );
}
