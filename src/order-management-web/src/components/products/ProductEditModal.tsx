import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AppModal } from '../ui/AppModal';
import {
  catalogApi,
  type Product,
  type StockMovement,
} from '../../api/catalog';
import { formatStockQuantity } from '../../lib/stockQuantity';
import { warehouseLabelForProductType } from '../../lib/warehouseLabel';
import { ProductTypeSelect } from './ProductTypeSelect';
import { ProductPhotoEditor } from './ProductPhotoEditor';

const PRODUCT_FORM_ID = 'product-card-form';
const PRODUCT_CARD_SIZE_KEY = 'ordermgmt.product-card-modal-size';

function tracksStockType(type: string) {
  return ['ComponentPart', 'FinishedGood', 'Bundle', 'Spare'].includes(type);
}

type BomInput = { componentProductId: string; quantity: number };

function normalizeBomQty(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.round(value);
}

function duplicateProductName(name: string): string {
  const suffix = ' (2)';
  return name.endsWith(suffix) ? name : `${name}${suffix}`;
}

type Props = {
  open: boolean;
  token: string;
  product: Product | null;
  /** Prefill new-item form from an existing product (duplicate draft; not saved until Submit). */
  duplicateFrom?: Product | null;
  nextArticle: string;
  components: Product[];
  initialTab?: 'general' | 'movements';
  onClose: () => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
  onProductUpdated?: (product: Product) => void;
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
}: Props) {
  const { t } = useTranslation();
  const [modalError, setModalError] = useState('');
  const [savingActive, setSavingActive] = useState(false);
  const [savedProduct, setSavedProduct] = useState<Product | null>(null);
  const effectiveProduct = product ?? savedProduct;
  const editing = effectiveProduct !== null;
  const [tab, setTab] = useState<'general' | 'movements'>(initialTab);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [previewArticle, setPreviewArticle] = useState(nextArticle);
  const [newArticlePreview, setNewArticlePreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    productType: 'ComponentPart',
    name: '',
    description: '',
    unitPrice: 0,
    isActive: true,
    showBomInQuote: false,
    showBomInInvoice: false,
    bomLines: [] as BomInput[],
  });

  useEffect(() => {
    if (!open) return;
    setModalError('');
    setTab(initialTab);
    if (!open) {
      setSavedProduct(null);
      return;
    }
    setSavedProduct(null);
    if (product) {
      setForm({
        productType: product.productType,
        name: product.name,
        description: product.description ?? '',
        unitPrice: product.unitPrice,
        isActive: product.isActive,
        showBomInQuote: product.showBomInQuote,
        showBomInInvoice: product.showBomInInvoice,
        bomLines: product.bomLines.map((b) => ({
          componentProductId: b.componentProductId,
          quantity: normalizeBomQty(b.quantity),
        })),
      });
    } else if (duplicateFrom) {
      setForm({
        productType: duplicateFrom.productType,
        name: duplicateProductName(duplicateFrom.name),
        description: duplicateFrom.description ?? '',
        unitPrice: duplicateFrom.unitPrice,
        isActive: true,
        showBomInQuote: duplicateFrom.showBomInQuote,
        showBomInInvoice: duplicateFrom.showBomInInvoice,
        bomLines: duplicateFrom.bomLines.map((b) => ({
          componentProductId: b.componentProductId,
          quantity: normalizeBomQty(b.quantity),
        })),
      });
    } else {
      setForm({
        productType: 'ComponentPart',
        name: '',
        description: '',
        unitPrice: 0,
        isActive: true,
        showBomInQuote: false,
        showBomInInvoice: false,
        bomLines: [],
      });
    }
  }, [open, product, duplicateFrom, initialTab]);

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
    }));
    if (!tracksStockType(productType) && tab === 'movements') setTab('general');
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

  const showBom = form.productType === 'FinishedGood' || form.productType === 'Bundle';
  const tracksStock = tracksStockType(form.productType);
  const typeChanged = editing && effectiveProduct && form.productType !== effectiveProduct.productType;

  const onActiveToggle = async (checked: boolean) => {
    setForm((f) => ({ ...f, isActive: checked }));
    if (!editing || !effectiveProduct || !token) return;
    setSavingActive(true);
    setModalError('');
    try {
      const updated = await catalogApi.products.setActive(token, effectiveProduct.id, {
        isActive: checked,
        version: effectiveProduct.version,
      });
      onProductUpdated?.(updated);
      onSaved(checked ? t('products.activated') : t('products.deactivated'));
    } catch (err) {
      setForm((f) => ({ ...f, isActive: !checked }));
      const msg = err instanceof Error ? err.message : 'Error';
      setModalError(msg);
      onError(msg);
    } finally {
      setSavingActive(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setModalError('');
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

      if (effectiveProduct) {
        const updated = await catalogApi.products.update(token, effectiveProduct.id, {
          productType: form.productType,
          name: form.name,
          description: form.description || null,
          unitPrice: form.unitPrice,
          showBomInQuote: form.showBomInQuote,
          showBomInInvoice: form.showBomInInvoice,
          isActive: form.isActive,
          bomLines: showBom ? bomPayload ?? [] : undefined,
          version: effectiveProduct.version,
        });
        setSavedProduct(updated);
        onProductUpdated?.(updated);
        onSaved(t('products.updated'));
        onClose();
      } else {
        const created = await catalogApi.products.create(token, {
          productType: form.productType,
          name: form.name,
          description: form.description || null,
          unitPrice: form.unitPrice,
          showBomInQuote: form.showBomInQuote,
          showBomInInvoice: form.showBomInInvoice,
          bomLines: bomPayload,
        });
        setSavedProduct(created);
        onProductUpdated?.(created);
        onSaved(t('products.createdAddPhoto'));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      setModalError(msg);
      onError(msg);
    }
  };

  return (
    <AppModal
      open={open}
      onClose={onClose}
      className="product-card-modal"
      overlayClassName="product-card-overlay"
      noCard
      resize={{
        storageKey: PRODUCT_CARD_SIZE_KEY,
        defaultSize: { width: 720, height: 680 },
        minWidth: 420,
        minHeight: 380,
        applyDefaultWhenEmpty: false,
      }}
    >
        <div className="product-card-header">
          <h2>{t('products.cardTitle')}</h2>
          <button type="button" className="product-card-close" onClick={onClose} aria-label={t('products.close')}>
            ×
          </button>
        </div>

        <div className="product-card-identity">
          <div className="product-card-title-block">
            <strong className="product-card-name">{form.name || t('products.newItem')}</strong>
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
                disabled={savingActive}
                onChange={(e) => void onActiveToggle(e.target.checked)}
              />
              <span>
                {t('products.activeItem')}
                {savingActive && <span className="muted"> …</span>}
              </span>
            </label>

            <ProductTypeSelect
              value={form.productType}
              onChange={onProductTypeChange}
            />
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
            {typeChanged && effectiveProduct && !tracksStockType(form.productType) && (effectiveProduct.stockQuantity ?? 0) > 0 && (
              <p className="type-change-note">{t('products.typeChangeZeroStock')}</p>
            )}

            <label>
              {t('products.name')} *
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>

            <label>
              {t('products.description')}
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <div className="product-form-grid">
              <label>
                {t('products.price')} (₪)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.unitPrice}
                  onChange={(e) =>
                    setForm({ ...form, unitPrice: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {t('products.currency')}
                <select disabled>
                  <option>₪ ILS</option>
                </select>
              </label>
            </div>

            {tracksStock && editing && (
              <div className="inventory-box">
                <strong>{t('products.inventoryTitle')}</strong>
                <div className="inventory-row">
                  <span>{warehouseLabelForProductType(form.productType, t)}</span>
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
                {form.bomLines.length > 0 && (
                  <div className="bom-row bom-row-header">
                    <span>{t('products.bomComponent')}</span>
                    <span>{t('products.bomQty')}</span>
                  </div>
                )}
                {form.bomLines.map((line, idx) => (
                  <div key={idx} className="bom-row">
                    <select
                      value={line.componentProductId}
                      onChange={(e) => {
                        const bomLines = [...form.bomLines];
                        bomLines[idx] = { ...line, componentProductId: e.target.value };
                        setForm({ ...form, bomLines });
                      }}
                    >
                      <option value="">—</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.articleCode} — {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      aria-label={t('products.bomQty')}
                      title={t('products.bomQty')}
                      value={line.quantity}
                      onChange={(e) => {
                        const bomLines = [...form.bomLines];
                        const parsed = Number(e.target.value);
                        bomLines[idx] = {
                          ...line,
                          quantity: normalizeBomQty(parsed),
                        };
                        setForm({ ...form, bomLines });
                      }}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost-inline"
                  onClick={() =>
                    setForm({
                      ...form,
                      bomLines: [...form.bomLines, { componentProductId: '', quantity: 1 }],
                    })
                  }
                >
                  + {t('products.addComponent')}
                </button>
              </div>
            )}

          </form>
          </div>
          <div className="product-card-footer">
            <button type="button" className="btn btn-ghost-inline" onClick={onClose}>
              {t('products.close')}
            </button>
            <button type="submit" form={PRODUCT_FORM_ID} className="btn btn-save">
              {t('products.saveChanges')}
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
            <button type="button" className="btn btn-ghost-inline" onClick={onClose}>
              {t('products.close')}
            </button>
          </div>
          </>
        )}
    </AppModal>
  );
}
