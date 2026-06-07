import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
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
  type PurchaseReceiptDocument,
  type PurchaseReceiptLineInput,
  type PurchaseReceiptLandedCostLineInput,
} from '../api/purchaseReceipts';
import { exchangeRatesApi, type UsdIlsRate } from '../api/exchangeRates';
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
import { useResizableTableColumns } from '../hooks/useResizableTableColumns';
import {
  PURCHASE_RECEIPT_LINE_DEFAULT_WIDTHS,
  PURCHASE_RECEIPT_LINES_COLUMN_WIDTHS_KEY,
  type PurchaseReceiptLineColumnKey,
  PURCHASE_RECEIPT_LINE_COLUMN_CLASS,
  purchaseReceiptCurrencyMode,
  type PurchaseReceiptCurrencyMode,
  visiblePurchaseReceiptLineColumns,
} from '../lib/purchaseReceiptLinesColumns';
import { productTracksStock } from '../lib/productInventory';
import {
  normalizeStockQuantity,
  sanitizeQuantityDraft,
} from '../lib/stockQuantity';
import '../styles/purchase-receipts.css';

type LineRow = {
  key: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  lineTotalUsd: string;
  lineTotalIlsInput: string;
  unitCostIls: string;
  unitCostManual: boolean;
};

const LANDED_COST_CATEGORIES = ['Logistics', 'Customs', 'Tax', 'Other'] as const;
type LandedCostCategory = (typeof LANDED_COST_CATEGORIES)[number];

type LandedCostRow = {
  key: string;
  supplierId: string;
  category: LandedCostCategory;
  currency: 'USD' | 'ILS';
  amount: string;
  notes: string;
};

function emptyLandedCostRow(): LandedCostRow {
  return {
    key: crypto.randomUUID(),
    supplierId: '',
    category: 'Logistics',
    currency: 'ILS',
    amount: '',
    notes: '',
  };
}

function landedCostsToRows(receipt: PurchaseReceipt): LandedCostRow[] {
  if (!receipt.landedCostLines.length) return [];
  return receipt.landedCostLines.map((l) => ({
    key: l.id,
    supplierId: l.supplierId,
    category: (LANDED_COST_CATEGORIES.includes(l.category as LandedCostCategory)
      ? l.category
      : 'Other') as LandedCostCategory,
    currency: isUsdCurrency(l.currency) ? 'USD' : 'ILS',
    amount: String(l.amount),
    notes: l.notes ?? '',
  }));
}

function landedCostAmountIls(row: LandedCostRow, usdRate: number | null): number {
  const amount = parsePositiveNumber(row.amount);
  if (amount === null) return 0;
  if (row.currency === 'ILS') return roundMoney(amount);
  if (usdRate !== null && usdRate > 0) return roundMoney(amount * usdRate);
  return 0;
}

function rowsToLandedCostPayload(rows: LandedCostRow[]): PurchaseReceiptLandedCostLineInput[] {
  return rows
    .filter((r) => r.supplierId && parsePositiveNumber(r.amount) !== null)
    .map((r) => ({
      supplierId: r.supplierId,
      category: r.category,
      currency: r.currency,
      amount: parsePositiveNumber(r.amount)!,
      notes: r.notes.trim() || undefined,
    }));
}

function landedCostsForCompare(rows: LandedCostRow[]) {
  return rows.map((r) => ({
    supplierId: r.supplierId,
    category: r.category,
    currency: r.currency,
    amount: r.amount.trim(),
    notes: r.notes.trim(),
  }));
}

function isIlsCurrency(currency: string) {
  const c = currency.trim().toUpperCase();
  return c === 'ILS' || c === 'NIS' || c === '₪';
}

function isUsdCurrency(currency: string) {
  return currency.trim().toUpperCase() === 'USD';
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function parsePositiveNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function lineTotalUsdValue(row: LineRow): number {
  const direct = parsePositiveNumber(row.lineTotalUsd);
  return direct ?? 0;
}

function lineTotalIlsValue(
  row: LineRow,
  rate: number | null,
  currencyMode: PurchaseReceiptCurrencyMode
): number {
  const qty = normalizeStockQuantity(row.quantity);
  if (qty <= 0) return 0;
  if (currencyMode === 'ILS') {
    const direct = parsePositiveNumber(row.lineTotalIlsInput);
    if (direct !== null) return direct;
    const unitCost = lineUnitCostIlsValue(row, null, currencyMode);
    if (unitCost > 0) return roundMoney(unitCost * qty);
    return 0;
  }
  const unitCost = lineUnitCostIlsValue(row, rate, currencyMode);
  if (unitCost > 0) return roundMoney(unitCost * qty);
  if (rate !== null && rate > 0) return roundMoney(lineTotalUsdValue(row) * rate);
  return 0;
}

function lineUnitCostIlsValue(
  row: LineRow,
  rate: number | null,
  currencyMode: PurchaseReceiptCurrencyMode
): number {
  const qty = normalizeStockQuantity(row.quantity);
  if (qty <= 0) return 0;
  if (row.unitCostManual) {
    const unit = parsePositiveNumber(row.unitCostIls);
    if (unit !== null) return unit;
  }
  if (currencyMode === 'ILS') {
    const totalIls = parsePositiveNumber(row.lineTotalIlsInput);
    if (totalIls !== null && totalIls > 0) return roundMoney(totalIls / qty);
    const unit = parsePositiveNumber(row.unitCostIls);
    return unit ?? 0;
  }
  if (rate !== null && rate > 0) {
    const totalUsd = lineTotalUsdValue(row);
    if (totalUsd > 0) return roundMoney((totalUsd * rate) / qty);
  }
  const unit = parsePositiveNumber(row.unitCostIls);
  return unit ?? 0;
}

function formatDisplayDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

function emptyLine(product?: Product): LineRow {
  return {
    key: crypto.randomUUID(),
    productId: product?.id ?? '',
    warehouseId: '',
    quantity: 1,
    lineTotalUsd: '',
    lineTotalIlsInput: '',
    unitCostIls: '',
    unitCostManual: false,
  };
}

function linesToRows(receipt: PurchaseReceipt): LineRow[] {
  const usd = isUsdCurrency(receipt.currency);
  const ils = isIlsCurrency(receipt.currency);
  return receipt.lines.map((l) => {
    const qty = l.quantity;
    const unitPrice = l.unitPrice != null ? String(l.unitPrice) : '';
    const lineTotalUsd =
      usd && l.unitPrice != null ? String(roundMoney(l.unitPrice * qty)) : '';
    const lineTotalIlsInput =
      ils && l.unitPrice != null
        ? String(roundMoney(l.unitPrice * qty))
        : l.unitCostIls != null
          ? String(roundMoney(l.unitCostIls * qty))
          : '';
    const unitCostIls =
      l.unitCostIls != null
        ? String(l.unitCostIls)
        : ils && l.unitPrice != null
          ? unitPrice
          : '';
    return {
      key: l.id,
      productId: l.productId,
      warehouseId: l.warehouseId ?? '',
      quantity: qty,
      lineTotalUsd,
      lineTotalIlsInput,
      unitCostIls,
      unitCostManual: l.unitCostIls != null || (ils && l.unitPrice != null),
    };
  });
}

function rowsToPayload(
  rows: LineRow[],
  currency: string,
  usdRate: number | null
): PurchaseReceiptLineInput[] {
  const currencyMode = purchaseReceiptCurrencyMode(currency);
  return rows
    .filter((r) => r.productId)
    .map((r) => {
      const qty = normalizeStockQuantity(r.quantity);
      const unitCostIls = lineUnitCostIlsValue(r, usdRate, currencyMode);
      if (currencyMode === 'ILS') {
        const totalIls = lineTotalIlsValue(r, null, currencyMode);
        return {
          productId: r.productId,
          warehouseId: r.warehouseId || undefined,
          quantity: qty,
          unitPrice: qty > 0 ? roundMoney(totalIls / qty) : undefined,
          unitCostIls,
        };
      }
      const totalUsd = lineTotalUsdValue(r);
      return {
        productId: r.productId,
        warehouseId: r.warehouseId || undefined,
        quantity: qty,
        unitPrice: qty > 0 ? roundMoney(totalUsd / qty) : undefined,
        unitCostIls,
      };
    });
}

type ReceiptFormValidation = {
  canSave: boolean;
  errorKey?: string;
};

function validateReceiptForm(
  supplierId: string,
  currency: string,
  lines: LineRow[],
  productById: Map<string, Product>,
  usdRate: number | null,
  applyLandedCosts: boolean,
  landedCostRows: LandedCostRow[]
): ReceiptFormValidation {
  if (!supplierId) {
    return { canSave: false, errorKey: 'purchaseReceipts.supplierRequired' };
  }

  const filled = lines.filter((l) => l.productId);
  if (filled.length === 0) {
    return { canSave: false, errorKey: 'purchaseReceipts.linesRequired' };
  }

  const currencyMode = purchaseReceiptCurrencyMode(currency);

  for (const line of filled) {
    const product = productById.get(line.productId);
    if (product && productTracksStock(product) && !line.warehouseId) {
      return { canSave: false, errorKey: 'purchaseReceipts.warehouseRequired' };
    }
    if (currencyMode === 'USD') {
      if (lineTotalUsdValue(line) <= 0) {
        return { canSave: false, errorKey: 'purchaseReceipts.lineTotalUsdRequired' };
      }
    } else if (lineTotalIlsValue(line, null, currencyMode) <= 0) {
      return { canSave: false, errorKey: 'purchaseReceipts.lineTotalIlsRequired' };
    }
    if (lineUnitCostIlsValue(line, usdRate, currencyMode) <= 0) {
      return { canSave: false, errorKey: 'purchaseReceipts.unitCostIlsRequired' };
    }
  }

  if (applyLandedCosts) {
    const filledLanded = landedCostRows.filter((r) => r.supplierId || r.amount.trim());
    if (filledLanded.length === 0) {
      return { canSave: false, errorKey: 'purchaseReceipts.landedCostsRequired' };
    }
    for (const row of filledLanded) {
      if (!row.supplierId) {
        return { canSave: false, errorKey: 'purchaseReceipts.landedCostSupplierRequired' };
      }
      if (parsePositiveNumber(row.amount) === null) {
        return { canSave: false, errorKey: 'purchaseReceipts.landedCostAmountRequired' };
      }
      if (row.currency === 'USD' && (usdRate === null || usdRate <= 0)) {
        return { canSave: false, errorKey: 'purchaseReceipts.landedCostUsdRateRequired' };
      }
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
      lineTotalUsd: r.lineTotalUsd.trim(),
      lineTotalIlsInput: r.lineTotalIlsInput.trim(),
      unitCostIls: r.unitCostIls.trim(),
      unitCostManual: r.unitCostManual,
    }));
}

function isImageFile(name: string, mime?: string) {
  if (mime?.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}

function isPdfFile(name: string, mime?: string) {
  if (mime === 'application/pdf' || mime?.includes('pdf')) return true;
  return /\.pdf$/i.test(name);
}

function dedupeDocuments(docs: PurchaseReceiptDocument[]): PurchaseReceiptDocument[] {
  const byId = new Map<string, PurchaseReceiptDocument>();
  for (const doc of docs) {
    if (!doc.id) continue;
    byId.set(doc.id, doc);
  }
  return [...byId.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt)
  );
}

type PendingDoc = { key: string; file: File; previewUrl: string };

const PENDING_DOC_PREFIX = 'pending:';

function isPendingDocKey(key: string) {
  return key.startsWith(PENDING_DOC_PREFIX);
}

function pendingDocKeyFrom(key: string) {
  return key.slice(PENDING_DOC_PREFIX.length);
}

function toPendingDocKey(key: string) {
  return `${PENDING_DOC_PREFIX}${key}`;
}

const DOC_ZOOM_MIN = 50;
const DOC_ZOOM_MAX = 200;
const DOC_ZOOM_STEP = 10;
const DOC_PAGE_ASPECT = 1.414;
const PR_DOC_FILE_INPUT_ID = 'pr-doc-file-input';

export function PurchaseReceiptDetailPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const routeReceiptId = !isNew && id && id !== 'new' ? id : null;
  const [docDropActive, setDocDropActive] = useState(false);
  const docViewportRef = useRef<HTMLDivElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const docBlobUrlsRef = useRef<Record<string, string>>({});
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
  const [currency, setCurrency] = useState('USD');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [applyLandedCosts, setApplyLandedCosts] = useState(false);
  const [landedCostRows, setLandedCostRows] = useState<LandedCostRow[]>([]);
  const [landedCostToRemove, setLandedCostToRemove] = useState<string | null>(null);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [selectedDocKey, setSelectedDocKey] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [docBlobUrls, setDocBlobUrls] = useState<Record<string, string>>({});
  const [docToRemove, setDocToRemove] = useState<string | null>(null);
  const [docUploadError, setDocUploadError] = useState('');
  const [docUploadSuccess, setDocUploadSuccess] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(() => Boolean(id && id !== 'new'));
  const [docZoom, setDocZoom] = useState(100);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docDeleting, setDocDeleting] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [usdRate, setUsdRate] = useState<UsdIlsRate | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateError, setRateError] = useState('');

  const isPosted = receipt?.status === 'Posted';
  const isDraft = !receipt || receipt.status === 'Draft';
  const canManageDocument = isNew || Boolean(id && id !== 'new');
  const docTargetId = receipt?.id ?? routeReceiptId;
  const canUploadDocument =
    canManageDocument &&
    !uploading &&
    !docDeleting &&
    !saving &&
    (isNew || (Boolean(docTargetId) && (!receiptLoading || Boolean(routeReceiptId))));

  const documentsFingerprint =
    receipt?.documents?.map((d) => `${d.id}:${d.fileName}:${d.sortOrder}`).join('|') ?? '';

  const savedDocuments = useMemo(
    () => dedupeDocuments(receipt?.documents ?? []),
    [documentsFingerprint, receipt?.documents]
  );

  const currencyMode = purchaseReceiptCurrencyMode(currency);
  const usdRateValue = usdRate?.rate ?? null;

  const selectedSavedDoc = selectedDocKey
    ? savedDocuments.find((d) => d.id === selectedDocKey)
    : undefined;
  const selectedPendingDoc = selectedDocKey && isPendingDocKey(selectedDocKey)
    ? pendingDocs.find((d) => d.key === pendingDocKeyFrom(selectedDocKey))
    : undefined;

  const previewName =
    selectedSavedDoc?.fileName ??
    selectedPendingDoc?.file.name ??
    '';
  const previewMime =
    selectedSavedDoc?.contentType ??
    selectedPendingDoc?.file.type;
  const previewIsImage = activePreviewUrl
    ? isImageFile(previewName, previewMime)
    : false;
  const hasPreview = Boolean(activePreviewUrl);
  const showDocViewport = hasPreview || previewLoading || uploading;
  const hasAnyDocuments = savedDocuments.length > 0 || pendingDocs.length > 0;

  const filledLines = useMemo(() => lines.filter((l) => l.productId), [lines]);
  const positionsCount = filledLines.length;
  const linesGrandTotalIls = useMemo(
    () =>
      filledLines.reduce(
        (sum, l) => sum + lineTotalIlsValue(l, usdRateValue, currencyMode),
        0
      ),
    [filledLines, usdRateValue, currencyMode]
  );

  const landedCostsGrandTotalIls = useMemo(
    () =>
      landedCostRows.reduce(
        (sum, r) => sum + landedCostAmountIls(r, usdRateValue),
        0
      ),
    [landedCostRows, usdRateValue]
  );

  const serializeForm = useCallback(
    () =>
      JSON.stringify({
        supplierId,
        supplierInvoiceNumber,
        documentDate,
        currency,
        notes,
        applyLandedCosts,
        landedCosts: landedCostsForCompare(landedCostRows),
        lines: linesForCompare(lines),
        pendingDocNames: pendingDocs.map((d) => d.file.name),
      }),
    [
      supplierId,
      supplierInvoiceNumber,
      documentDate,
      currency,
      notes,
      applyLandedCosts,
      landedCostRows,
      lines,
      pendingDocs,
    ]
  );

  const isDirty = isDraft && serializeForm() !== baseline;

  const lineColumns = useMemo(
    () => visiblePurchaseReceiptLineColumns(currencyMode, isDraft),
    [currencyMode, isDraft]
  );

  const { widths, onResizeHandleMouseDown, tableMinWidth } = useResizableTableColumns(
    PURCHASE_RECEIPT_LINES_COLUMN_WIDTHS_KEY,
    PURCHASE_RECEIPT_LINE_DEFAULT_WIDTHS
  );

  const lineColumnLabels: Record<PurchaseReceiptLineColumnKey, string> = useMemo(
    () => ({
      product: t('purchaseReceipts.product'),
      warehouse: t('purchaseReceipts.warehouse'),
      qty: t('purchaseReceipts.quantity'),
      usdTotal: t('purchaseReceipts.lineTotalUsd'),
      ilsTotal: t('purchaseReceipts.lineTotalIls'),
      unitCost: t('purchaseReceipts.unitCostPerUnit'),
      actions: '',
    }),
    [t]
  );

  const renderLineHeaderCell = (colKey: PurchaseReceiptLineColumnKey) => {
    const colClass = PURCHASE_RECEIPT_LINE_COLUMN_CLASS[colKey];
    if (colKey === 'actions') {
      return <th key={colKey} className={colClass} aria-hidden />;
    }
    return (
      <th key={colKey} className={`${colClass} pr-th-resizable`}>
        <span className="pr-th-label">{lineColumnLabels[colKey]}</span>
        <span
          className="pr-col-resize-handle"
          onMouseDown={(e: MouseEvent) => onResizeHandleMouseDown(colKey, e)}
          role="separator"
          aria-orientation="vertical"
          aria-label={t('products.resizeColumn')}
          tabIndex={-1}
        />
      </th>
    );
  };

  const summaryColSpan = lineColumns.length - (isDraft ? 2 : 1);

  const clearPendingDocs = useCallback(() => {
    setPendingDocs((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
  }, []);

  const revokeDocBlob = useCallback((docId: string) => {
    const url = docBlobUrlsRef.current[docId];
    if (url) URL.revokeObjectURL(url);
    setDocBlobUrls((prev) => {
      if (!prev[docId]) return prev;
      const next = { ...prev };
      delete next[docId];
      docBlobUrlsRef.current = next;
      return next;
    });
  }, []);

  const applyReceiptWithDocuments = useCallback((fresh: PurchaseReceipt) => {
    flushSync(() => {
      setReceipt({
        ...fresh,
        documents: dedupeDocuments(fresh.documents),
      });
    });
  }, []);

  const selectDocument = useCallback((docId: string) => {
    setSelectedDocKey(docId);
    const url = docBlobUrlsRef.current[docId];
    if (url) {
      setActivePreviewUrl(url);
      setPreviewError('');
      setPreviewLoading(false);
    } else {
      setActivePreviewUrl(null);
      setPreviewLoading(true);
    }
  }, []);

  const loadReceipt = useCallback(async () => {
    if (!token || isNew || !id || id === 'new') {
      setReceiptLoading(false);
      return;
    }
    setReceiptLoading(true);
    setError('');
    try {
      const r = await purchaseReceiptsApi.get(token, id);
      setReceipt(r);
      setSupplierId(r.supplierId);
      setSupplierInvoiceNumber(r.supplierInvoiceNumber ?? '');
      setDocumentDate(r.documentDate);
      setCurrency(purchaseReceiptCurrencyMode(r.currency));
      setNotes(r.notes ?? '');
      setLines(linesToRows(r));
      setApplyLandedCosts(r.applyLandedCosts);
      setLandedCostRows(
        r.landedCostLines.length > 0 ? landedCostsToRows(r) : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setReceiptLoading(false);
    }
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
    () =>
      validateReceiptForm(
        supplierId,
        currency,
        lines,
        productById,
        usdRateValue,
        applyLandedCosts,
        landedCostRows
      ),
    [supplierId, currency, lines, productById, usdRateValue, applyLandedCosts, landedCostRows]
  );

  useEffect(() => {
    if (!token || isPosted) return;
    const needsUsdRate =
      currencyMode === 'USD' ||
      (applyLandedCosts && landedCostRows.some((r) => r.currency === 'USD'));
    if (!needsUsdRate) {
      setUsdRate(null);
      setRateError('');
      return;
    }
    let cancelled = false;
    setRateLoading(true);
    setRateError('');
    exchangeRatesApi
      .usdIls(token, documentDate)
      .then((rate) => {
        if (!cancelled) setUsdRate(rate);
      })
      .catch((e) => {
        if (!cancelled) {
          setUsdRate(null);
          setRateError(e instanceof Error ? e.message : 'Error');
        }
      })
      .finally(() => {
        if (!cancelled) setRateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, currencyMode, documentDate, isPosted, applyLandedCosts, landedCostRows]);

  useEffect(() => {
    loadReceipt().catch((e) => setError(e.message));
  }, [loadReceipt]);

  useEffect(() => {
    docBlobUrlsRef.current = docBlobUrls;
  }, [docBlobUrls]);

  useEffect(() => {
    const wantedIds = new Set(savedDocuments.map((d) => d.id));

    for (const id of Object.keys(docBlobUrlsRef.current)) {
      if (!wantedIds.has(id)) revokeDocBlob(id);
    }

    if (!token || savedDocuments.length === 0) return;

    const blobReceiptId = receipt?.id ?? routeReceiptId;
    if (!blobReceiptId) return;

    let cancelled = false;
    void (async () => {
      for (const doc of savedDocuments) {
        if (docBlobUrlsRef.current[doc.id]) continue;
        try {
          const url = await purchaseReceiptsApi.documentBlobUrl(
            token,
            blobReceiptId,
            doc.id,
            doc.fileName
          );
          if (cancelled) {
            URL.revokeObjectURL(url);
            continue;
          }
          setDocBlobUrls((prev) => {
            if (prev[doc.id]) {
              URL.revokeObjectURL(url);
              return prev;
            }
            const next = { ...prev, [doc.id]: url };
            docBlobUrlsRef.current = next;
            return next;
          });
        } catch {
          /* blob optional */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, receipt?.id, routeReceiptId, savedDocuments, revokeDocBlob]);

  useEffect(() => {
    const savedIds = new Set(savedDocuments.map((d) => d.id));
    const pendingKeys = new Set(pendingDocs.map((d) => toPendingDocKey(d.key)));
    const selectionValid =
      selectedDocKey !== null &&
      (savedIds.has(selectedDocKey) || pendingKeys.has(selectedDocKey));

    if (!selectionValid) {
      const next =
        savedDocuments[0]?.id ??
        (pendingDocs[0] ? toPendingDocKey(pendingDocs[0].key) : null);
      if (next) selectDocument(next);
      else setSelectedDocKey(null);
    }
  }, [savedDocuments, pendingDocs, selectedDocKey, selectDocument]);

  useEffect(() => {
    if (!selectedDocKey) {
      setActivePreviewUrl(null);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }

    if (isPendingDocKey(selectedDocKey)) {
      const pending = pendingDocs.find((d) => d.key === pendingDocKeyFrom(selectedDocKey));
      setActivePreviewUrl(pending?.previewUrl ?? null);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }

    const url = docBlobUrls[selectedDocKey];
    if (url) {
      setActivePreviewUrl(url);
      setPreviewError('');
      setPreviewLoading(false);
      return;
    }

    if (savedDocuments.some((d) => d.id === selectedDocKey)) {
      setActivePreviewUrl(null);
      setPreviewLoading(true);
    }
  }, [selectedDocKey, docBlobUrls, savedDocuments, pendingDocs]);

  useEffect(() => {
    return () => {
      Object.values(docBlobUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    return () => {
      pendingDocs.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [pendingDocs]);

  useEffect(() => {
    if (!isNew || supplierId) return;
    const fromUrl = searchParams.get('supplierId');
    if (fromUrl && suppliers.some((s) => s.id === fromUrl)) {
      setSupplierId(fromUrl);
    }
  }, [isNew, supplierId, searchParams, suppliers]);

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
    totalAmount: positionsCount > 0 ? linesGrandTotalIls : null,
    notes: notes.trim() || null,
    version: receipt?.version,
    applyLandedCosts,
    lines: rowsToPayload(lines, currency, usdRateValue),
    landedCostLines: applyLandedCosts ? rowsToLandedCostPayload(landedCostRows) : [],
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
        for (const pending of pendingDocs) {
          saved = await purchaseReceiptsApi.uploadDocument(token, saved.id, pending.file);
        }
        clearPendingDocs();
      } else {
        saved = await purchaseReceiptsApi.update(token, id!, buildPayload());
      }

      try {
        await purchaseReceiptsApi.post(token, saved.id, saved.version);
        flushSync(() => setBaseline(serializeForm()));
        navigate('/purchase-receipts');
        return true;
      } catch (postErr) {
        if (isNew) {
          navigate(`/purchase-receipts/${saved.id}`, { replace: true });
        }
        throw postErr;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setSaving(false);
      return false;
    }
  }, [
    token,
    formValidation,
    isNew,
    pendingDocs,
    id,
    navigate,
    clearPendingDocs,
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

  const openDocFilePicker = () => {
    if (!canUploadDocument || uploading) return;
    docFileInputRef.current?.click();
  };

  const onPickDocument = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    void processDocumentFiles(files);
  };

  const processDocumentFiles = async (files: File[]) => {
    if (!files.length) return;
    if (!token) {
      setDocUploadError(t('purchaseReceipts.documentUploadNeedLogin'));
      return;
    }
    const targetReceiptId = receipt?.id ?? routeReceiptId;

    if (!isNew && !targetReceiptId) {
      setDocUploadError(t('purchaseReceipts.receiptLoadingDocHint'));
      return;
    }

    if (targetReceiptId && !isNew) {
      setUploading(true);
      setDocUploadError('');
      setDocUploadSuccess('');
      setPreviewError('');
      clearPendingDocs();
      try {
        let latest: PurchaseReceipt | null = null;
        for (const file of files) {
          latest = await purchaseReceiptsApi.uploadDocument(token, targetReceiptId, file);
          applyReceiptWithDocuments(latest);
        }
        if (!latest) {
          setDocUploadError(t('purchaseReceipts.documentUploadEmptyResponse'));
          return;
        }
        const fresh = await purchaseReceiptsApi.get(token, targetReceiptId);
        applyReceiptWithDocuments(fresh);
        const docs = dedupeDocuments(fresh.documents);
        const lastDoc = docs[docs.length - 1];
        if (lastDoc) {
          selectDocument(lastDoc.id);
          setDocUploadSuccess(
            files.length > 1
              ? t('purchaseReceipts.documentsUploaded', { count: files.length })
              : t('purchaseReceipts.documentUploaded', { name: lastDoc.fileName })
          );
        } else {
          setDocUploadError(t('purchaseReceipts.documentUploadEmptyResponse'));
        }
      } catch (err) {
        setDocUploadError(err instanceof Error ? err.message : 'Error');
      } finally {
        setUploading(false);
      }
      return;
    }

    if (isNew && formValidation.canSave) {
      setUploading(true);
      setDocUploadError('');
      setPreviewError('');
      try {
        let saved = await purchaseReceiptsApi.create(token, buildPayload());
        for (const file of files) {
          saved = await purchaseReceiptsApi.uploadDocument(token, saved.id, file);
        }
        for (const pending of pendingDocs) {
          saved = await purchaseReceiptsApi.uploadDocument(token, saved.id, pending.file);
        }
        clearPendingDocs();
        navigate(`/purchase-receipts/${saved.id}`, { replace: true });
      } catch (err) {
        setDocUploadError(err instanceof Error ? err.message : 'Error');
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!isNew) return;

    if (!formValidation.canSave) {
      setDocUploadError(t(formValidation.errorKey ?? 'purchaseReceipts.documentNeedsDraftFields'));
    } else {
      setDocUploadError('');
    }

    const added = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setPendingDocs((prev) => [...prev, ...added]);
    if (!selectedDocKey && added[0]) {
      setSelectedDocKey(toPendingDocKey(added[0].key));
    }
  };

  const onDocDragOver = (e: React.DragEvent) => {
    if (!canUploadDocument) return;
    e.preventDefault();
    setDocDropActive(true);
  };

  const onDocDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDocDropActive(false);
  };

  const onDocDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDocDropActive(false);
    if (!canUploadDocument) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void processDocumentFiles(files);
  };

  const removeDoc = async (docKey: string) => {
    if (isPendingDocKey(docKey)) {
      const pendingKey = pendingDocKeyFrom(docKey);
      setPendingDocs((prev) => {
        const item = prev.find((p) => p.key === pendingKey);
        if (item) URL.revokeObjectURL(item.previewUrl);
        return prev.filter((p) => p.key !== pendingKey);
      });
      if (selectedDocKey === docKey) setSelectedDocKey(null);
      setDocUploadError('');
      setPreviewError('');
      return;
    }
    const docReceiptId = receipt?.id ?? routeReceiptId;
    if (!token || !docReceiptId) return;
    setDocDeleting(true);
    setDocUploadError('');
    setPreviewError('');
    try {
      await purchaseReceiptsApi.deleteDocument(token, docReceiptId, docKey);
      revokeDocBlob(docKey);
      setActivePreviewUrl(null);
      const fresh = await purchaseReceiptsApi.get(token, docReceiptId);
      applyReceiptWithDocuments(fresh);
      const docs = dedupeDocuments(fresh.documents);
      if (docs[0]) selectDocument(docs[0].id);
      else {
        setSelectedDocKey(null);
        setActivePreviewUrl(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error';
      if (/not found|404/i.test(message)) {
        try {
          revokeDocBlob(docKey);
          const latest = await purchaseReceiptsApi.get(token, docReceiptId);
          applyReceiptWithDocuments(latest);
          const docs = dedupeDocuments(latest.documents);
          if (docs[0]) selectDocument(docs[0].id);
          else {
            setSelectedDocKey(null);
            setActivePreviewUrl(null);
          }
          setDocUploadError('');
          return;
        } catch {
          /* fall through */
        }
      }
      setDocUploadError(message);
    } finally {
      setDocDeleting(false);
    }
  };

  const updateLine = (key: string, patch: Partial<LineRow>) =>
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const updateLandedCostRow = (key: string, patch: Partial<LandedCostRow>) =>
    setLandedCostRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addLandedCostRow = () =>
    setLandedCostRows((rows) => [...rows, emptyLandedCostRow()]);

  const removeLandedCostRow = (key: string) =>
    setLandedCostRows((rows) => rows.filter((r) => r.key !== key));

  const onApplyLandedCostsChange = (checked: boolean) => {
    setApplyLandedCosts(checked);
    if (checked) {
      setLandedCostRows((rows) => (rows.length > 0 ? rows : [emptyLandedCostRow()]));
    }
  };

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

    const freshLine = (pick: PickedReceiptProduct): Partial<LineRow> => ({
      productId: pick.product.id,
      quantity: normalizeStockQuantity(pick.quantity),
      warehouseId: '',
      lineTotalUsd: '',
      lineTotalIlsInput: '',
      unitCostManual: false,
      unitCostIls: '',
    });

    if (pickerReplaceKey) {
      const pick = picks[0];
      if (pick) {
        updateLine(pickerReplaceKey, freshLine(pick));
      }
      setPickerOpen(false);
      setPickerReplaceKey(null);
      return;
    }
    setLines((rows) => [
      ...rows,
      ...picks.map((pick) => ({
        ...emptyLine(pick.product),
        ...freshLine(pick),
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

  const landedCostToRemoveSupplier = landedCostToRemove
    ? suppliers.find((s) => s.id === landedCostRows.find((r) => r.key === landedCostToRemove)?.supplierId)
    : undefined;

  const showUsdRateNotes =
    !isPosted &&
    (currencyMode === 'USD' ||
      (applyLandedCosts && landedCostRows.some((r) => r.currency === 'USD')));

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
  }, [activePreviewUrl, hasPreview]);

  useLayoutEffect(() => {
    if (!hasPreview) return;
    measureDocWidth();
    window.addEventListener('resize', measureDocWidth);
    return () => window.removeEventListener('resize', measureDocWidth);
  }, [hasPreview, activePreviewUrl, measureDocWidth]);

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

  const openActiveDocument = () => {
    if (!activePreviewUrl) return;
    window.open(activePreviewUrl, '_blank', 'noopener,noreferrer');
  };

  const downloadActiveDocument = async () => {
    if (!activePreviewUrl || !previewName) return;
    if (selectedPendingDoc) {
      const url = activePreviewUrl;
      const a = document.createElement('a');
      a.href = url;
      a.download = previewName;
      a.click();
      return;
    }
    if (!token || !receipt || !selectedDocKey || isPendingDocKey(selectedDocKey)) return;
    try {
      await purchaseReceiptsApi.downloadDocument(
        token,
        receipt.id,
        selectedDocKey,
        previewName
      );
    } catch (err) {
      setDocUploadError(err instanceof Error ? err.message : 'Error');
    }
  };

  const pdfPreviewSrc = activePreviewUrl;
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
                <select
                  value={currencyMode}
                  disabled={isPosted}
                  title={t('purchaseReceipts.currencyHint')}
                  onChange={(e) => {
                    const next = e.target.value as PurchaseReceiptCurrencyMode;
                    setCurrency(next);
                    setLines((rows) =>
                      rows.map((row) => ({
                        ...row,
                        lineTotalUsd: '',
                        lineTotalIlsInput: '',
                        unitCostIls: '',
                        unitCostManual: false,
                      }))
                    );
                  }}
                >
                  <option value="USD">USD</option>
                  <option value="ILS">ILS</option>
                </select>
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
                  className={`pr-lines-table${currencyMode === 'USD' ? ' pr-lines-table--usd' : ''}${isDraft ? ' pr-lines-table--with-actions' : ''}`}
                  style={{ minWidth: tableMinWidth }}
                >
                  <colgroup>
                    {lineColumns.map((key) => (
                      <col key={key} style={{ width: widths[key] }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>{lineColumns.map(renderLineHeaderCell)}</tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const lineProduct = line.productId ? productById.get(line.productId) : undefined;
                      const lineTracksStock = lineProduct ? productTracksStock(lineProduct) : false;
                      const displayLineIls = lineTotalIlsValue(line, usdRateValue, currencyMode);
                      const computedUnitCost = lineUnitCostIlsValue(line, usdRateValue, currencyMode);
                      const displayUnitCost = line.unitCostManual
                        ? line.unitCostIls
                        : computedUnitCost > 0
                          ? computedUnitCost.toFixed(2)
                          : '';
                      const qtyDisplay =
                        line.quantity <= 0 ? '' : String(line.quantity);
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
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            disabled={isPosted}
                            value={qtyDisplay}
                            onChange={(e) => {
                              const raw = sanitizeQuantityDraft(e.target.value);
                              updateLine(line.key, {
                                quantity:
                                  raw === '' ? 0 : normalizeStockQuantity(Number(raw)),
                              });
                            }}
                            onBlur={() => {
                              if (normalizeStockQuantity(line.quantity) < 1) {
                                updateLine(line.key, { quantity: 1 });
                              }
                            }}
                          />
                        </td>
                        {currencyMode === 'USD' && (
                          <td className="pr-col-usd-total">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={isPosted}
                              value={line.lineTotalUsd}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  lineTotalUsd: e.target.value,
                                  unitCostManual: false,
                                  unitCostIls: '',
                                })
                              }
                            />
                          </td>
                        )}
                        <td className="pr-col-ils-total">
                          {currencyMode === 'USD' ? (
                            <span className="pr-line-total-cell">
                              {line.productId && displayLineIls > 0
                                ? `${displayLineIls.toFixed(2)} ₪`
                                : '—'}
                            </span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              disabled={isPosted}
                              value={line.lineTotalIlsInput}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  lineTotalIlsInput: e.target.value,
                                  unitCostManual: false,
                                  unitCostIls: '',
                                })
                              }
                            />
                          )}
                        </td>
                        <td className="pr-col-unit-cost">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isPosted}
                            value={displayUnitCost}
                            title={t('purchaseReceipts.unitCostIlsHint')}
                            onChange={(e) =>
                              updateLine(line.key, {
                                unitCostIls: e.target.value,
                                unitCostManual: true,
                              })
                            }
                          />
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
                      <td colSpan={summaryColSpan}>
                        {t('purchaseReceipts.positionsCount', { count: positionsCount })}
                      </td>
                      <td className="pr-line-total-cell pr-lines-grand-total">
                        <span className="pr-grand-total-inline">
                          <span className="pr-grand-total-label">
                            {t('purchaseReceipts.grandTotalIls')}
                          </span>
                          <span className="pr-grand-total-value">
                            {positionsCount > 0
                              ? `${linesGrandTotalIls.toFixed(2)} ₪`
                              : '—'}
                          </span>
                        </span>
                      </td>
                      {isDraft && <td />}
                    </tr>
                  </tfoot>
                </table>
                {showUsdRateNotes && (
                  <div className="pr-usd-rate-notes">
                    {rateLoading && (
                      <p className="muted pr-usd-rate-note">{t('purchaseReceipts.usdRateLoading')}</p>
                    )}
                    {rateError && !rateLoading && (
                      <p className="pr-usd-rate-note pr-usd-rate-note--error">
                        {t('purchaseReceipts.usdRateError')}: {rateError}
                      </p>
                    )}
                    {usdRate && !rateLoading && (
                      <>
                        <p className="pr-usd-rate-note pr-usd-rate-note--disclaimer">
                          {usdRate.usedNearestAvailableDate
                            ? t('purchaseReceipts.usdRateNearestDisclaimer', {
                                date: formatDisplayDate(documentDate),
                                rateDate: formatDisplayDate(usdRate.rateDate),
                                rate: usdRate.rate.toFixed(4),
                              })
                            : t('purchaseReceipts.usdRateDisclaimer', {
                                date: formatDisplayDate(documentDate),
                                rate: usdRate.rate.toFixed(4),
                              })}
                        </p>
                        <p className="pr-usd-rate-note pr-usd-rate-note--hint">
                          {t('purchaseReceipts.usdRateBankHint')}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="pr-section pr-section--landed-costs">
            <label className="pr-landed-costs-toggle">
              <input
                type="checkbox"
                checked={applyLandedCosts}
                disabled={isPosted}
                onChange={(e) => onApplyLandedCostsChange(e.target.checked)}
              />
              <span>{t('purchaseReceipts.applyLandedCosts')}</span>
            </label>
            <p className="muted pr-landed-costs-hint">{t('purchaseReceipts.landedCostsHint')}</p>

            {applyLandedCosts && (
              <>
                <div className="pr-section-head">
                  <h2 className="pr-section-title">{t('purchaseReceipts.sectionLandedCosts')}</h2>
                  {isDraft && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addLandedCostRow}>
                      + {t('purchaseReceipts.addLandedCost')}
                    </button>
                  )}
                </div>
                {landedCostRows.length === 0 && (
                  <p className="muted pr-lines-empty">{t('purchaseReceipts.landedCostsEmpty')}</p>
                )}
                {landedCostRows.length > 0 && (
                  <div className="pr-landed-costs-wrap">
                    <table className="pr-landed-costs-table">
                      <thead>
                        <tr>
                          <th>{t('purchaseReceipts.landedCostSupplier')}</th>
                          <th>{t('purchaseReceipts.landedCostCategory')}</th>
                          <th>{t('purchaseReceipts.currency')}</th>
                          <th>{t('purchaseReceipts.landedCostAmount')}</th>
                          <th>{t('purchaseReceipts.lineTotalIls')}</th>
                          <th>{t('purchaseReceipts.notes')}</th>
                          {isDraft && <th aria-hidden />}
                        </tr>
                      </thead>
                      <tbody>
                        {landedCostRows.map((row) => {
                          const amountIls = landedCostAmountIls(row, usdRateValue);
                          const postedAmountIls =
                            isPosted && receipt
                              ? receipt.landedCostLines.find((l) => l.id === row.key)?.amountIls
                              : undefined;
                          const displayIls =
                            postedAmountIls != null ? postedAmountIls : amountIls;
                          return (
                            <tr key={row.key}>
                              <td>
                                <select
                                  value={row.supplierId}
                                  disabled={isPosted}
                                  onChange={(e) =>
                                    updateLandedCostRow(row.key, { supplierId: e.target.value })
                                  }
                                >
                                  <option value="">{t('purchaseReceipts.selectSupplier')}</option>
                                  {suppliers.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.category}
                                  disabled={isPosted}
                                  onChange={(e) =>
                                    updateLandedCostRow(row.key, {
                                      category: e.target.value as LandedCostCategory,
                                    })
                                  }
                                >
                                  {LANDED_COST_CATEGORIES.map((cat) => (
                                    <option key={cat} value={cat}>
                                      {t(`purchaseReceipts.landedCostCategory${cat}`)}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  value={row.currency}
                                  disabled={isPosted}
                                  onChange={(e) =>
                                    updateLandedCostRow(row.key, {
                                      currency: e.target.value as 'USD' | 'ILS',
                                    })
                                  }
                                >
                                  <option value="USD">USD</option>
                                  <option value="ILS">ILS</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  disabled={isPosted}
                                  value={row.amount}
                                  onChange={(e) =>
                                    updateLandedCostRow(row.key, { amount: e.target.value })
                                  }
                                />
                              </td>
                              <td className="pr-line-total-cell">
                                {displayIls > 0 ? `${displayIls.toFixed(2)} ₪` : '—'}
                              </td>
                              <td>
                                <input
                                  type="text"
                                  disabled={isPosted}
                                  value={row.notes}
                                  placeholder={t('purchaseReceipts.landedCostNotesPlaceholder')}
                                  onChange={(e) =>
                                    updateLandedCostRow(row.key, { notes: e.target.value })
                                  }
                                />
                              </td>
                              {isDraft && (
                                <td className="pr-col-actions">
                                  <button
                                    type="button"
                                    className="pr-line-remove"
                                    title={t('purchaseReceipts.removeLine')}
                                    aria-label={t('purchaseReceipts.removeLine')}
                                    onClick={() => setLandedCostToRemove(row.key)}
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="pr-lines-summary">
                          <td colSpan={4}>{t('purchaseReceipts.landedCostsTotal')}</td>
                          <td className="pr-line-total-cell pr-lines-grand-total">
                            {landedCostRows.some((r) => r.supplierId && r.amount.trim())
                              ? `${(isPosted && receipt
                                  ? receipt.landedCostLines.reduce(
                                      (s, l) => s + (l.amountIls ?? 0),
                                      0
                                    )
                                  : landedCostsGrandTotalIls
                                ).toFixed(2)} ₪`
                              : '—'}
                          </td>
                          <td colSpan={isDraft ? 2 : 1} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
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
            {canManageDocument && (
              <div className="pr-doc-upload-row">
                <label
                  className={`btn btn-secondary btn-sm pr-doc-upload-label${!canUploadDocument || uploading ? ' pr-doc-upload-label--disabled' : ''}`}
                >
                  {uploading ? t('purchaseReceipts.uploading') : t('purchaseReceipts.addDocument')}
                  <input
                    ref={docFileInputRef}
                    id={PR_DOC_FILE_INPUT_ID}
                    type="file"
                    accept="application/pdf,.pdf,image/jpeg,image/png,image/webp,image/*"
                    multiple
                    className="sr-only"
                    onChange={onPickDocument}
                  />
                </label>
                {savedDocuments.length > 0 && (
                  <span className="muted pr-doc-upload-hint">
                    {t('purchaseReceipts.documentsCount', { count: savedDocuments.length })}
                  </span>
                )}
                {!savedDocuments.length && canUploadDocument && (
                  <span className="muted pr-doc-upload-hint">
                    {t('purchaseReceipts.addDocumentsHint')}
                  </span>
                )}
              </div>
            )}
          </div>

          {(uploading || docDeleting) && (
            <p className="muted pr-doc-pending-hint">
              {uploading ? t('purchaseReceipts.uploading') : t('purchaseReceipts.loading')}
            </p>
          )}

          {docUploadError && (
            <div className="error-banner pr-doc-error">{docUploadError}</div>
          )}

          {docUploadSuccess && !docUploadError && (
            <div className="pr-doc-success">{docUploadSuccess}</div>
          )}

          {previewError && (
            <div className="error-banner pr-doc-error">{t('purchaseReceipts.documentPreviewFailed', { message: previewError })}</div>
          )}

          {receiptLoading && !isNew && (
            <p className="muted pr-doc-pending-hint">{t('purchaseReceipts.receiptLoadingDocHint')}</p>
          )}

          {hasAnyDocuments && (
            <div className="pr-doc-thumbs" role="list" key={documentsFingerprint}>
              {savedDocuments.map((doc) => {
                const isSelected = selectedDocKey === doc.id;
                const isImage = isImageFile(doc.fileName, doc.contentType);
                const isPdf = isPdfFile(doc.fileName, doc.contentType);
                const blobUrl = docBlobUrls[doc.id];
                return (
                  <div
                    key={doc.id}
                    role="listitem"
                    className={`pr-doc-thumb${isSelected ? ' pr-doc-thumb--active' : ''}`}
                  >
                    <button
                      type="button"
                      className="pr-doc-thumb-select"
                      title={doc.fileName}
                      onClick={() => selectDocument(doc.id)}
                    >
                      {isImage && blobUrl ? (
                        <img src={blobUrl} alt="" className="pr-doc-thumb-image" />
                      ) : (
                        <span className="pr-doc-thumb-pdf" aria-hidden>
                          {isPdf ? 'PDF' : 'DOC'}
                        </span>
                      )}
                      <span className="pr-doc-thumb-name">{doc.fileName}</span>
                    </button>
                    {canManageDocument && (
                      <button
                        type="button"
                        className="pr-doc-thumb-remove"
                        title={t('purchaseReceipts.removeDocument')}
                        aria-label={t('purchaseReceipts.removeDocument')}
                        onClick={() => setDocToRemove(doc.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
              {pendingDocs.map((doc) => {
                const docKey = toPendingDocKey(doc.key);
                const isSelected = selectedDocKey === docKey;
                const isImage = isImageFile(doc.file.name, doc.file.type);
                return (
                  <div
                    key={doc.key}
                    role="listitem"
                    className={`pr-doc-thumb pr-doc-thumb--pending${isSelected ? ' pr-doc-thumb--active' : ''}`}
                  >
                    <button
                      type="button"
                      className="pr-doc-thumb-select"
                      title={doc.file.name}
                      onClick={() => setSelectedDocKey(docKey)}
                    >
                      {isImage ? (
                        <img src={doc.previewUrl} alt="" className="pr-doc-thumb-image" />
                      ) : (
                        <span className="pr-doc-thumb-pdf" aria-hidden>PDF</span>
                      )}
                      <span className="pr-doc-thumb-name">{doc.file.name}</span>
                    </button>
                    {canManageDocument && (
                      <button
                        type="button"
                        className="pr-doc-thumb-remove"
                        title={t('purchaseReceipts.removeDocument')}
                        aria-label={t('purchaseReceipts.removeDocument')}
                        onClick={() => setDocToRemove(docKey)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pendingDocs.length > 0 && isNew && (
            <p className="pr-doc-pending-hint muted">{t('purchaseReceipts.documentPendingSave')}</p>
          )}

          {hasPreview && (
            <div className="pr-doc-preview-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={openActiveDocument}
              >
                {t('purchaseReceipts.documentOpenNewTab')}
              </button>
              <button
                type="button"
                className="btn btn-ghost-inline btn-sm"
                onClick={() => void downloadActiveDocument()}
              >
                {t('purchaseReceipts.documentDownload')}
              </button>
              {selectedSavedDoc && (
                <span className="pr-doc-preview-hint muted">
                  {t('purchaseReceipts.documentPreviewHint')}
                </span>
              )}
            </div>
          )}

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

          {previewName && (
            <p className="pr-doc-filename" title={previewName}>
              {previewName}
            </p>
          )}

          <div
            ref={docViewportRef}
            className={`pr-doc-viewport ${showDocViewport ? 'pr-doc-viewport--filled' : ''}${docDropActive ? ' pr-doc-viewport--drop-target' : ''}${previewLoading || uploading ? ' pr-doc-viewport--loading' : ''}`}
            onWheel={onDocWheel}
            onDragOver={onDocDragOver}
            onDragLeave={onDocDragLeave}
            onDrop={onDocDrop}
          >
            {(previewLoading || uploading) && !hasPreview && (
              <div className="pr-doc-loading">
                <p className="muted">
                  {uploading ? t('purchaseReceipts.uploading') : t('purchaseReceipts.loading')}
                </p>
              </div>
            )}
            {!hasPreview && !previewLoading && !uploading && (
              <div
                className={`pr-doc-empty${canUploadDocument ? ' pr-doc-empty--interactive' : ''}`}
                onClick={() => {
                  if (canUploadDocument) openDocFilePicker();
                }}
                onKeyDown={(e) => {
                  if (canUploadDocument && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    openDocFilePicker();
                  }
                }}
                role={canUploadDocument ? 'button' : undefined}
                tabIndex={canUploadDocument ? 0 : undefined}
              >
                <span className="pr-doc-empty-icon" aria-hidden>📄</span>
                <p>{t('purchaseReceipts.documentEmpty')}</p>
                <p className="muted">{t('purchaseReceipts.documentHint')}</p>
                {canUploadDocument && (
                  <p className="muted">{t('purchaseReceipts.documentDropHint')}</p>
                )}
              </div>
            )}
            {hasPreview && activePreviewUrl && (
              <div className="pr-doc-preview-center">
                {previewIsImage ? (
                  <img
                    src={activePreviewUrl}
                    alt={previewName}
                    className="pr-doc-image"
                    style={{ width: docContentWidth, maxWidth: 'none' }}
                  />
                ) : (
                  <iframe
                    key={selectedDocKey ?? activePreviewUrl}
                    title={previewName || t('purchaseReceipts.documentPreview')}
                    src={pdfPreviewSrc ?? undefined}
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
        </aside>
      </div>

      <ConfirmDialog
        open={docToRemove !== null}
        title={t('purchaseReceipts.removeDocumentConfirmTitle')}
        message={t('purchaseReceipts.removeDocumentConfirm', {
          name:
            docToRemove && isPendingDocKey(docToRemove)
              ? pendingDocs.find((d) => d.key === pendingDocKeyFrom(docToRemove))?.file.name ?? ''
              : savedDocuments.find((d) => d.id === docToRemove)?.fileName ?? '',
        })}
        confirmLabel={t('purchaseReceipts.removeDocument')}
        cancelLabel={t('settings.cancel')}
        danger
        onConfirm={() => {
          if (docToRemove) void removeDoc(docToRemove);
          setDocToRemove(null);
        }}
        onCancel={() => setDocToRemove(null)}
      />

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

      <ConfirmDialog
        open={landedCostToRemove !== null}
        title={t('purchaseReceipts.removeLandedCostConfirmTitle')}
        message={t('purchaseReceipts.removeLandedCostConfirm', {
          name: landedCostToRemoveSupplier?.name ?? '',
        })}
        confirmLabel={t('purchaseReceipts.removeLine')}
        cancelLabel={t('settings.cancel')}
        danger
        onConfirm={() => {
          if (landedCostToRemove) removeLandedCostRow(landedCostToRemove);
          setLandedCostToRemove(null);
        }}
        onCancel={() => setLandedCostToRemove(null)}
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

/** Remount editor when route changes so list ↔ new ↔ edit always share one fresh form. */
export function PurchaseReceiptDetailRoute() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const supplierFromUrl = searchParams.get('supplierId') ?? '';
  const remountKey = id && id !== 'new' ? id : `new:${supplierFromUrl}`;
  return <PurchaseReceiptDetailPage key={remountKey} />;
}
