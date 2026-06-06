import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { catalogApi, type Product } from '../api/catalog';
import { inventoryApi } from '../api/inventory';
import { warehouseApi, type Warehouse } from '../api/warehouse';
import { useAuth } from '../context/AuthContext';
import { productTracksStock } from '../lib/productInventory';
import { normalizeStockQuantity } from '../lib/stockQuantity';

type Row = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCostIls: string;
};

function emptyRow(): Row {
  return { key: crypto.randomUUID(), productId: '', warehouseId: '', quantity: 1, unitCostIls: '' };
}

export function InventoryOpeningBalancePage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [asOfDate, setAsOfDate] = useState('2024-12-31');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      catalogApi.products.list(token, undefined, true),
      warehouseApi.list(token),
    ])
      .then(([p, w]) => {
        setProducts(p.filter((x) => productTracksStock(x)));
        setWarehouses(w.filter((x) => x.isActive));
      })
      .catch((e) => setError(e.message));
  }, [token]);

  const stockProducts = useMemo(
    () => products.filter((p) => p.isActive && productTracksStock(p)),
    [products]
  );

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setInfo('');
    const lines = rows
      .filter((r) => r.productId && r.warehouseId)
      .map((r) => ({
        productId: r.productId,
        warehouseId: r.warehouseId,
        quantity: normalizeStockQuantity(r.quantity),
        unitCostIls: Number(r.unitCostIls),
      }))
      .filter((l) => l.quantity > 0 && Number.isFinite(l.unitCostIls) && l.unitCostIls > 0);

    if (lines.length === 0) {
      setError(t('inventory.openingLinesRequired'));
      return;
    }

    setSaving(true);
    try {
      const res = await inventoryApi.postOpeningBalance(token, {
        asOfDate: `${asOfDate}T12:00:00Z`,
        lines,
        notes: notes.trim() || undefined,
      });
      setInfo(
        t('inventory.openingSuccess', {
          count: res.linesPosted,
          total: res.totalValueIls.toFixed(2),
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <Link to="/warehouse" className="muted page-back">
            {t('inventory.backToWarehouse')}
          </Link>
          <h1>{t('inventory.openingTitle')}</h1>
          <p className="muted">{t('inventory.openingHint')}</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {info && <div className="alert alert-success">{info}</div>}

      <form className="card inventory-opening-form" onSubmit={(e) => void onSubmit(e)}>
        <div className="inventory-opening-meta">
          <label>
            <span>{t('inventory.asOfDate')}</span>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} required />
          </label>
          <label className="inventory-opening-notes">
            <span>{t('purchaseReceipts.notes')}</span>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('purchaseReceipts.product')}</th>
                <th>{t('purchaseReceipts.warehouse')}</th>
                <th>{t('purchaseReceipts.quantity')}</th>
                <th>{t('inventory.unitCostIls')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <select
                      value={row.productId}
                      onChange={(e) => updateRow(row.key, { productId: e.target.value })}
                    >
                      <option value="">{t('purchaseReceipts.selectProduct')}</option>
                      {stockProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.articleCode} — {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.warehouseId}
                      onChange={(e) => updateRow(row.key, { warehouseId: e.target.value })}
                    >
                      <option value="">{t('purchaseReceipts.warehouseDefault')}</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={row.quantity}
                      onChange={(e) =>
                        updateRow(row.key, { quantity: normalizeStockQuantity(Number(e.target.value)) })
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={row.unitCostIls}
                      onChange={(e) => updateRow(row.key, { unitCostIls: e.target.value })}
                      placeholder="₪"
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost-inline btn-sm"
                      onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="inventory-opening-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setRows((p) => [...p, emptyRow()])}>
            {t('purchaseReceipts.addLine')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('settings.saving') : t('inventory.postOpening')}
          </button>
        </div>
      </form>
    </div>
  );
}
