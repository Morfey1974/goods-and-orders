import { useCallback, useEffect, useMemo, useState } from 'react';

import { createPortal } from 'react-dom';

import { useTranslation } from 'react-i18next';

import { catalogApi, PRODUCT_TYPES, type Product } from '../../api/catalog';

import type { ProductGroup } from '../../api/productGroups';

import { ProductEditModal } from '../products/ProductEditModal';

import {

  matchesProductKindFilter,

  type ProductKindFilter,

  isServiceProductType,

} from '../../lib/productKind';

import { productTracksStock } from '../../lib/productInventory';

import { normalizeStockQuantity } from '../../lib/stockQuantity';

import '../../styles/documents.css';



export type PickedReceiptProduct = {

  product: Product;

  quantity: number;

  unitPrice: number;

};



type RowDraft = { quantity: number; unitPrice: number };



type Props = {

  open: boolean;

  token: string;

  products: Product[];

  groups: ProductGroup[];

  /** Replace one line — only one product can be marked; Save updates that line. */

  replaceMode?: boolean;

  initialSelectedProductId?: string | null;

  onClose: () => void;

  onSave: (picks: PickedReceiptProduct[]) => void;

  onProductCreated: (product: Product) => void;

};



export function PurchaseReceiptProductPickerModal({

  open,

  token,

  products,

  groups,

  replaceMode = false,

  initialSelectedProductId = null,

  onClose,

  onSave,

  onProductCreated,

}: Props) {

  const { t } = useTranslation();

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



  useEffect(() => {

    if (!open || !token) return;

    setSearch('');

    setFilterKind('');

    setFilterType('');

    setFilterGroupId('');

    setProductModalMsg('');

    setSelectedIds(

      initialSelectedProductId ? new Set([initialSelectedProductId]) : new Set()

    );

    setLoadingCatalog(true);

    catalogApi.products

      .list(token, undefined, true)

      .then((list) => {

        setCatalogProducts(

          [...list].sort((a, b) =>

            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

          )

        );

      })

      .catch(() => {

        setCatalogProducts(

          [...products].sort((a, b) =>

            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

          )

        );

      })

      .finally(() => setLoadingCatalog(false));

  }, [open, token, initialSelectedProductId]);



  useEffect(() => {

    if (!open) return;

    setRowDrafts((prev) => {

      const next = { ...prev };

      for (const p of catalogProducts) {

        if (!next[p.id]) {

          next[p.id] = { quantity: 1, unitPrice: p.unitPrice };

        }

      }

      return next;

    });

  }, [open, catalogProducts]);



  const filtered = useMemo(() => {

    const q = search.trim().toLowerCase();

    return catalogProducts.filter((p) => {

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

  }, [catalogProducts, search, filterKind, filterType, filterGroupId]);



  const updateDraft = (id: string, patch: Partial<RowDraft>) => {

    setRowDrafts((prev) => ({

      ...prev,

      [id]: { ...prev[id], ...patch },

    }));

  };



  const changeQty = (id: string, delta: number) => {

    const cur = rowDrafts[id]?.quantity ?? 1;

    updateDraft(id, { quantity: Math.max(1, normalizeStockQuantity(cur + delta)) });

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



  const handleSave = () => {

    const picks: PickedReceiptProduct[] = [];

    for (const id of selectedIds) {

      const p = catalogProducts.find((x) => x.id === id);

      const draft = rowDrafts[id];

      if (!p || !draft) continue;

      picks.push({

        product: p,

        quantity: normalizeStockQuantity(draft.quantity),

        unitPrice: draft.unitPrice,

      });

    }

    if (picks.length) onSave(picks);

    onClose();

  };



  const openNewProduct = useCallback(async () => {

    if (!token) return;

    try {

      const r = await catalogApi.products.peekArticle(token, 'ComponentPart');

      setNextArticle(r.articleCode);

      const comps = await catalogApi.products.list(token, 'ComponentPart', true);

      setComponents(comps);

      setNewProductOpen(true);

    } catch {

      setComponents([]);

      setNewProductOpen(true);

    }

  }, [token]);



  if (!open) return null;



  return createPortal(

    <>

      <div className="doc-picker-overlay pr-picker-overlay" role="presentation">

        <div

          className="doc-picker-modal doc-picker-modal--wide pr-picker-modal"

          onClick={(e) => e.stopPropagation()}

          role="dialog"

          aria-modal="true"

          aria-labelledby="pr-picker-title"

        >

          <header className="doc-picker-header">

            <button type="button" className="doc-picker-close" onClick={onClose} aria-label={t('products.close')}>

              ×

            </button>

            <h2 id="pr-picker-title">{t('purchaseReceipts.pickerTitle')}</h2>

          </header>



          <div className="doc-picker-toolbar pr-picker-toolbar">

            <button type="button" className="btn btn-secondary doc-btn-sm" onClick={() => void openNewProduct()}>

              + {t('purchaseReceipts.pickerNewItem')}

            </button>

            <div className="doc-picker-filters doc-picker-filters--grow">

              <label className="pr-picker-filter">

                <span className="doc-picker-filters-label">{t('purchaseReceipts.pickerSearch')}</span>

                <input

                  type="search"

                  autoComplete="off"

                  value={search}

                  onChange={(e) => setSearch(e.target.value)}

                  placeholder={t('purchaseReceipts.pickerSearchPlaceholder')}

                />

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

                  <th>{t('products.price')}</th>

                  <th>{t('purchaseReceipts.pickerStock')}</th>

                  <th>{t('purchaseReceipts.pickerQty')}</th>

                  <th>{t('purchaseReceipts.pickerSelect')}</th>

                </tr>

              </thead>

              <tbody>

                {loadingCatalog && (

                  <tr>

                    <td colSpan={8} className="muted doc-picker-empty">

                      {t('products.loading')}

                    </td>

                  </tr>

                )}

                {!loadingCatalog && filtered.length === 0 && (

                  <tr>

                    <td colSpan={8} className="muted doc-picker-empty">

                      {t('products.empty')}

                    </td>

                  </tr>

                )}

                {filtered.map((p) => {

                  const draft = rowDrafts[p.id] ?? { quantity: 1, unitPrice: p.unitPrice };

                  const isSelected = selectedIds.has(p.id);

                  const isService = isServiceProductType(p.productType);

                  const showStock = productTracksStock(p);

                  const stock = p.stockQuantity ?? 0;

                  return (

                    <tr

                      key={p.id}

                      className={[

                        isSelected ? 'doc-picker-row-selected' : '',

                        !p.isActive ? 'pr-picker-row-inactive' : '',

                      ]

                        .filter(Boolean)

                        .join(' ')}

                    >

                      <td>

                        <code>{p.articleCode}</code>

                      </td>

                      <td className="doc-picker-name">

                        {p.name}

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

                      <td>

                        <input

                          type="number"

                          min={0}

                          step={0.01}

                          className="doc-picker-price-input"

                          value={draft.unitPrice}

                          onChange={(e) => updateDraft(p.id, { unitPrice: Number(e.target.value) })}

                        />

                      </td>

                      <td className={showStock && stock <= 0 ? 'doc-picker-stock-zero' : ''}>

                        {showStock

                          ? stock > 0

                            ? normalizeStockQuantity(stock)

                            : t('purchaseReceipts.pickerNoStock')

                          : '—'}

                      </td>

                      <td>

                        <div className="doc-picker-qty-control">

                          <button type="button" onClick={() => changeQty(p.id, -1)} aria-label="−">

                            −

                          </button>

                          <input

                            type="number"

                            min={1}

                            step={1}

                            inputMode="numeric"

                            value={draft.quantity}

                            onChange={(e) =>

                              updateDraft(p.id, {

                                quantity: normalizeStockQuantity(Number(e.target.value)),

                              })

                            }

                          />

                          <button type="button" onClick={() => changeQty(p.id, 1)} aria-label="+">

                            +

                          </button>

                        </div>

                      </td>

                      <td>

                        <button

                          type="button"

                          className={`doc-picker-select-btn${isSelected ? ' is-selected' : ''}`}

                          onClick={() => toggleSelect(p)}

                        >

                          + {t('purchaseReceipts.pickerSelectItem')}

                        </button>

                      </td>

                    </tr>

                  );

                })}

              </tbody>

            </table>

          </div>



          <footer className="doc-picker-footer">

            <button type="button" className="btn btn-ghost-inline" onClick={onClose}>

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

        </div>

      </div>



      <ProductEditModal

        open={newProductOpen}

        token={token}

        product={null}

        nextArticle={nextArticle}

        components={components}

        zIndex={2700}

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

            [p.id]: { quantity: 1, unitPrice: p.unitPrice },

          }));

        }}

      />

    </>,

    document.body

  );

}


