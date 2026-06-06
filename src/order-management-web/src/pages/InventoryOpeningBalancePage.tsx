import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { catalogApi, type Product } from '../api/catalog';
import { inventoryApi } from '../api/inventory';
import { productGroupsApi, type ProductGroup } from '../api/productGroups';
import { warehouseApi, type Warehouse } from '../api/warehouse';
import {
  PurchaseReceiptProductPickerModal,
  type PickedReceiptProduct,
} from '../components/purchaseReceipts/PurchaseReceiptProductPickerModal';
import { useAuth } from '../context/AuthContext';
import {
  clearOpeningDraft,
  hasOpeningDraftContent,
  loadOpeningDraft,
  saveOpeningDraft,
} from '../lib/inventoryOpeningDraft';
import { productTypeCanTrackStock } from '../lib/productInventory';
import { normalizeStockQuantity } from '../lib/stockQuantity';
import { ProductCodeCell } from '../components/products/ProductCodeCell';
import '../styles/purchase-receipts.css';
import '../styles/inventory.css';

type Row = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitCostIls: string;
};

function rowFromPick(pick: PickedReceiptProduct): Row {
  return {
    key: crypto.randomUUID(),
    productId: pick.product.id,
    warehouseId: pick.product.warehouseId ?? '',
    quantity: normalizeStockQuantity(pick.quantity),
    unitCostIls: String(pick.unitPrice),
  };
}

function formatDraftTime(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function InventoryOpeningBalancePage() {
  const { t, i18n } = useTranslation();
  const { token, user } = useAuth();
  const tenantId = user?.tenantId ?? '';
  const [asOfDate, setAsOfDate] = useState('2024-12-31');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerReplaceKey, setPickerReplaceKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const draftReadyRef = useRef(false);

  useEffect(() => {
    if (!tenantId) return;
    const draft = loadOpeningDraft(tenantId);
    if (draft && hasOpeningDraftContent(draft)) {
      setAsOfDate(draft.asOfDate);
      setNotes(draft.notes);
      setRows(draft.rows);
      setDraftSavedAt(draft.savedAt);
      setInfo(
        t('inventory.draftRestored', {
          time: formatDraftTime(draft.savedAt, i18n.language),
          count: draft.rows.length,
        })
      );
    }
    draftReadyRef.current = true;
  }, [tenantId, i18n.language, t]);

  useEffect(() => {
    if (!tenantId || !draftReadyRef.current) return;
    const timer = window.setTimeout(() => {
      if (!hasOpeningDraftContent({ notes, rows })) {
        clearOpeningDraft(tenantId);
        setDraftSavedAt(null);
        return;
      }
      const savedAt = saveOpeningDraft(tenantId, { asOfDate, notes, rows });
      setDraftSavedAt(savedAt);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [tenantId, asOfDate, notes, rows]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      catalogApi.products.list(token, undefined, true),
      warehouseApi.list(token),
    ])
      .then(([p, w]) => {
        setProducts(p);
        setWarehouses(w.filter((x) => x.isActive));
      })
      .catch((e) => setError(e.message));

    productGroupsApi
      .list(token)
      .then(setProductGroups)
      .catch(() => setProductGroups([]));
  }, [token]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const mergeProductsIntoCatalog = useCallback((incoming: Product[]) => {
    setProducts((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const p of incoming) {
        byId.set(p.id, p);
      }
      return [...byId.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    });
  }, []);

  const updateRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const openPickerAdd = () => {
    setPickerReplaceKey(null);
    setPickerOpen(true);
  };

  const openPickerReplace = (lineKey: string) => {
    setPickerReplaceKey(lineKey);
    setPickerOpen(true);
  };

  const pickerReplaceProductId = pickerReplaceKey
    ? rows.find((l) => l.key === pickerReplaceKey)?.productId ?? null
    : null;

  const onPickerSave = (picks: PickedReceiptProduct[]) => {
    if (picks.length) {
      mergeProductsIntoCatalog(picks.map((x) => x.product));
    }

    if (pickerReplaceKey) {
      const pick = picks[0];
      if (pick) {
        updateRow(pickerReplaceKey, {
          productId: pick.product.id,
          quantity: normalizeStockQuantity(pick.quantity),
          unitCostIls: String(pick.unitPrice),
          warehouseId: pick.product.warehouseId ?? '',
        });
      }
      setPickerOpen(false);
      setPickerReplaceKey(null);
      return;
    }

    setRows((prev) => [...prev, ...picks.map(rowFromPick)]);
    setPickerOpen(false);
  };

  const onPickerProductCreated = (p: Product) => {
    mergeProductsIntoCatalog([p]);
  };

  const onClearDraft = () => {
    if (!tenantId) return;
    clearOpeningDraft(tenantId);
    setAsOfDate('2024-12-31');
    setNotes('');
    setRows([]);
    setDraftSavedAt(null);
    setInfo(t('inventory.draftCleared'));
    setError('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setInfo('');

    const filled = rows.filter((r) => r.productId);
    if (filled.length === 0) {
      setError(t('inventory.openingLinesRequired'));
      return;
    }

    for (const row of filled) {
      const product = productById.get(row.productId);
      if (product && productTypeCanTrackStock(product.productType) && !row.warehouseId) {
        setError(t('purchaseReceipts.warehouseRequired'));
        return;
      }
    }

    const lines = filled
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
      if (tenantId) clearOpeningDraft(tenantId);
      setDraftSavedAt(null);
      setRows([]);
      setNotes('');
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

  const showDraftStatus = draftSavedAt && hasOpeningDraftContent({ notes, rows });

  return (
    <div className="page inventory-page">
      <header className="inventory-page-header">
        <Link to="/warehouse" className="btn-link inventory-back-link">
          {t('inventory.backToWarehouse')}
        </Link>
        <h1>{t('inventory.openingTitle')}</h1>
        <p className="muted">{t('inventory.openingHint')}</p>
        <p className="muted inventory-draft-note">{t('inventory.openingHintDraft')}</p>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {info && <div className="success-banner">{info}</div>}

      <form className="card inventory-form" onSubmit={(e) => void onSubmit(e)}>
        <section className="pr-section">
          <div className="inventory-meta-grid">
            <label className="pr-field pr-field--date">
              <span>{t('inventory.asOfDate')}</span>
              <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} required />
            </label>
            <label className="pr-field pr-field--notes">
              <span>{t('purchaseReceipts.notes')}</span>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="pr-section">
          <div className="pr-section-head">
            <h2 className="pr-section-title">{t('purchaseReceipts.sectionLines')}</h2>
            <button type="button" className="btn btn-secondary btn-sm" onClick={openPickerAdd}>
              + {t('purchaseReceipts.addProduct')}
            </button>
          </div>

          {rows.length === 0 && (
            <p className="muted pr-lines-empty">{t('purchaseReceipts.linesEmpty')}</p>
          )}

          {rows.length > 0 && (
            <div className="pr-lines-wrap">
              <table className="pr-lines-table inv-opening-lines">
                <colgroup>
                  <col className="inv-col-product" />
                  <col className="inv-col-warehouse" />
                  <col className="inv-col-qty" />
                  <col className="inv-col-cost" />
                  <col className="inv-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="inv-col-product">{t('purchaseReceipts.product')}</th>
                    <th className="inv-col-warehouse">{t('purchaseReceipts.warehouse')}</th>
                    <th className="inv-col-qty">{t('purchaseReceipts.quantity')}</th>
                    <th className="inv-col-cost">{t('inventory.unitCostIls')}</th>
                    <th className="inv-col-actions" aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const lineProduct = row.productId ? productById.get(row.productId) : undefined;
                    const lineCanHaveStock = lineProduct
                      ? productTypeCanTrackStock(lineProduct.productType)
                      : false;

                    return (
                      <tr key={row.key}>
                        <td className="inv-col-product">
                          {lineProduct ? (
                            <div className="pr-line-product">
                              <span className="pr-line-product-text">
                                <ProductCodeCell
                                  articleCode={lineProduct.articleCode}
                                  legacySku={lineProduct.legacySku}
                                />
                                <span className="pr-line-product-name">{lineProduct.name}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="inv-col-warehouse">
                          <select
                            className="pr-warehouse-select"
                            value={row.warehouseId}
                            disabled={!lineCanHaveStock}
                            title={
                              !lineCanHaveStock
                                ? t('purchaseReceipts.warehouseNotApplicable')
                                : row.warehouseId
                                  ? warehouses.find((w) => w.id === row.warehouseId)?.name
                                  : t('purchaseReceipts.warehouseDefault')
                            }
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
                        <td className="inv-col-qty">
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
                        <td className="inv-col-cost">
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={row.unitCostIls}
                            onChange={(e) => updateRow(row.key, { unitCostIls: e.target.value })}
                            placeholder="₪"
                          />
                        </td>
                        <td className="inv-col-actions">
                          <div className="pr-line-row-actions">
                            <button
                              type="button"
                              className="pr-line-edit"
                              title={t('purchaseReceipts.editProduct')}
                              aria-label={t('purchaseReceipts.editProduct')}
                              onClick={() => openPickerReplace(row.key)}
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              className="pr-line-remove"
                              title={t('purchaseReceipts.removeLine')}
                              aria-label={t('purchaseReceipts.removeLine')}
                              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {showDraftStatus && (
          <p className="inventory-draft-status">
            {t('inventory.draftAutoSaved', {
              time: formatDraftTime(draftSavedAt, i18n.language),
            })}
          </p>
        )}

        <div className="purchase-receipt-actions inventory-draft-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('settings.saving') : t('inventory.postOpening')}
          </button>
          {showDraftStatus && (
            <button type="button" className="btn btn-ghost-inline" onClick={onClearDraft}>
              {t('inventory.draftClear')}
            </button>
          )}
        </div>
      </form>

      <PurchaseReceiptProductPickerModal
        open={pickerOpen}
        token={token ?? ''}
        products={products}
        groups={productGroups}
        replaceMode={pickerReplaceKey !== null}
        initialSelectedProductId={pickerReplaceProductId}
        onClose={() => {
          setPickerOpen(false);
          setPickerReplaceKey(null);
        }}
        onSave={onPickerSave}
        onProductCreated={onPickerProductCreated}
      />
    </div>
  );
}
