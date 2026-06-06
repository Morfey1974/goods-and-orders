import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type WheelEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { catalogApi, type Product } from '../api/catalog';
import { productGroupsApi, type ProductGroup } from '../api/productGroups';
import {
  purchaseReceiptsApi,
  type PurchaseReceipt,
  type PurchaseReceiptLineInput,
} from '../api/purchaseReceipts';
import { suppliersApi, type Supplier } from '../api/suppliers';
import { warehouseApi, type Warehouse } from '../api/warehouse';
import {
  PurchaseReceiptProductPickerModal,
  type PickedReceiptProduct,
} from '../components/purchaseReceipts/PurchaseReceiptProductPickerModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { UnsavedLeaveDialog } from '../components/UnsavedLeaveDialog';
import { useAuth } from '../context/AuthContext';
import { useUnsavedLeaveBlocker } from '../hooks/useUnsavedLeaveBlocker';
import { productTracksStock } from '../lib/productInventory';
import { normalizeStockQuantity } from '../lib/stockQuantity';
import '../styles/purchase-receipts.css';

type LineRow = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  unitPrice: string;
  unitCostIls: string;
};

function isIlsCurrency(currency: string) {
  const c = currency.trim().toUpperCase();
  return c === 'ILS' || c === 'NIS' || c === '₪';
}

function emptyLine(product?: Product): LineRow {
  return {
    key: crypto.randomUUID(),
    productId: product?.id ?? '',
    warehouseId: '',
    quantity: 1,
    unitPrice: product ? String(product.unitPrice) : '',
    unitCostIls: '',
  };
}

function linesToRows(receipt: PurchaseReceipt): LineRow[] {
  return receipt.lines.map((l) => ({
    key: l.id,
    productId: l.productId,
    warehouseId: l.warehouseId ?? '',
    quantity: l.quantity,
    unitPrice: l.unitPrice != null ? String(l.unitPrice) : '',
    unitCostIls: l.unitCostIls != null ? String(l.unitCostIls) : '',
  }));
}

function lineTotal(row: LineRow): number {
  const price = row.unitPrice.trim() ? Number(row.unitPrice) : 0;
  const qty = normalizeStockQuantity(row.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return Math.round(price * qty * 100) / 100;
}

function rowsToPayload(rows: LineRow[], currency: string): PurchaseReceiptLineInput[] {
  const ils = isIlsCurrency(currency);
  return rows
    .filter((r) => r.productId)
    .map((r) => {
      const unitPrice = r.unitPrice.trim() ? Number(r.unitPrice) : undefined;
      const unitCostIls = ils
        ? unitPrice
        : r.unitCostIls.trim()
          ? Number(r.unitCostIls)
          : undefined;
      return {
        productId: r.productId,
        warehouseId: r.warehouseId || undefined,
        quantity: normalizeStockQuantity(r.quantity),
        unitPrice,
        unitCostIls,
      };
    });
}

function isValidUnitPrice(unitPrice: string): boolean {
  const trimmed = unitPrice.trim();
  if (!trimmed) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0;
}

type ReceiptFormValidation = {
  canSave: boolean;
  errorKey?: string;
};

function validateReceiptForm(
  supplierId: string,
  currency: string,
  lines: LineRow[],
  productById: Map<string, Product>
): ReceiptFormValidation {
  if (!supplierId) {
    return { canSave: false, errorKey: 'purchaseReceipts.supplierRequired' };
  }

  const filled = lines.filter((l) => l.productId);
  if (filled.length === 0) {
    return { canSave: false, errorKey: 'purchaseReceipts.linesRequired' };
  }

  const ils = isIlsCurrency(currency);

  for (const line of filled) {
    const product = productById.get(line.productId);
    if (product && productTracksStock(product) && !line.warehouseId) {
      return { canSave: false, errorKey: 'purchaseReceipts.warehouseRequired' };
    }
    if (!isValidUnitPrice(line.unitPrice)) {
      return { canSave: false, errorKey: 'purchaseReceipts.unitPriceRequired' };
    }
    if (!ils && !isValidUnitPrice(line.unitCostIls)) {
      return { canSave: false, errorKey: 'purchaseReceipts.unitCostIlsRequired' };
    }
  }

  return { canSave: true };
}

/** Compare lines by business fields only (row keys differ between UI and API). */
function linesForCompare(rows: LineRow[]) {
  return rows
    .filter((r) => r.productId)
    .map((r) => ({
      productId: r.productId,
      warehouseId: r.warehouseId,
      quantity: normalizeStockQuantity(r.quantity),
      unitPrice: r.unitPrice.trim(),
      unitCostIls: r.unitCostIls.trim(),
    }));
}

function isImageFile(name: string, mime?: string) {
  if (mime?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}

function formatMoney(n: number, currency: string) {
  return `${n.toFixed(2)} ${currency}`;
}

const DOC_ZOOM_MIN = 50;
const DOC_ZOOM_MAX = 200;
const DOC_ZOOM_STEP = 10;
const DOC_PAGE_ASPECT = 1.414;

export function PurchaseReceiptDetailPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const fileRef = useRef<HTMLInputElement>(null);
  const docViewportRef = useRef<HTMLDivElement>(null);
  const [docBaseWidth, setDocBaseWidth] = useState(560);

  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerReplaceKey, setPickerReplaceKey] = useState<string | null>(null);
  const [lineToRemove, setLineToRemove] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState('');
  const [documentDate, setDocumentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('ILS');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docZoom, setDocZoom] = useState(100);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [baseline, setBaseline] = useState('');

  const isPosted = receipt?.status === 'Posted';
  const isDraft = !receipt || receipt.status === 'Draft';
  const canEditDoc = isDraft && !isPosted;

  const previewUrl = docPreviewUrl ?? localPreviewUrl;
  const previewName = receipt?.documentFileName ?? pendingFile?.name ?? '';
  const previewIsImage = previewUrl
    ? isImageFile(previewName, pendingFile?.type)
    : false;
  const hasPreview = Boolean(previewUrl);

  const filledLines = useMemo(() => lines.filter((l) => l.productId), [lines]);
  const positionsCount = filledLines.length;
  const linesGrandTotal = useMemo(
    () => filledLines.reduce((sum, l) => sum + lineTotal(l), 0),
    [filledLines]
  );

  const serializeForm = useCallback(
    () =>
      JSON.stringify({
        supplierId,
        supplierInvoiceNumber,
        documentDate,
        currency,
        notes,
        lines: linesForCompare(lines),
        hasPendingFile: Boolean(pendingFile),
      }),
    [supplierId, supplierInvoiceNumber, documentDate, currency, notes, lines, pendingFile]
  );

  const isDirty = isDraft && serializeForm() !== baseline;
  const needsIlsCost = !isIlsCurrency(currency);

  const clearLocalPreview = useCallback(() => {
    setLocalPreviewUrl((u) => {
      if (u) URL.revokeObjectURL(u);
      return null;
    });
    setPendingFile(null);
  }, []);

  const loadReceipt = useCallback(async () => {
    if (!token || isNew || !id || id === 'new') return;
    const r = await purchaseReceiptsApi.get(token, id);
    setReceipt(r);
    setSupplierId(r.supplierId);
    setSupplierInvoiceNumber(r.supplierInvoiceNumber ?? '');
    setDocumentDate(r.documentDate);
    setCurrency(r.currency);
    setNotes(r.notes ?? '');
    setLines(linesToRows(r));
  }, [token, id, isNew]);

  useEffect(() => {
    if (!token) return;
    setError('');
    Promise.all([
      suppliersApi.list(token),
      warehouseApi.list(token),
      catalogApi.products.list(token, undefined, true),
    ])
      .then(([s, w, p]) => {
        setSuppliers(s.filter((x) => x.isActive));
        setWarehouses(w.filter((x) => x.isActive));
        setProducts(p);
      })
      .catch((e) => setError(e.message));

    productGroupsApi
      .list(token)
      .then(setProductGroups)
      .catch(() => setProductGroups([]));
  }, [token]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const formValidation = useMemo(
    () => validateReceiptForm(supplierId, currency, lines, productById),
    [supplierId, currency, lines, productById]
  );

  useEffect(() => {
    loadReceipt().catch((e) => setError(e.message));
  }, [loadReceipt]);

  useEffect(() => {
    if (!token || !receipt?.hasDocument) {
      setDocPreviewUrl(null);
      return;
    }
    let url: string | null = null;
    purchaseReceiptsApi
      .documentBlobUrl(token, receipt.id)
      .then((u) => {
        url = u;
        setDocPreviewUrl(u);
      })
      .catch(() => setDocPreviewUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [token, receipt?.id, receipt?.hasDocument]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!isNew || supplierId) return;
    const fromUrl = searchParams.get('supplierId');
    if (fromUrl && suppliers.some((s) => s.id === fromUrl)) {
      setSupplierId(fromUrl);
    }
  }, [isNew, supplierId, searchParams, suppliers]);

  useEffect(() => {
    if (!supplierId || isPosted) return;
    const s = suppliers.find((x) => x.id === supplierId);
    if (s?.defaultCurrency) setCurrency(s.defaultCurrency);
  }, [supplierId, suppliers, isPosted]);

  useEffect(() => {
    if (isNew && baseline === '') {
      setBaseline(serializeForm());
    }
  }, [isNew, baseline, serializeForm]);

  useEffect(() => {
    if (!isNew && receipt && baseline === '') {
      setBaseline(serializeForm());
    }
  }, [isNew, receipt, baseline, serializeForm]);

  const buildPayload = () => ({
    supplierId,
    supplierInvoiceNumber: supplierInvoiceNumber.trim() || null,
    documentDate,
    currency,
    totalAmount: positionsCount > 0 ? linesGrandTotal : null,
    notes: notes.trim() || null,
    version: receipt?.version,
    lines: rowsToPayload(lines, currency),
  });

  const performSave = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    if (!formValidation.canSave) {
      setError(t(formValidation.errorKey ?? 'purchaseReceipts.saveDisabledHint'));
      return false;
    }
    setSaving(true);
    setError('');
    try {
      let saved: PurchaseReceipt;
      if (isNew) {
        saved = await purchaseReceiptsApi.create(token, buildPayload());
        if (pendingFile) {
          saved = await purchaseReceiptsApi.uploadDocument(token, saved.id, pendingFile);
          clearLocalPreview();
        }
      } else {
        saved = await purchaseReceiptsApi.update(token, id!, buildPayload());
      }

      await purchaseReceiptsApi.post(token, saved.id, saved.version);

      flushSync(() => setBaseline(serializeForm()));
      navigate('/purchase-receipts');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setSaving(false);
      return false;
    }
  }, [
    token,
    formValidation,
    isNew,
    pendingFile,
    id,
    navigate,
    clearLocalPreview,
    serializeForm,
    t,
    buildPayload,
  ]);

  const {
    leaveOpen,
    leaveBusy,
    closeLeaveDialog,
    handleLeaveSave,
    handleLeaveDiscard,
  } = useUnsavedLeaveBlocker({
    when: isDirty && isDraft && !saving,
    onSave: performSave,
    saveReplacesNavigation: true,
  });

  const onSave = async (e?: FormEvent) => {
    e?.preventDefault();
    await performSave();
  };

  const onDelete = async () => {
    if (!token || !receipt) return;
    if (!window.confirm(t('purchaseReceipts.deleteConfirm'))) return;
    try {
      await purchaseReceiptsApi.delete(token, receipt.id);
      navigate('/purchase-receipts');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onPickDocument = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;

    if (receipt && isDraft) {
      setUploading(true);
      setError('');
      try {
        clearLocalPreview();
        const updated = await purchaseReceiptsApi.uploadDocument(token, receipt.id, file);
        setReceipt(updated);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setUploading(false);
      }
      return;
    }

    setLocalPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setPendingFile(file);
  };

  const onRemoveDocument = async () => {
    if (pendingFile || localPreviewUrl) {
      clearLocalPreview();
      return;
    }
    if (!token || !receipt) return;
    setUploading(true);
    try {
      const updated = await purchaseReceiptsApi.deleteDocument(token, receipt.id);
      setReceipt(updated);
      if (docPreviewUrl) URL.revokeObjectURL(docPreviewUrl);
      setDocPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setUploading(false);
    }
  };

  const updateLine = (key: string, patch: Partial<LineRow>) =>
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const openPickerAdd = () => {
    setPickerReplaceKey(null);
    setPickerOpen(true);
  };

  const openPickerReplace = (lineKey: string) => {
    setPickerReplaceKey(lineKey);
    setPickerOpen(true);
  };

  const pickerReplaceProductId = pickerReplaceKey
    ? lines.find((l) => l.key === pickerReplaceKey)?.productId ?? null
    : null;

  const mergeProductsIntoCatalog = (incoming: Product[]) => {
    setProducts((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      for (const p of incoming) {
        byId.set(p.id, p);
      }
      return [...byId.values()].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );
    });
  };

  const onPickerSave = (picks: PickedReceiptProduct[]) => {
    if (picks.length) {
      mergeProductsIntoCatalog(picks.map((x) => x.product));
    }

    if (pickerReplaceKey) {
      const pick = picks[0];
      if (pick) {
        updateLine(pickerReplaceKey, {
          productId: pick.product.id,
          unitPrice: String(pick.unitPrice),
          quantity: normalizeStockQuantity(pick.quantity),
          warehouseId: '',
        });
      }
      setPickerOpen(false);
      setPickerReplaceKey(null);
      return;
    }
    setLines((rows) => [
      ...rows,
      ...picks.map((pick) => ({
        ...emptyLine(pick.product),
        quantity: normalizeStockQuantity(pick.quantity),
        unitPrice: String(pick.unitPrice),
      })),
    ]);
    setPickerOpen(false);
  };

  const onPickerProductCreated = (p: Product) => {
    mergeProductsIntoCatalog([p]);
  };

  const removeLine = (key: string) =>
    setLines((rows) => rows.filter((r) => r.key !== key));

  const lineToRemoveProduct = lineToRemove
    ? productById.get(lines.find((l) => l.key === lineToRemove)?.productId ?? '')
    : undefined;

  const docScale = docZoom / 100;

  const measureDocWidth = useCallback(() => {
    const el = docViewportRef.current;
    if (!el) return;
    const w = Math.max(280, el.clientWidth - 24);
    setDocBaseWidth((prev) => (Math.abs(prev - w) < 4 ? prev : w));
  }, []);

  useEffect(() => {
    if (!hasPreview) return;
    setDocZoom(100);
  }, [previewUrl, hasPreview]);

  useLayoutEffect(() => {
    if (!hasPreview) return;
    measureDocWidth();
    window.addEventListener('resize', measureDocWidth);
    return () => window.removeEventListener('resize', measureDocWidth);
  }, [hasPreview, previewUrl, measureDocWidth]);

  const docContentWidth = Math.round(docBaseWidth * docScale);
  const docContentHeight = Math.round(docBaseWidth * DOC_PAGE_ASPECT * docScale);

  const applyDocZoomDelta = useCallback((delta: number) => {
    setDocZoom((z) => Math.min(DOC_ZOOM_MAX, Math.max(DOC_ZOOM_MIN, z + delta)));
  }, []);

  const zoomIn = () => applyDocZoomDelta(DOC_ZOOM_STEP);
  const zoomOut = () => applyDocZoomDelta(-DOC_ZOOM_STEP);
  const zoomReset = () => setDocZoom(100);

  const onDocWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!hasPreview) return;
    e.preventDefault();
    applyDocZoomDelta(e.deltaY < 0 ? DOC_ZOOM_STEP : -DOC_ZOOM_STEP);
  };

  return (
    <div className="page purchase-receipt-detail-page">
      <header className="purchase-receipt-detail-header">
        <Link to="/purchase-receipts" className="btn-link pr-back-link">
          ← {t('purchaseReceipts.back')}
        </Link>
        <h1>
          {isNew
            ? t('purchaseReceipts.newTitle')
            : t('purchaseReceipts.editTitle', { number: receipt?.receiptNumber ?? '' })}
        </h1>
        {receipt && (
          <span className={`pr-status pr-status--${receipt.status.toLowerCase()}`}>
            {receipt.status === 'Posted'
              ? t('purchaseReceipts.statusPosted')
              : t('purchaseReceipts.statusDraft')}
          </span>
        )}
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="purchase-receipt-workspace">
        <form className="purchase-receipt-main card" onSubmit={onSave}>
          <section className="pr-section">
            <h2 className="pr-section-title">{t('purchaseReceipts.sectionHeader')}</h2>
            <p className="muted pr-section-hint">{t('purchaseReceipts.distributeHint')}</p>
            <div className="pr-header-grid">
              <label className="pr-field pr-field--supplier">
                <span>{t('purchaseReceipts.supplier')} *</span>
                <select
                  value={supplierId}
                  disabled={isPosted}
                  required
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">{t('purchaseReceipts.selectSupplier')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="pr-field">
                <span>{t('purchaseReceipts.supplierInvoiceNumber')}</span>
                <input
                  value={supplierInvoiceNumber}
                  disabled={isPosted}
                  onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                />
              </label>
              <label className="pr-field pr-field--date">
                <span>{t('purchaseReceipts.documentDate')}</span>
                <input
                  type="date"
                  value={documentDate}
                  disabled={isPosted}
                  required
                  onChange={(e) => setDocumentDate(e.target.value)}
                />
              </label>
              <label className="pr-field pr-field--currency">
                <span>{t('purchaseReceipts.currency')}</span>
                <input
                  value={currency}
                  maxLength={3}
                  disabled={isPosted}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </label>
            </div>
          </section>

          <section className="pr-section">
            <div className="pr-section-head">
              <h2 className="pr-section-title">{t('purchaseReceipts.sectionLines')}</h2>
              {isDraft && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={openPickerAdd}>
                  + {t('purchaseReceipts.addProduct')}
                </button>
              )}
            </div>
            {lines.length === 0 && (
              <p className="muted pr-lines-empty">{t('purchaseReceipts.linesEmpty')}</p>
            )}
            {lines.length > 0 && (
              <div className="pr-lines-wrap">
                <table
                  className={`pr-lines-table${isDraft ? ' pr-lines-table--with-actions' : ''}`}
                >
                  <colgroup>
                    <col className="pr-col-product" />
                    <col className="pr-col-warehouse" />
                    <col className="pr-col-qty" />
                    <col className="pr-col-price" />
                    {needsIlsCost && <col className="pr-col-price" />}
                    <col className="pr-col-line-total" />
                    {isDraft && <col className="pr-col-actions" />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="pr-col-product">{t('purchaseReceipts.product')}</th>
                      <th className="pr-col-warehouse">{t('purchaseReceipts.warehouse')}</th>
                      <th className="pr-col-qty">{t('purchaseReceipts.quantity')}</th>
                      <th className="pr-col-price">{t('purchaseReceipts.unitPrice')}</th>
                      {needsIlsCost && (
                        <th className="pr-col-price">{t('inventory.unitCostIls')}</th>
                      )}
                      <th className="pr-col-line-total">{t('purchaseReceipts.lineSum')}</th>
                      {isDraft && <th className="pr-col-actions" aria-hidden />}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const lineProduct = line.productId ? productById.get(line.productId) : undefined;
                      const lineTracksStock = lineProduct ? productTracksStock(lineProduct) : false;
                      return (
                      <tr key={line.key}>
                        <td className="pr-col-product">
                          {lineProduct ? (
                            <div className="pr-line-product">
                              <span className="pr-line-product-text">
                                <code>{lineProduct.articleCode}</code>
                                <span className="pr-line-product-name">{lineProduct.name}</span>
                              </span>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="pr-col-warehouse">
                          <select
                            className="pr-warehouse-select"
                            value={line.warehouseId}
                            disabled={isPosted || !lineTracksStock}
                            title={
                              !lineTracksStock
                                ? t('purchaseReceipts.warehouseNotApplicable')
                                : line.warehouseId
                                  ? warehouses.find((w) => w.id === line.warehouseId)?.name
                                  : t('purchaseReceipts.warehouseDefault')
                            }
                            onChange={(e) => updateLine(line.key, { warehouseId: e.target.value })}
                          >
                            <option value="">{t('purchaseReceipts.warehouseDefault')}</option>
                            {warehouses.map((w) => (
                              <option key={w.id} value={w.id}>{w.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="pr-col-qty">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            disabled={isPosted}
                            value={line.quantity}
                            onChange={(e) =>
                              updateLine(line.key, {
                                quantity: normalizeStockQuantity(Number(e.target.value)),
                              })
                            }
                          />
                        </td>
                        <td className="pr-col-price">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isPosted}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                          />
                        </td>
                        {needsIlsCost && (
                          <td className="pr-col-price">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={isPosted}
                              value={line.unitCostIls}
                              title={t('purchaseReceipts.unitCostIlsHint')}
                              onChange={(e) => updateLine(line.key, { unitCostIls: e.target.value })}
                            />
                          </td>
                        )}
                        <td className="pr-col-line-total pr-line-total-cell">
                          {line.productId
                            ? formatMoney(lineTotal(line), currency)
                            : '—'}
                        </td>
                        {isDraft && (
                          <td className="pr-col-actions">
                            <div className="pr-line-row-actions">
                              <button
                                type="button"
                                className="pr-line-edit"
                                title={t('purchaseReceipts.editProduct')}
                                aria-label={t('purchaseReceipts.editProduct')}
                                onClick={() => openPickerReplace(line.key)}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="pr-line-remove"
                                title={t('purchaseReceipts.removeLine')}
                                aria-label={t('purchaseReceipts.removeLine')}
                                onClick={() => setLineToRemove(line.key)}
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="pr-lines-summary">
                      <td colSpan={needsIlsCost ? 5 : 4}>
                        {t('purchaseReceipts.positionsCount', { count: positionsCount })}
                      </td>
                      <td className="pr-line-total-cell pr-lines-grand-total">
                        <span className="pr-grand-total-inline">
                          <span className="pr-grand-total-label">
                            {t('purchaseReceipts.lineTotal')}
                          </span>
                          <span className="pr-grand-total-value">
                            {positionsCount > 0 ? formatMoney(linesGrandTotal, currency) : '—'}
                          </span>
                        </span>
                      </td>
                      {isDraft && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <label className="pr-field pr-field--notes">
            <span>{t('purchaseReceipts.notes')}</span>
            <textarea
              rows={2}
              disabled={isPosted}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>

          <div className="purchase-receipt-actions">
            {isDraft && (
              <>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving || uploading || !formValidation.canSave}
                  title={
                    !formValidation.canSave ? t('purchaseReceipts.saveDisabledHint') : undefined
                  }
                >
                  {saving ? t('settings.saving') : t('purchaseReceipts.saveDocument')}
                </button>
                {!isNew && receipt && (
                  <button
                    type="button"
                    className="btn btn-ghost-inline"
                    disabled={saving || uploading}
                    onClick={() => void onDelete()}
                  >
                    {t('purchaseReceipts.delete')}
                  </button>
                )}
              </>
            )}
            <Link to="/purchase-receipts" className="btn btn-ghost-inline">
              {t('settings.cancel')}
            </Link>
          </div>
        </form>

        <aside className="purchase-receipt-doc card">
          <div className="pr-doc-head">
            <h2 className="pr-section-title">{t('purchaseReceipts.sectionDocument')}</h2>
            {canEditDoc && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="sr-only"
                  onChange={onPickDocument}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={uploading || saving}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? t('purchaseReceipts.uploading') : t('purchaseReceipts.addDocument')}
                </button>
              </>
            )}
          </div>

          {hasPreview && (
            <div className="pr-doc-zoom-toolbar">
              <button type="button" className="btn btn-ghost-inline btn-sm" onClick={zoomOut} aria-label="-">
                −
              </button>
              <span className="pr-doc-zoom-label">{docZoom}%</span>
              <button type="button" className="btn btn-ghost-inline btn-sm" onClick={zoomIn} aria-label="+">
                +
              </button>
              <button type="button" className="btn btn-ghost-inline btn-sm" onClick={zoomReset}>
                {t('purchaseReceipts.zoomReset')}
              </button>
              <span className="pr-doc-zoom-hint muted">{t('purchaseReceipts.zoomWheelHint')}</span>
            </div>
          )}

          {pendingFile && isNew && (
            <p className="pr-doc-pending-hint muted">{t('purchaseReceipts.documentPendingSave')}</p>
          )}

          {previewName && (
            <p className="pr-doc-filename" title={previewName}>
              {previewName}
            </p>
          )}

          <div
            ref={docViewportRef}
            className={`pr-doc-viewport ${hasPreview ? 'pr-doc-viewport--filled' : ''}`}
            onWheel={onDocWheel}
          >
            {!hasPreview && (
              <div className="pr-doc-empty">
                <span className="pr-doc-empty-icon" aria-hidden>📄</span>
                <p>{t('purchaseReceipts.documentEmpty')}</p>
                <p className="muted">{t('purchaseReceipts.documentHint')}</p>
              </div>
            )}
            {hasPreview && previewUrl && (
              <div className="pr-doc-preview-center">
                {previewIsImage ? (
                  <img
                    src={previewUrl}
                    alt={previewName}
                    className="pr-doc-image"
                    style={{ width: docContentWidth, maxWidth: 'none' }}
                  />
                ) : (
                  <iframe
                    key={previewUrl}
                    title={previewName || t('purchaseReceipts.documentPreview')}
                    src={previewUrl}
                    className="pr-doc-iframe"
                    style={{
                      width: docContentWidth,
                      height: docContentHeight,
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {hasPreview && canEditDoc && (
            <button
              type="button"
              className="btn btn-ghost-inline pr-doc-remove"
              disabled={uploading}
              onClick={() => void onRemoveDocument()}
            >
              {t('purchaseReceipts.removeDocument')}
            </button>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={lineToRemove !== null}
        title={t('purchaseReceipts.removeLineConfirmTitle')}
        message={t('purchaseReceipts.removeLineConfirm', {
          name: lineToRemoveProduct
            ? `${lineToRemoveProduct.articleCode} — ${lineToRemoveProduct.name}`
            : '',
        })}
        confirmLabel={t('purchaseReceipts.removeLine')}
        cancelLabel={t('settings.cancel')}
        danger
        onConfirm={() => {
          if (lineToRemove) removeLine(lineToRemove);
          setLineToRemove(null);
        }}
        onCancel={() => setLineToRemove(null)}
      />

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

      <UnsavedLeaveDialog
        open={leaveOpen}
        title={t('purchaseReceipts.unsavedTitle')}
        message={t('purchaseReceipts.unsavedMessage')}
        saveLabel={t('purchaseReceipts.unsavedSave')}
        discardLabel={t('purchaseReceipts.unsavedDiscard')}
        cancelLabel={t('settings.cancel')}
        busy={leaveBusy || saving}
        saveDisabled={!formValidation.canSave}
        onSave={() => void handleLeaveSave()}
        onDiscard={handleLeaveDiscard}
        onCancel={closeLeaveDialog}
      />
    </div>
  );
}
