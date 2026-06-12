import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { catalogApi, PRODUCT_TYPES, type Product } from '../../api/catalog';
import type { ProductGroup } from '../../api/productGroups';
import { ProductEditModal } from '../products/ProductEditModal';
import { BidiText } from '../BidiText';
import {
  matchesProductKindFilter,
  type ProductKindFilter,
  isServiceProductType,
} from '../../lib/productKind';
import { productTracksStock } from '../../lib/productInventory';
import {
  finalizePriceDraft,
  finalizeQuantityDraft,
  normalizeStockQuantity,
  sanitizePriceDraft,
  sanitizeQuantityDraft,
} from '../../lib/stockQuantity';
import { PURCHASE_RECEIPT_PICKER_RESIZE } from '../../lib/resizablePanelKeys';
import type { ResizablePanelConfig } from '../../lib/modalSize';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { ModalResizeHandles } from '../ui/ModalResizeHandles';
import '../../styles/documents.css';
import '../../styles/purchase-receipts.css';

export type PickedReceiptProduct = {
  product: Product;
  quantity: number;
  unitPrice?: number;
};

type RowDraft = { quantity: string; unitPrice?: string };

const EMPTY_EXISTING_PICKS: readonly { productId: string; quantity: number }[] = [];

type Props = {
  open: boolean;
  token: string;
  products: Product[];
  groups: ProductGroup[];
  replaceMode?: boolean;
  initialSelectedProductId?: string | null;
  titleKey?: string;
  excludeProductIds?: readonly string[];
  productFilter?: (product: Product) => boolean;
  initialFilterKind?: ProductKindFilter;
  initialFilterType?: string;
  /** Products already in the parent list (e.g. BOM) — shown with a green marker when reopening. */
  existingPicks?: readonly { productId: string; quantity: number }[];
  resizeConfig?: ResizablePanelConfig;
  overlayZIndex?: number;
  nestedProductModalZIndex?: number;
  /** Sales documents: editable unit price column. */
  showUnitPrice?: boolean;
  newProductType?: string;
  onClose: () => void;
  onSave: (picks: PickedReceiptProduct[]) => void;
  onProductCreated: (product: Product) => void;
};

function draftForProduct(product?: Product, showUnitPrice?: boolean): RowDraft {
  const draft: RowDraft = { quantity: '1' };
  if (showUnitPrice) {
    draft.unitPrice = String(product?.unitPrice ?? 0);
  }
  return draft;
}

export function PurchaseReceiptProductPickerModal({
  open,
  token,
  products,
  groups,
  replaceMode = false,
  initialSelectedProductId = null,
  titleKey = 'purchaseReceipts.pickerTitle',
  excludeProductIds = [],
  productFilter,
  initialFilterKind = '',
  initialFilterType = '',
  existingPicks = EMPTY_EXISTING_PICKS,
  resizeConfig = PURCHASE_RECEIPT_PICKER_RESIZE,
  overlayZIndex,
  nestedProductModalZIndex = 2700,
  showUnitPrice = false,
  newProductType = 'ComponentPart',
  onClose,
  onSave,
  onProductCreated,
}: Props) {
  const { t } = useTranslation();
  const { panelRef, resizable, persistSize, onResizeHandleMouseDown } = useResizablePanel(
    open,
    resizeConfig
  );
  const [search, setSearch] = useState('');
  const [filterKind, setFilterKind] = useState<ProductKindFilter>('');
  const [filterType, setFilterType] = useState('');
  const [filterGroupId, setFilterGroupId] = useState('');
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [nextArticle, setNextArticle] = useState('');
  const [components, setComponents] = useState<Product[]>([]);
  const [productModalMsg, setProductModalMsg] = useState('');
  const productsRef = useRef(products);
  const searchInputRef = useRef<HTMLInputElement>(null);
  productsRef.current = products;
  const wasOpenRef = useRef(false);

  const existingPickMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const pick of existingPicks) map.set(pick.productId, pick.quantity);
    return map;
  }, [existingPicks]);

  const existingProductIds = useMemo(
    () => new Set(existingPickMap.keys()),
    [existingPickMap]
  );

  const existingPicksKey = useMemo(
    () => existingPicks.map((p) => `${p.productId}\t${p.quantity}`).join('\n'),
    [existingPicks]
  );

  useEffect(() => {
    if (!open || !token) {
      wasOpenRef.current = false;
      return;
    }

    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;

    if (justOpened) {
      setSearch('');
      setFilterKind(initialFilterKind);
      setFilterType(initialFilterType);
      setFilterGroupId('');
      setProductModalMsg('');
      setSelectedIds(initialSelectedProductId ? new Set([initialSelectedProductId]) : new Set());
    }
  }, [open, token, initialSelectedProductId, initialFilterKind, initialFilterType]);

  useEffect(() => {
    if (!open || existingPicks.length === 0) return;
    setRowDrafts((prev) => {
      const next = { ...prev };
      for (const pick of existingPicks) {
        next[pick.productId] = { quantity: String(normalizeStockQuantity(pick.quantity)) };
      }
      return next;
    });
  }, [open, existingPicksKey, existingPicks]);

  useEffect(() => {
    if (!open || !token) return;
    setLoadingCatalog(true);
    catalogApi.products
      .list(token, undefined, true)
      .then((list) => {
        setCatalogProducts(
          [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
        );
      })
      .catch(() => {
        setCatalogProducts(
          [...productsRef.current].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
          )
        );
      })
      .finally(() => setLoadingCatalog(false));
  }, [open, token]);

  useEffect(() => {
    if (!open) return;
    setRowDrafts((prev) => {
      const next = { ...prev };
      for (const p of catalogProducts) {
        if (!next[p.id]) {
          next[p.id] = draftForProduct(p, showUnitPrice);
        }
      }
      return next;
    });
  }, [open, catalogProducts, showUnitPrice]);

  const excludedIds = useMemo(() => new Set(excludeProductIds), [excludeProductIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogProducts.filter((p) => {
      if (excludedIds.has(p.id)) return false;
      if (productFilter && !productFilter(p)) return false;
      if (filterType && p.productType !== filterType) return false;
      if (!matchesProductKindFilter(p.productType, filterKind)) return false;
      if (filterGroupId && !p.groupIds.includes(filterGroupId)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.articleCode.toLowerCase().includes(q) ||
        (p.legacySku?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [catalogProducts, search, filterKind, filterType, filterGroupId, excludedIds, productFilter]);

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setRowDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const changeQty = (id: string, delta: number) => {
    const cur = finalizeQuantityDraft(rowDrafts[id]?.quantity ?? '1');
    updateDraft(id, { quantity: String(Math.max(1, normalizeStockQuantity(cur + delta))) });
  };

  const finalizeQtyDraft = (id: string, raw: string) => {
    const q = raw.trim();
    const finalized = q === '' ? '1' : String(finalizeQuantityDraft(q));
    updateDraft(id, { quantity: finalized });
    return finalized;
  };

  const selectProduct = (p: Product) => {
    setSelectedIds((prev) => {
      if (replaceMode) return new Set([p.id]);
      const next = new Set(prev);
      next.add(p.id);
      return next;
    });
  };

  const toggleSelect = (p: Product) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (replaceMode) {
        if (next.has(p.id)) next.delete(p.id);
        else {
          next.clear();
          next.add(p.id);
        }
        return next;
      }
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
  };

  const handleQtyEnter = (p: Product, draft: RowDraft) => {
    finalizeQtyDraft(p.id, draft.quantity);
    selectProduct(p);
  };

  const handleSave = () => {
    const picks: PickedReceiptProduct[] = [];
    for (const id of selectedIds) {
      const p = catalogProducts.find((x) => x.id === id);
      const draft = rowDrafts[id];
      if (!p || !draft) continue;
      picks.push({
        product: p,
        quantity: finalizeQuantityDraft(draft.quantity),
        unitPrice: showUnitPrice ? finalizePriceDraft(draft.unitPrice ?? '0') : undefined,
      });
    }
    if (picks.length) onSave(picks);
    persistSize();
    onClose();
  };

  const handleClose = () => {
    persistSize();
    onClose();
  };

  const openNewProduct = useCallback(async () => {
    if (!token) return;
    try {
      const r = await catalogApi.products.peekArticle(token, newProductType);
      setNextArticle(r.articleCode);
      const comps = await catalogApi.products.list(token, newProductType, true);
      setComponents(comps);
      setNewProductOpen(true);
    } catch {
      setComponents([]);
      setNewProductOpen(true);
    }
  }, [token, newProductType]);

  const colCount = showUnitPrice ? 8 : 7;

  if (!open) return null;

  return createPortal(
    <>
      <div
        className="doc-picker-overlay pr-picker-overlay"
        style={overlayZIndex !== undefined ? { zIndex: overlayZIndex } : undefined}
        role="presentation"
      >
        <div
          ref={panelRef}
          className={`doc-picker-modal doc-picker-modal--wide pr-picker-modal${resizable ? ' doc-picker-modal--resizable' : ''}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pr-picker-title"
        >
          <header className="doc-picker-header">
            <button type="button" className="doc-picker-close" onClick={handleClose} aria-label={t('products.close')}>
              ×
            </button>
            <h2 id="pr-picker-title">{t(titleKey)}</h2>
          </header>

          <div className="doc-picker-toolbar pr-picker-toolbar">
            <button type="button" className="btn btn-secondary doc-btn-sm" onClick={() => void openNewProduct()}>
              + {t('purchaseReceipts.pickerNewItem')}
            </button>
            <div className="doc-picker-filters doc-picker-filters--grow">
              <label className="pr-picker-filter pr-picker-filter--search">
                <span className="doc-picker-filters-label">{t('purchaseReceipts.pickerSearch')}</span>
                <div className="doc-picker-search-field">
                  <input
                    ref={searchInputRef}
                    type="text"
                    inputMode="search"
                    autoComplete="off"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('purchaseReceipts.pickerSearchPlaceholder')}
                  />
                  {search && (
                    <button
                      type="button"
                      className="doc-picker-search-clear"
                      onClick={() => {
                        setSearch('');
                        searchInputRef.current?.focus();
                      }}
                      aria-label={t('purchaseReceipts.pickerClearSearch')}
                    >
                      ×
                    </button>
                  )}
                </div>
              </label>
              <label className="pr-picker-filter">
                <span className="doc-picker-filters-label">{t('purchaseReceipts.pickerGroupLabel')}</span>
                <select value={filterGroupId} onChange={(e) => setFilterGroupId(e.target.value)}>
                  <option value="">{t('purchaseReceipts.pickerGroupAll')}</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pr-picker-filter">
                <span className="doc-picker-filters-label">{t('products.typesLabel')}</span>
                <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                  <option value="">{t('purchaseReceipts.pickerTypeAll')}</option>
                  {PRODUCT_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {t(`products.types.${pt}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pr-picker-filter">
                <span className="doc-picker-filters-label">{t('products.kindLabel')}</span>
                <select value={filterKind} onChange={(e) => setFilterKind(e.target.value as ProductKindFilter)}>
                  <option value="">{t('purchaseReceipts.pickerKindAll')}</option>
                  <option value="goods">{t('products.kindGoods')}</option>
                  <option value="service">{t('products.kindService')}</option>
                </select>
              </label>
            </div>
          </div>

          {productModalMsg && <div className="success-banner pr-picker-banner">{productModalMsg}</div>}

          <div className="doc-picker-table-wrap">
            <table className="doc-picker-table pr-picker-table">
              <thead>
                <tr>
                  <th>{t('products.articleCol')}</th>
                  <th>{t('purchaseReceipts.product')}</th>
                  <th>{t('products.kindLabel')}</th>
                  <th>{t('products.typesLabel')}</th>
                  <th>{t('purchaseReceipts.pickerStock')}</th>
                  {showUnitPrice && <th>{t('products.price')}</th>}
                  <th>{t('purchaseReceipts.pickerQty')}</th>
                  <th>{t('purchaseReceipts.pickerSelect')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingCatalog && (
                  <tr>
                    <td colSpan={colCount} className="muted doc-picker-empty">
                      {t('products.loading')}
                    </td>
                  </tr>
                )}
                {!loadingCatalog && filtered.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="muted doc-picker-empty">
                      {t('products.empty')}
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
                  const draft = rowDrafts[p.id] ?? draftForProduct(p, showUnitPrice);
                  const isSelected = selectedIds.has(p.id);
                  const isAlreadyAdded = existingProductIds.has(p.id);
                  const isService = isServiceProductType(p.productType);
                  const showStock = productTracksStock(p);
                  const stock = p.stockQuantity ?? 0;
                  return (
                    <tr
                      key={p.id}
                      className={[
                        isSelected ? 'doc-picker-row-selected' : '',
                        isAlreadyAdded ? 'doc-picker-row-already-added' : '',
                        !p.isActive ? 'pr-picker-row-inactive' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td>
                        {isAlreadyAdded && (
                          <span
                            className="doc-picker-added-mark"
                            title={t('products.bomInComposition')}
                            aria-label={t('products.bomInComposition')}
                          >
                            ✓
                          </span>
                        )}
                        <code>{p.articleCode}</code>
                      </td>
                      <td className="doc-picker-name">
                        <BidiText as="span">{p.name}</BidiText>
                        {!p.isActive && (
                          <span className="pr-picker-inactive-tag muted">
                            {' '}
                            ({t('purchaseReceipts.pickerInactive')})
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`pr-kind-badge${isService ? ' pr-kind-badge--service' : ' pr-kind-badge--goods'}`}
                        >
                          {isService ? t('products.kindService') : t('products.kindGoods')}
                        </span>
                      </td>
                      <td className="pr-picker-type-cell">{t(`products.types.${p.productType}`)}</td>
                      <td className={showStock && stock <= 0 ? 'doc-picker-stock-zero' : ''}>
                        {showStock
                          ? stock > 0
                            ? normalizeStockQuantity(stock)
                            : t('purchaseReceipts.pickerNoStock')
                          : '—'}
                      </td>
                      {showUnitPrice && (
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            className="doc-picker-price-input"
                            value={draft.unitPrice ?? '0'}
                            onChange={(e) =>
                              updateDraft(p.id, { unitPrice: sanitizePriceDraft(e.target.value) })
                            }
                            onBlur={() =>
                              updateDraft(p.id, {
                                unitPrice: String(finalizePriceDraft(draft.unitPrice ?? '')),
                              })
                            }
                          />
                        </td>
                      )}
                      <td>
                        <div className="doc-picker-qty-control">
                          <button type="button" onClick={() => changeQty(p.id, -1)} aria-label="−">
                            −
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={draft.quantity}
                            onChange={(e) =>
                              updateDraft(p.id, { quantity: sanitizeQuantityDraft(e.target.value) })
                            }
                            onBlur={() => {
                              finalizeQtyDraft(p.id, draft.quantity);
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              handleQtyEnter(p, draft);
                            }}
                          />
                          <button type="button" onClick={() => changeQty(p.id, 1)} aria-label="+">
                            +
                          </button>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={[
                            'doc-picker-select-btn',
                            isSelected ? 'is-selected' : '',
                            isAlreadyAdded && !isSelected ? 'is-already-added' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => toggleSelect(p)}
                        >
                          {isAlreadyAdded && !isSelected
                            ? `✓ ${t('products.bomInComposition')}`
                            : `+ ${t('purchaseReceipts.pickerSelectItem')}`}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="doc-picker-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={handleClose}>
              {t('products.close')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={selectedIds.size === 0}
            >
              {t('purchaseReceipts.pickerSave')}
              {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </footer>
          {resizable && <ModalResizeHandles onMouseDown={onResizeHandleMouseDown} />}
        </div>
      </div>

      <ProductEditModal
        open={newProductOpen}
        token={token}
        product={null}
        nextArticle={nextArticle}
        components={components}
        zIndex={nestedProductModalZIndex}
        onClose={() => setNewProductOpen(false)}
        onSaved={(msg) => setProductModalMsg(msg)}
        onError={() => {}}
        onProductUpdated={(p) => {
          onProductCreated(p);
          setCatalogProducts((prev) => {
            const next = prev.some((x) => x.id === p.id)
              ? prev.map((x) => (x.id === p.id ? p : x))
              : [...prev, p];
            return [...next].sort((a, b) =>
              a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
            );
          });
          setRowDrafts((prev) => ({
            ...prev,
            [p.id]: draftForProduct(p, showUnitPrice),
          }));
        }}
      />
    </>,
    document.body
  );
}
