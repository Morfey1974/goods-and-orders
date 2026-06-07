import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PRODUCT_TYPES, type Product } from '../../api/catalog';
import {
  finalizePriceDraft,
  finalizeQuantityDraft,
  normalizeStockQuantity,
  sanitizePriceDraft,
  sanitizeQuantityDraft,
} from '../../lib/stockQuantity';
import { DOCUMENT_PRODUCT_PICKER_RESIZE } from '../../lib/resizablePanelKeys';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { BidiText } from '../BidiText';
import { ModalResizeHandles } from '../ui/ModalResizeHandles';

export type PickedProductLine = {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type RowDraft = { quantity: string; unitPrice: string };

type Props = {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onSave: (lines: PickedProductLine[]) => void;
};

function tracksStock(type: string) {
  return ['ComponentPart', 'FinishedGood', 'Bundle', 'Spare'].includes(type);
}

function draftForProduct(p: Product): RowDraft {
  return { quantity: '1', unitPrice: String(p.unitPrice) };
}

export function DocumentProductPickerModal({ open, products, onClose, onSave }: Props) {
  const { t } = useTranslation();
  const { panelRef, resizable, persistSize, onResizeHandleMouseDown } = useResizablePanel(
    open,
    DOCUMENT_PRODUCT_PICKER_RESIZE
  );
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setFilterType('');
    setSelectedIds(new Set());
    const drafts: Record<string, RowDraft> = {};
    for (const p of products) {
      drafts[p.id] = draftForProduct(p);
    }
    setRowDrafts(drafts);
  }, [open, products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filterType && p.productType !== filterType) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.articleCode.toLowerCase().includes(q) ||
        (p.legacySku?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [products, search, filterType]);

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setRowDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const toggleSelect = (p: Product) => {
    const draft = rowDrafts[p.id] ?? draftForProduct(p);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) next.delete(p.id);
      else next.add(p.id);
      return next;
    });
    setRowDrafts((prev) => ({ ...prev, [p.id]: draft }));
  };

  const changeQty = (id: string, delta: number) => {
    const cur = finalizeQuantityDraft(rowDrafts[id]?.quantity ?? '1');
    updateDraft(id, { quantity: String(Math.max(1, normalizeStockQuantity(cur + delta))) });
  };

  const handleSave = () => {
    const lines: PickedProductLine[] = [];
    for (const id of selectedIds) {
      const p = products.find((x) => x.id === id);
      const draft = rowDrafts[id];
      if (!p || !draft) continue;
      lines.push({
        productId: p.id,
        description: p.name,
        quantity: finalizeQuantityDraft(draft.quantity),
        unitPrice: finalizePriceDraft(draft.unitPrice),
      });
    }
    if (lines.length) onSave(lines);
    persistSize();
    onClose();
  };

  const handleClose = () => {
    persistSize();
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="doc-picker-overlay" role="presentation">
      <div
        ref={panelRef}
        className={`doc-picker-modal${resizable ? ' doc-picker-modal--resizable' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="doc-picker-title"
      >
        <header className="doc-picker-header">
          <button type="button" className="doc-picker-close" onClick={handleClose} aria-label={t('products.close')}>
            ×
          </button>
          <h2 id="doc-picker-title">{t('documents.pickerTitle')}</h2>
        </header>

        <div className="doc-picker-toolbar">
          <button
            type="button"
            className="btn btn-secondary doc-btn-sm"
            onClick={() => window.open('/products', '_blank')}
          >
            {t('documents.pickerNewItem')}
          </button>
          <div className="doc-picker-filters">
            <span className="doc-picker-filters-label">{t('documents.pickerSearch')}</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('documents.pickerSearchPlaceholder')}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="">{t('documents.pickerCategoryAll')}</option>
              {PRODUCT_TYPES.map((pt) => (
                <option key={pt} value={pt}>
                  {t(`products.types.${pt}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="doc-picker-table-wrap">
          <table className="doc-picker-table">
            <thead>
              <tr>
                <th>{t('documents.pickerSelect')}</th>
                <th>{t('documents.pickerQtyAdd')}</th>
                <th>{t('documents.pickerStock')}</th>
                <th>{t('products.price')}</th>
                <th>{t('documents.colDescription')}</th>
                <th>{t('products.articleCol')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted doc-picker-empty">
                    {t('products.empty')}
                  </td>
                </tr>
              )}
              {filtered.map((p) => {
                const draft = rowDrafts[p.id] ?? draftForProduct(p);
                const isSelected = selectedIds.has(p.id);
                const stock = p.stockQuantity ?? 0;
                const showStock = tracksStock(p.productType);
                return (
                  <tr key={p.id} className={isSelected ? 'doc-picker-row-selected' : ''}>
                    <td>
                      <button
                        type="button"
                        className={`doc-picker-select-btn${isSelected ? ' is-selected' : ''}`}
                        onClick={() => toggleSelect(p)}
                      >
                        + {t('documents.pickerSelectItem')}
                      </button>
                    </td>
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
                          onBlur={() =>
                            updateDraft(p.id, {
                              quantity: String(finalizeQuantityDraft(draft.quantity)),
                            })
                          }
                        />
                        <button type="button" onClick={() => changeQty(p.id, 1)} aria-label="+">
                          +
                        </button>
                      </div>
                    </td>
                    <td className={showStock && stock <= 0 ? 'doc-picker-stock-zero' : ''}>
                      {showStock
                        ? stock > 0
                          ? normalizeStockQuantity(stock)
                          : t('documents.pickerNoStock')
                        : '—'}
                    </td>
                    <td>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="doc-picker-price-input"
                        value={draft.unitPrice}
                        onChange={(e) => updateDraft(p.id, { unitPrice: sanitizePriceDraft(e.target.value) })}
                        onBlur={() =>
                          updateDraft(p.id, {
                            unitPrice: String(finalizePriceDraft(draft.unitPrice)),
                          })
                        }
                      />
                    </td>
                    <td className="doc-picker-name">
                      <BidiText as="span">{p.name}</BidiText>
                    </td>
                    <td>
                      <code>{p.articleCode}</code>
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
            {t('documents.pickerSave')}
            {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </footer>
        {resizable && <ModalResizeHandles onMouseDown={onResizeHandleMouseDown} />}
      </div>
    </div>,
    document.body
  );
}
