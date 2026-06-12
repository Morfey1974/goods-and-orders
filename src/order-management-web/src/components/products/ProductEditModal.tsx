import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../ui/AppModal';
import { ConfirmDialog } from '../ConfirmDialog';
import { UnsavedLeaveDialog } from '../UnsavedLeaveDialog';
import {
  PurchaseReceiptProductPickerModal,
  type PickedReceiptProduct,
} from '../purchaseReceipts/PurchaseReceiptProductPickerModal';
import {
  catalogApi,
  type Product,
  type StockMovement,
} from '../../api/catalog';
import { inventoryApi, type InventoryLot } from '../../api/inventory';
import { productGroupsApi, type ProductGroup } from '../../api/productGroups';
import { warehouseApi, type Warehouse } from '../../api/warehouse';
import { defaultWarehouseForProductType, resolveProductWarehouseId } from '../../lib/defaultWarehouse';
import { formatInventoryLotSourceKind } from '../../lib/inventoryLotLabel';
import { formatStockQuantity } from '../../lib/stockQuantity';
import { BidiText, bidiAutoInputProps } from '../BidiText';
import { ProductTypeSelect } from './ProductTypeSelect';
import { ProductGroupsMultiSelect } from './ProductGroupsMultiSelect';
import { ProductWarehouseSelect } from './ProductWarehouseSelect';
import { ProductPhotoEditor } from './ProductPhotoEditor';
import { productTypeCanTrackStock, productTracksStock, isFixedAssetProductType } from '../../lib/productInventory';
import { DEPRECIATION_CATEGORIES } from '../../lib/businessAccountingTypes';
import { BOM_COMPONENT_PICKER_RESIZE, PRODUCT_CARD_RESIZE } from '../../lib/resizablePanelKeys';

const PRODUCT_FORM_ID = 'product-card-form';

type BomInput = {
  componentProductId: string;
  quantity: number;
  componentArticleCode?: string;
  componentName?: string;
};

function mapBomLineInput(line: {
  componentProductId: string;
  quantity: number;
  componentArticleCode?: string;
  componentName?: string;
}): BomInput {
  return {
    componentProductId: line.componentProductId,
    quantity: normalizeBomQty(line.quantity),
    componentArticleCode: line.componentArticleCode,
    componentName: line.componentName,
  };
}

function isBomComponentProduct(product: Product) {
  return product.productType === 'ComponentPart' || product.productType === 'Spare';
}

type FormSnapshot = {
  productType: string;
  name: string;
  description: string;
  unitPrice: string;
  isActive: boolean;
  showBomInQuote: boolean;
  showBomInInvoice: boolean;
  trackInventory: boolean;
  bomLines: BomInput[];
  groupIds: string[];
  warehouseId: string;
  depreciationCategory: string;
  businessUsePercent: string;
};

function snapshotFromState(
  form: {
    productType: string;
    name: string;
    description: string;
    unitPrice: string;
    isActive: boolean;
    showBomInQuote: boolean;
    showBomInInvoice: boolean;
    trackInventory: boolean;
    bomLines: BomInput[];
    depreciationCategory: string;
    businessUsePercent: string;
  },
  groupIds: Set<string>,
  warehouseId: string
): FormSnapshot {
  return {
    productType: form.productType,
    name: form.name,
    description: form.description,
    unitPrice: form.unitPrice,
    isActive: form.isActive,
    showBomInQuote: form.showBomInQuote,
    showBomInInvoice: form.showBomInInvoice,
    trackInventory: form.trackInventory,
    bomLines: form.bomLines.map((b) => ({
      componentProductId: b.componentProductId,
      quantity: normalizeBomQty(b.quantity),
    })),
    groupIds: [...groupIds].sort(),
    warehouseId,
    depreciationCategory: form.depreciationCategory,
    businessUsePercent: form.businessUsePercent,
  };
}

function snapshotsEqual(a: FormSnapshot, b: FormSnapshot): boolean {
  if (
    a.productType !== b.productType ||
    a.name !== b.name ||
    a.description !== b.description ||
    a.unitPrice !== b.unitPrice ||
    a.isActive !== b.isActive ||
    a.showBomInQuote !== b.showBomInQuote ||
    a.showBomInInvoice !== b.showBomInInvoice ||
    a.trackInventory !== b.trackInventory ||
    a.warehouseId !== b.warehouseId ||
    a.depreciationCategory !== b.depreciationCategory ||
    a.businessUsePercent !== b.businessUsePercent
  ) {
    return false;
  }
  if (a.groupIds.length !== b.groupIds.length) return false;
  for (let i = 0; i < a.groupIds.length; i++) {
    if (a.groupIds[i] !== b.groupIds[i]) return false;
  }
  if (a.bomLines.length !== b.bomLines.length) return false;
  for (let i = 0; i < a.bomLines.length; i++) {
    if (
      a.bomLines[i].componentProductId !== b.bomLines[i].componentProductId ||
      a.bomLines[i].quantity !== b.bomLines[i].quantity
    ) {
      return false;
    }
  }
  return true;
}

function normalizeBomQty(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.round(value);
}

function duplicateProductName(name: string): string {
  const suffix = ' (2)';
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

function formatUnitPriceForInput(price: number): string {
  if (!Number.isFinite(price) || price === 0) return '';
  return String(price);
}

function parseUnitPriceInput(value: string): number {
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatMovementCost(value?: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(2)} ₪`;
}

async function syncProductGroupMembership(
  token: string,
  productId: string,
  groups: ProductGroup[],
  selectedGroupIds: Set<string>,
  initialGroupIds: Set<string>
) {
  const changedGroupIds = new Set<string>();
  for (const id of selectedGroupIds) {
    if (!initialGroupIds.has(id)) changedGroupIds.add(id);
  }
  for (const id of initialGroupIds) {
    if (!selectedGroupIds.has(id)) changedGroupIds.add(id);
  }

  for (const groupId of changedGroupIds) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) continue;
    const memberIds = new Set(group.productIds);
    if (selectedGroupIds.has(groupId)) memberIds.add(productId);
    else memberIds.delete(productId);
    await productGroupsApi.setMembers(token, groupId, [...memberIds]);
  }
}

function withGroupIds(product: Product, groupIds: string[]): Product {
  return { ...product, groupIds };
}

function withWarehouse(product: Product, warehouseId: string, warehouses: Warehouse[]): Product {
  const wh = warehouses.find((w) => w.id === warehouseId);
  return { ...product, warehouseId, warehouseName: wh?.name ?? product.warehouseName ?? null };
}

type Props = {
  open: boolean;
  token: string;
  product: Product | null;
  /** Prefill new-item form from an existing product (duplicate draft; not saved until Submit). */
  duplicateFrom?: Product | null;
  nextArticle: string;
  components: Product[];
  initialTab?: 'general' | 'movements' | 'lots';
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  onProductUpdated?: (product: Product) => void;
  /** Called when product groups are created from the card (refresh catalog filters, etc.). */
  onGroupsChanged?: () => void;
  /** Raise above nested pickers (e.g. purchase receipt product picker at z-index 2600). */
  zIndex?: number;
};

export function ProductEditModal({
  open,
  token,
  product,
  duplicateFrom = null,
  nextArticle,
  components,
  initialTab = 'general',
  onClose,
  onSaved,
  onError,
  onProductUpdated,
  onGroupsChanged,
  zIndex,
}: Props) {
  const { t } = useTranslation();
  const [modalError, setModalError] = useState('');
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const baselineRef = useRef<FormSnapshot | null>(null);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const effectiveProduct = product ?? savedProduct;
  const editing = effectiveProduct !== null;
  const [tab, setTab] = useState<'general' | 'movements' | 'lots'>(initialTab);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [loadingLots, setLoadingLots] = useState(false);
  const [previewArticle, setPreviewArticle] = useState(nextArticle);
  const [newArticlePreview, setNewArticlePreview] = useState<string | null>(null);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [initialGroupIds, setInitialGroupIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    productType: 'ComponentPart',
    name: '',
    description: '',
    unitPrice: '',
    isActive: true,
    showBomInQuote: false,
    showBomInInvoice: false,
    trackInventory: false,
    bomLines: [] as BomInput[],
    depreciationCategory: 'PersonalPc',
    businessUsePercent: '100',
  });
  const [baselineKey, setBaselineKey] = useState(0);
  const [bomPickerOpen, setBomPickerOpen] = useState(false);
  const [bomRemoveId, setBomRemoveId] = useState<string | null>(null);
  const [pickerCatalog, setPickerCatalog] = useState<Product[]>([]);

  const isDirty = () => {
    if (!baselineRef.current) return false;
    return !snapshotsEqual(
      baselineRef.current,
      snapshotFromState(form, selectedGroupIds, warehouseId)
    );
  };

  const requestClose = () => {
    if (isDirty()) {
      setUnsavedOpen(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    setModalError('');
    setTab(initialTab);
    setSavedProduct(null);
    if (product) {
      setForm({
        productType: product.productType,
        name: product.name,
        description: product.description ?? '',
        unitPrice: formatUnitPriceForInput(product.unitPrice),
        isActive: product.isActive,
        showBomInQuote: product.showBomInQuote,
        showBomInInvoice: product.showBomInInvoice,
        trackInventory: product.trackInventory,
        bomLines: product.bomLines.map((b) => mapBomLineInput(b)),
        depreciationCategory: product.depreciationCategory ?? 'PersonalPc',
        businessUsePercent: String(product.defaultBusinessUsePercent ?? 100),
      });
    } else if (duplicateFrom) {
      setForm({
        productType: duplicateFrom.productType,
        name: duplicateProductName(duplicateFrom.name),
        description: duplicateFrom.description ?? '',
        unitPrice: formatUnitPriceForInput(duplicateFrom.unitPrice),
        isActive: true,
        showBomInQuote: duplicateFrom.showBomInQuote,
        showBomInInvoice: duplicateFrom.showBomInInvoice,
        trackInventory: duplicateFrom.trackInventory,
        bomLines: duplicateFrom.bomLines.map((b) => mapBomLineInput(b)),
        depreciationCategory: duplicateFrom.depreciationCategory ?? 'PersonalPc',
        businessUsePercent: String(duplicateFrom.defaultBusinessUsePercent ?? 100),
      });
    } else {
      setForm({
        productType: 'ComponentPart',
        name: '',
        description: '',
        unitPrice: '',
        isActive: true,
        showBomInQuote: false,
        showBomInInvoice: false,
        trackInventory: false,
        bomLines: [],
        depreciationCategory: 'PersonalPc',
        businessUsePercent: '100',
      });
    }
    const selectedSeed = product?.groupIds ?? duplicateFrom?.groupIds ?? [];
    setSelectedGroupIds(new Set(selectedSeed));
    // New/duplicate draft: no server membership yet — only existing product keeps initial groups.
    setInitialGroupIds(new Set(product?.groupIds ?? []));
  }, [open, product, duplicateFrom, initialTab]);

  useEffect(() => {
    if (!open || !token) return;
    productGroupsApi.list(token).then(setProductGroups).catch(() => setProductGroups([]));
    warehouseApi.list(token).then(setWarehouses).catch(() => setWarehouses([]));
  }, [open, token]);

  const handleCreateProductGroup = useCallback(
    async (name: string): Promise<ProductGroup | null> => {
      if (!token) return null;
      const created = await productGroupsApi.create(token, name);
      setProductGroups((prev) =>
        [...prev, created].sort((a, b) =>
          a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        )
      );
      onGroupsChanged?.();
      return created;
    },
    [token, onGroupsChanged]
  );

  useEffect(() => {
    if (!open || warehouses.length === 0) return;
    const source = product ?? duplicateFrom;
    const productType = source?.productType ?? 'ComponentPart';
    const nextWarehouseId = resolveProductWarehouseId(productType, warehouses, source?.warehouseId);
    setWarehouseId(nextWarehouseId);
    setBaselineKey((k) => k + 1);
  }, [open, product, duplicateFrom, warehouses]);

  useEffect(() => {
    if (!open) {
      baselineRef.current = null;
      setUnsavedOpen(false);
      setPhotoPreviewOpen(false);
      return;
    }
    baselineRef.current = snapshotFromState(form, selectedGroupIds, warehouseId);
  }, [open, baselineKey]);

  useEffect(() => {
    setPreviewArticle(nextArticle);
  }, [nextArticle, open]);

  useEffect(() => {
    if (!open || editing || !token) return;
    catalogApi.products.peekArticle(token, form.productType).then((r) => setPreviewArticle(r.articleCode));
  }, [form.productType, open, editing, token]);

  useEffect(() => {
    if (!open || !editing || !effectiveProduct || !token) {
      setNewArticlePreview(null);
      return;
    }
    if (form.productType === effectiveProduct.productType || effectiveProduct.hasStockMovements) {
      setNewArticlePreview(null);
      return;
    }
    catalogApi.products.peekArticle(token, form.productType).then((r) => setNewArticlePreview(r.articleCode));
  }, [form.productType, effectiveProduct, editing, open, token]);

  const onProductTypeChange = (productType: string) => {
    const showBom = productType === 'FinishedGood' || productType === 'Bundle';
    setForm((f) => ({
      ...f,
      productType,
      bomLines: showBom ? f.bomLines : [],
      showBomInQuote: showBom ? f.showBomInQuote : false,
      showBomInInvoice: showBom ? f.showBomInInvoice : false,
      trackInventory: productTypeCanTrackStock(productType) ? f.trackInventory : false,
      depreciationCategory: isFixedAssetProductType(productType) ? f.depreciationCategory || 'PersonalPc' : 'PersonalPc',
      businessUsePercent: isFixedAssetProductType(productType) ? f.businessUsePercent || '100' : '100',
    }));
    setWarehouseId(defaultWarehouseForProductType(productType, warehouses));
    if (!productTypeCanTrackStock(productType) && (tab === 'movements' || tab === 'lots')) setTab('general');
  };

  useEffect(() => {
    if (!open || tab !== 'movements' || !effectiveProduct || !token) return;
    setLoadingMovements(true);
    catalogApi.warehouse
      .movements(token, 100, effectiveProduct.id)
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setLoadingMovements(false));
  }, [open, tab, effectiveProduct, token]);

  useEffect(() => {
    if (!open || tab !== 'lots' || !effectiveProduct || !token) return;
    setLoadingLots(true);
    inventoryApi
      .lots(token, { productId: effectiveProduct.id })
      .then(setLots)
      .catch(() => setLots([]))
      .finally(() => setLoadingLots(false));
  }, [open, tab, effectiveProduct, token]);

  const showBom = form.productType === 'FinishedGood' || form.productType === 'Bundle';
  const bomProductFilter = useCallback((p: Product) => isBomComponentProduct(p), []);
  const bomExcludeIds = effectiveProduct ? [effectiveProduct.id] : [];
  const bomExistingPicks = useMemo(
    () =>
      form.bomLines.map((b) => ({
        productId: b.componentProductId,
        quantity: b.quantity,
      })),
    [form.bomLines]
  );

  const resolveBomLineLabel = useCallback(
    (line: BomInput) => {
      const fromComponents = components.find((c) => c.id === line.componentProductId);
      const fromPicker = pickerCatalog.find((c) => c.id === line.componentProductId);
      const article =
        line.componentArticleCode ??
        fromComponents?.articleCode ??
        fromPicker?.articleCode ??
        '—';
      const name = line.componentName ?? fromComponents?.name ?? fromPicker?.name ?? '—';
      return { article, name };
    },
    [components, pickerCatalog]
  );

  const handleBomPicks = (picks: PickedReceiptProduct[]) => {
    setForm((f) => {
      const bomLines = [...f.bomLines];
      for (const pick of picks) {
        const idx = bomLines.findIndex((b) => b.componentProductId === pick.product.id);
        const nextLine: BomInput = {
          componentProductId: pick.product.id,
          quantity: normalizeBomQty(pick.quantity),
          componentArticleCode: pick.product.articleCode,
          componentName: pick.product.name,
        };
        if (idx >= 0) bomLines[idx] = nextLine;
        else bomLines.push(nextLine);
      }
      return { ...f, bomLines };
    });
    setPickerCatalog((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]));
      for (const pick of picks) map.set(pick.product.id, pick.product);
      return [...map.values()];
    });
  };

  const confirmRemoveBomLine = () => {
    if (!bomRemoveId) return;
    setForm((f) => ({
      ...f,
      bomLines: f.bomLines.filter((b) => b.componentProductId !== bomRemoveId),
    }));
    setBomRemoveId(null);
  };
  const tracksStock = productTypeCanTrackStock(form.productType);
  const tracksInventory = productTracksStock({
    productType: form.productType,
    trackInventory: form.trackInventory,
  });
  const typeChanged = editing && effectiveProduct && form.productType !== effectiveProduct.productType;

  const saveProduct = async () => {
    if (!token || saving) return;
    setModalError('');
    setSaving(true);
    try {
      const bomPayload =
        showBom && form.bomLines.length > 0
          ? form.bomLines
              .filter((b) => b.componentProductId)
              .map((b) => ({
                componentProductId: b.componentProductId,
                quantity: normalizeBomQty(b.quantity),
              }))
          : undefined;

      const groupIds = [...selectedGroupIds];
      const warehousePayload =
        tracksStock && form.trackInventory && warehouseId ? { warehouseId } : { warehouseId: null };

      const faPayload = isFixedAssetProductType(form.productType)
        ? {
            depreciationCategory: form.depreciationCategory,
            defaultBusinessUsePercent: Number(form.businessUsePercent) || 100,
          }
        : {
            depreciationCategory: null,
            defaultBusinessUsePercent: null,
          };

      if (effectiveProduct) {
        const updated = await catalogApi.products.update(token, effectiveProduct.id, {
          productType: form.productType,
          name: form.name,
          description: form.description || null,
          unitPrice: parseUnitPriceInput(form.unitPrice),
          showBomInQuote: form.showBomInQuote,
          showBomInInvoice: form.showBomInInvoice,
          trackInventory: tracksStock && form.trackInventory,
          isActive: form.isActive,
          bomLines: showBom ? bomPayload ?? [] : undefined,
          version: effectiveProduct.version,
          ...warehousePayload,
          ...faPayload,
        });
        await syncProductGroupMembership(
          token,
          updated.id,
          productGroups,
          selectedGroupIds,
          initialGroupIds
        );
        const saved = withWarehouse(withGroupIds(updated, groupIds), warehouseId, warehouses);
        setSavedProduct(saved);
        setInitialGroupIds(new Set(groupIds));
        onProductUpdated?.(saved);
        const originalActive = product?.isActive ?? baselineRef.current?.isActive ?? true;
        const saveMessage =
          originalActive !== saved.isActive
            ? saved.isActive
              ? t('products.activated', { article: saved.articleCode })
              : t('products.deactivated', { article: saved.articleCode })
            : t('products.updated', { article: saved.articleCode });
        onSaved(saveMessage);
        baselineRef.current = snapshotFromState(form, selectedGroupIds, warehouseId);
      } else {
        const created = await catalogApi.products.create(token, {
          productType: form.productType,
          name: form.name,
          description: form.description || null,
          unitPrice: parseUnitPriceInput(form.unitPrice),
          showBomInQuote: form.showBomInQuote,
          showBomInInvoice: form.showBomInInvoice,
          trackInventory: tracksStock && form.trackInventory,
          bomLines: bomPayload,
          ...warehousePayload,
          ...faPayload,
        });
        if (groupIds.length > 0) {
          await syncProductGroupMembership(
            token,
            created.id,
            productGroups,
            selectedGroupIds,
            initialGroupIds
          );
        }
        const saved = withWarehouse(withGroupIds(created, groupIds), warehouseId, warehouses);
        setSavedProduct(saved);
        setInitialGroupIds(new Set(groupIds));
        onProductUpdated?.(saved);
        onSaved(t('products.createdAddPhoto'));
        baselineRef.current = snapshotFromState(form, selectedGroupIds, warehouseId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      setModalError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await saveProduct();
  };

  const selectedWarehouseName =
    warehouses.find((w) => w.id === warehouseId)?.name ?? effectiveProduct?.warehouseName ?? '';

  return (
    <AppModal
      open={open}
      onClose={requestClose}
      className="product-card-modal"
      overlayClassName={
        zIndex !== undefined ? 'product-card-overlay product-card-overlay--stacked' : 'product-card-overlay'
      }
      zIndex={zIndex}
      noCard
      resize={PRODUCT_CARD_RESIZE}
      preventClose={saving || unsavedOpen}
      closeOnEscape={!unsavedOpen && !photoPreviewOpen}
    >
        <div className="product-card-header">
          <h2>{t('products.cardTitle')}</h2>
          <button type="button" className="product-card-close" onClick={requestClose} aria-label={t('products.close')}>
            ×
          </button>
        </div>

        <div className="product-card-identity">
          <div className="product-card-title-block">
            <strong className="product-card-name">
              <BidiText as="span">{form.name || t('products.newItem')}</BidiText>
            </strong>
            <span className="muted product-card-sku">
              {t('products.article')}:{' '}
              {effectiveProduct
                ? typeChanged && newArticlePreview
                  ? `${effectiveProduct.articleCode} → ${newArticlePreview}`
                  : effectiveProduct.articleCode
                : previewArticle}
              {effectiveProduct?.legacySku && (
                <> · {t('products.legacySku')}: {effectiveProduct.legacySku}</>
              )}
            </span>
          </div>
          <ProductPhotoEditor
            product={effectiveProduct}
            token={token}
            canEdit={!!effectiveProduct}
            lightboxZIndex={zIndex !== undefined ? zIndex + 150 : undefined}
            onPreviewOpenChange={setPhotoPreviewOpen}
            onUpdated={(p) => {
              setSavedProduct(p);
              onProductUpdated?.(p);
            }}
            onError={(msg) => {
              setModalError(msg);
              onError(msg);
            }}
          />
        </div>

        <div className="product-card-tabs">
          <button
            type="button"
            className={tab === 'general' ? 'active' : ''}
            onClick={() => setTab('general')}
          >
            {t('products.tabGeneral')}
          </button>
          {editing && tracksStock && (
            <button
              type="button"
              className={tab === 'lots' ? 'active' : ''}
              onClick={() => setTab('lots')}
            >
              {t('products.tabLots')}
            </button>
          )}
          {editing && tracksStock && (
            <button
              type="button"
              className={tab === 'movements' ? 'active' : ''}
              onClick={() => setTab('movements')}
            >
              {t('products.tabMovements')}
            </button>
          )}
        </div>

        {tab === 'general' && (
          <>
          <div className="product-card-scroll">
          <form id={PRODUCT_FORM_ID} className="product-card-form" onSubmit={onSubmit}>
            {modalError && <div className="error-banner">{modalError}</div>}
            {duplicateFrom && !product && (
              <p className="type-change-note type-change-note-info">{t('products.duplicateDraftHint')}</p>
            )}
            <label className="toggle-active">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <span>{t('products.activeItem')}</span>
            </label>

            <ProductTypeSelect
              value={form.productType}
              onChange={onProductTypeChange}
            />
            {isFixedAssetProductType(form.productType) && (
              <div className="product-form-grid">
                <label>
                  {t('products.depreciationCategory')}
                  <select
                    value={form.depreciationCategory}
                    onChange={(e) => setForm({ ...form, depreciationCategory: e.target.value })}
                  >
                    {DEPRECIATION_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {t(`depreciationCategory.${cat}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('products.businessUsePercent')}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={form.businessUsePercent}
                    onChange={(e) => setForm({ ...form, businessUsePercent: e.target.value })}
                  />
                </label>
              </div>
            )}
            {typeChanged && effectiveProduct?.hasStockMovements && (
              <p className="type-change-note">
                {t('products.typeChangeArticleKept', { article: effectiveProduct.articleCode })}
              </p>
            )}
            {typeChanged && effectiveProduct && !effectiveProduct.hasStockMovements && newArticlePreview && (
              <p className="type-change-note type-change-note-info">
                {t('products.typeChangeNewArticle', { article: newArticlePreview })}
              </p>
            )}
            {typeChanged && effectiveProduct && !productTypeCanTrackStock(form.productType) && (effectiveProduct.stockQuantity ?? 0) > 0 && (
              <p className="type-change-note">{t('products.typeChangeZeroStock')}</p>
            )}

            <label>
              {t('products.name')} *
              <input
                {...bidiAutoInputProps}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>

            <label>
              {t('products.description')}
              <textarea
                {...bidiAutoInputProps}
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="product-form-grid">
              <label>
                {t('products.price')} (₪)
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={form.unitPrice}
                  onChange={(e) => {
                    const v = e.target.value.replace(',', '.');
                    if (v === '' || /^\d*\.?\d*$/.test(v)) {
                      setForm({ ...form, unitPrice: v });
                    }
                  }}
                />
              </label>
              <label>
                {t('products.currency')}
                <select disabled>
                  <option>₪ ILS</option>
                </select>
              </label>
            </div>

            {tracksStock && (
              <label className="checkbox-row product-track-inventory-row">
                <input
                  type="checkbox"
                  checked={form.trackInventory}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm({ ...form, trackInventory: checked });
                    if (checked && !warehouseId) {
                      setWarehouseId(defaultWarehouseForProductType(form.productType, warehouses));
                    }
                  }}
                />
                {t('products.trackInventory')}
              </label>
            )}

            <div className="product-card-select-row">
              {tracksInventory && (
                <ProductWarehouseSelect
                  warehouses={warehouses}
                  value={warehouseId}
                  onChange={setWarehouseId}
                />
              )}

              <ProductGroupsMultiSelect
                groups={productGroups}
                selectedGroupIds={selectedGroupIds}
                onChange={setSelectedGroupIds}
                onCreateGroup={handleCreateProductGroup}
              />
            </div>

            {tracksInventory && editing && (
              <div className="inventory-box">
                <strong>{t('products.inventoryTitle')}</strong>
                <div className="inventory-row">
                  <span>{selectedWarehouseName}</span>
                  <strong>{formatStockQuantity(effectiveProduct?.stockQuantity)}</strong>
                </div>
              </div>
            )}

            {showBom && (
              <div className="bom-block">
                <strong className="bom-block-title">{t('products.bom')}</strong>
                <div className="bom-checkboxes">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.showBomInQuote}
                      onChange={(e) =>
                        setForm({ ...form, showBomInQuote: e.target.checked })
                      }
                    />
                    {t('products.showBomQuote')}
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.showBomInInvoice}
                      onChange={(e) =>
                        setForm({ ...form, showBomInInvoice: e.target.checked })
                      }
                    />
                    {t('products.showBomInvoice')}
                  </label>
                </div>
                <div className="bom-lines-panel">
                  {form.bomLines.length > 0 && (
                    <div className="bom-lines-table">
                      <div className="bom-lines-head">
                        <span>{t('products.bomColArticle')}</span>
                        <span>{t('products.bomColName')}</span>
                        <span>{t('products.bomColQty')}</span>
                        <span aria-hidden />
                      </div>
                      {form.bomLines.map((line) => {
                        const { article, name } = resolveBomLineLabel(line);
                        return (
                          <div key={line.componentProductId} className="bom-lines-row">
                            <code className="bom-lines-article">{article}</code>
                            <span className="bom-lines-name">
                              <BidiText as="span">{name}</BidiText>
                            </span>
                            <input
                              type="number"
                              className="bom-lines-qty"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              aria-label={t('products.bomColQty')}
                              title={t('products.bomColQty')}
                              value={line.quantity}
                              onChange={(e) => {
                                const parsed = Number(e.target.value);
                                setForm((f) => ({
                                  ...f,
                                  bomLines: f.bomLines.map((b) =>
                                    b.componentProductId === line.componentProductId
                                      ? { ...b, quantity: normalizeBomQty(parsed) }
                                      : b
                                  ),
                                }));
                              }}
                            />
                            <button
                              type="button"
                              className="bom-row-remove"
                              aria-label={t('products.removeBomComponent')}
                              title={t('products.removeBomComponent')}
                              onClick={() => setBomRemoveId(line.componentProductId)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setBomPickerOpen(true)}
                >
                  + {t('products.addComponents')}
                </button>
              </div>
            )}

          </form>
          </div>
          <div className="product-card-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={requestClose} disabled={saving}>
              {t('products.close')}
            </button>
            <button type="submit" form={PRODUCT_FORM_ID} className="btn btn-save" disabled={saving}>
              {saving ? t('settings.saving') : t('products.saveChanges')}
            </button>
          </div>
          </>
        )}

        {tab === 'movements' && editing && (
          <>
          <div className="product-card-scroll">
          <div className="product-movements-panel">
            {loadingMovements && <p className="muted">{t('products.loading')}</p>}
            {!loadingMovements && movements.length === 0 && (
              <p className="muted">{t('products.noMovements')}</p>
            )}
            {!loadingMovements && movements.length > 0 && (
              <table className="data-table data-table-compact">
                <thead>
                  <tr>
                    <th>{t('warehouse.type')}</th>
                    <th>{t('warehouse.qty')}</th>
                    <th>{t('products.movementUnitCost')}</th>
                    <th>{t('warehouse.after')}</th>
                    <th>{t('warehouse.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {t(`warehouse.moveTypes.${m.movementType}`, {
                          defaultValue: m.movementType,
                        })}
                      </td>
                      <td>{formatStockQuantity(m.quantity)}</td>
                      <td>{formatMovementCost(m.unitCostIls)}</td>
                      <td>{formatStockQuantity(m.balanceAfter)}</td>
                      <td>{new Date(m.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
          <div className="product-card-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={requestClose} disabled={saving}>
              {t('products.close')}
            </button>
          </div>
          </>
        )}

        {tab === 'lots' && editing && (
          <>
          <div className="product-card-scroll">
          <div className="product-movements-panel">
            <p className="muted product-lots-hint">{t('products.lotsHint')}</p>
            {loadingLots && <p className="muted">{t('products.loading')}</p>}
            {!loadingLots && lots.length === 0 && (
              <p className="muted">{t('products.noLots')}</p>
            )}
            {!loadingLots && lots.length > 0 && (
              <table className="data-table data-table-compact">
                <thead>
                  <tr>
                    <th>{t('products.warehouseCol')}</th>
                    <th>{t('inventory.lotReceivedAt')}</th>
                    <th>{t('inventory.lotSource')}</th>
                    <th>{t('purchaseReceipts.colNumber')}</th>
                    <th>{t('warehouse.qty')}</th>
                    <th>{t('inventory.unitCostIls')}</th>
                    <th>{t('purchaseReceipts.lineSum')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.id}>
                      <td className="bidi-auto">{lot.warehouseName}</td>
                      <td>{lot.receivedAt}</td>
                      <td>{formatInventoryLotSourceKind(lot, t)}</td>
                      <td>
                        {lot.sourceReceiptId && lot.sourceReceiptNumber ? (
                          <Link
                            to={`/purchase-receipts/${lot.sourceReceiptId}`}
                            className="btn-link"
                            onClick={onClose}
                          >
                            {lot.sourceReceiptNumber}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatStockQuantity(lot.quantityRemaining)}</td>
                      <td>{lot.unitCostIls.toFixed(2)}</td>
                      <td>{lot.totalValueIls.toFixed(2)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </div>
          <div className="product-card-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={requestClose} disabled={saving}>
              {t('products.close')}
            </button>
          </div>
          </>
        )}

      <PurchaseReceiptProductPickerModal
        open={bomPickerOpen}
        token={token}
        products={components}
        groups={productGroups}
        titleKey="products.bomPickerTitle"
        excludeProductIds={bomExcludeIds}
        productFilter={bomProductFilter}
        initialFilterKind="goods"
        initialFilterType="ComponentPart"
        existingPicks={bomExistingPicks}
        resizeConfig={BOM_COMPONENT_PICKER_RESIZE}
        overlayZIndex={(zIndex ?? 2000) + 500}
        nestedProductModalZIndex={(zIndex ?? 2000) + 700}
        onClose={() => setBomPickerOpen(false)}
        onSave={handleBomPicks}
        onProductCreated={(p) => {
          setPickerCatalog((prev) => {
            const next = prev.some((x) => x.id === p.id) ? prev : [...prev, p];
            return next;
          });
        }}
      />

      <ConfirmDialog
        open={bomRemoveId !== null}
        title={t('products.removeBomComponentTitle')}
        message={t('products.removeBomComponentConfirm')}
        confirmLabel={t('products.removeBomComponent')}
        cancelLabel={t('settings.cancel')}
        danger
        zIndex={(zIndex ?? 2000) + 400}
        onConfirm={confirmRemoveBomLine}
        onCancel={() => setBomRemoveId(null)}
      />

      <UnsavedLeaveDialog
        open={unsavedOpen}
        title={t('products.unsavedTitle')}
        message={t('products.unsavedCloseMessage')}
        saveLabel={t('products.saveChanges')}
        discardLabel={t('products.unsavedDiscard')}
        cancelLabel={t('settings.cancel')}
        busy={saving}
        zIndex={zIndex !== undefined ? zIndex + 100 : undefined}
        onSave={() => {
          setUnsavedOpen(false);
          setTab('general');
          void saveProduct();
        }}
        onDiscard={() => {
          setUnsavedOpen(false);
          onClose();
        }}
        onCancel={() => setUnsavedOpen(false)}
      />
    </AppModal>
  );
}
