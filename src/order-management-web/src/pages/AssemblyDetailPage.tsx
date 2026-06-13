import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { assembliesApi, type StockAssembly } from '../api/assemblies';
import { catalogApi, type Product } from '../api/catalog';
import { productGroupsApi, type ProductGroup } from '../api/productGroups';
import { warehouseApi, type Warehouse } from '../api/warehouse';
import {
  PurchaseReceiptProductPickerModal,
  type PickedReceiptProduct,
} from '../components/purchaseReceipts/PurchaseReceiptProductPickerModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateInput } from '../components/DateInput';
import { UnsavedLeaveDialog } from '../components/UnsavedLeaveDialog';
import { BidiText } from '../components/BidiText';
import { ModalResizeHandles } from '../components/ui/ModalResizeHandles';
import { useAuth } from '../context/AuthContext';
import { useUnsavedLeaveBlocker } from '../hooks/useUnsavedLeaveBlocker';
import { useResizablePanel } from '../hooks/useResizablePanel';
import { ASSEMBLY_DETAIL_PANEL_RESIZE } from '../lib/resizablePanelKeys';
import { productTracksStock } from '../lib/productInventory';
import { normalizeStockQuantity, sanitizeQuantityDraft } from '../lib/stockQuantity';
import '../styles/assemblies.css';
import '../styles/purchase-receipts.css';
import '../styles/data-table-panel.css';

type LineRow = {
  key: string;
  productId: string;
  quantity: number;
};

function emptyLine(): LineRow {
  return { key: crypto.randomUUID(), productId: '', quantity: 1 };
}

function linesFromAssembly(assembly: StockAssembly): LineRow[] {
  if (!assembly.lines.length) return [emptyLine()];
  return assembly.lines.map((l) => ({
    key: l.id || crypto.randomUUID(),
    productId: l.productId,
    quantity: normalizeStockQuantity(l.quantity),
  }));
}

function linesToPayload(lines: LineRow[]) {
  return lines
    .filter((l) => l.productId && l.quantity > 0)
    .map((l) => ({
      productId: l.productId,
      quantity: normalizeStockQuantity(l.quantity),
    }));
}

function isVersionConflictError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('version_conflict') || lower.includes('изменились');
}

function snapshotKey(
  assemblyDate: string,
  outputProductId: string,
  outputWarehouseId: string,
  outputQuantity: number,
  additionalCostIls: string,
  notes: string,
  lines: LineRow[]
) {
  return JSON.stringify({
    assemblyDate,
    outputProductId,
    outputWarehouseId,
    outputQuantity,
    additionalCostIls: additionalCostIls.trim(),
    notes: notes.trim(),
    lines: lines
      .filter((l) => l.productId)
      .map((l) => ({ productId: l.productId, quantity: l.quantity }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
  });
}

export function AssemblyDetailRoute() {
  const { id } = useParams();
  return <AssemblyDetailPage id={id} />;
}

type Props = { id?: string };

export function AssemblyDetailPage({ id }: Props) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const navigate = useNavigate();

  const isNew = !id || id === 'new';
  const routeId = !isNew && id && id !== 'new' ? id : null;

  const [assembly, setAssembly] = useState<StockAssembly | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(() => Boolean(routeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [assemblyDate, setAssemblyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [outputProductId, setOutputProductId] = useState('');
  const [outputWarehouseId, setOutputWarehouseId] = useState('');
  const [outputQuantity, setOutputQuantity] = useState(1);
  const [outputQtyDraft, setOutputQtyDraft] = useState('1');
  const [additionalCostIls, setAdditionalCostIls] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);

  const [outputPickerOpen, setOutputPickerOpen] = useState(false);
  const [linePickerOpen, setLinePickerOpen] = useState(false);
  const [lineReplaceKey, setLineReplaceKey] = useState<string | null>(null);
  const [postConfirmOpen, setPostConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [lineToRemove, setLineToRemove] = useState<string | null>(null);

  const savedSnapshotRef = useRef('');
  const assemblyVersionRef = useRef(1);
  const recipePrefillSkipRef = useRef(true);
  const recipeOutputProductRef = useRef<string | null>(null);

  const isPosted = assembly?.status === 'Posted';
  const readOnly = isPosted;

  const stockProductFilter = useCallback((p: Product) => productTracksStock(p), []);

  const outputProduct = useMemo(
    () => products.find((p) => p.id === outputProductId) ?? null,
    [products, outputProductId]
  );

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const currentSnapshot = useMemo(
    () =>
      snapshotKey(
        assemblyDate,
        outputProductId,
        outputWarehouseId,
        outputQuantity,
        additionalCostIls,
        notes,
        lines
      ),
    [assemblyDate, outputProductId, outputWarehouseId, outputQuantity, additionalCostIls, notes, lines]
  );

  const isDirty = !readOnly && currentSnapshot !== savedSnapshotRef.current;

  const syncVersionForSave = useCallback(() => {
    if (assembly?.version != null && assembly.version > assemblyVersionRef.current) {
      assemblyVersionRef.current = assembly.version;
    }
  }, [assembly?.version]);

  const buildPayload = useCallback(() => {
    syncVersionForSave();
    const addCost = Number(additionalCostIls.trim().replace(',', '.'));
    return {
      assemblyDate,
      outputProductId,
      outputWarehouseId: outputWarehouseId || null,
      outputQuantity: normalizeStockQuantity(outputQuantity),
      additionalCostIls: Number.isFinite(addCost) && addCost > 0 ? addCost : 0,
      notes: notes.trim() || null,
      lines: linesToPayload(lines),
      version: assemblyVersionRef.current,
    };
  }, [
    syncVersionForSave,
    assemblyDate,
    outputProductId,
    outputWarehouseId,
    outputQuantity,
    additionalCostIls,
    notes,
    lines,
  ]);

  const updateDraftWithRetry = useCallback(
    async (assemblyId: string, payload: ReturnType<typeof buildPayload>) => {
      if (!token) throw new Error('Not authenticated');
      try {
        return await assembliesApi.update(token, assemblyId, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (!isVersionConflictError(message)) throw err;
        const fresh = await assembliesApi.get(token, assemblyId);
        assemblyVersionRef.current = fresh.version;
        return await assembliesApi.update(token, assemblyId, {
          ...payload,
          version: fresh.version,
        });
      }
    },
    [token]
  );

  const validate = (): string | null => {
    if (!outputProductId) return t('assemblies.outputRequired');
    if (!outputWarehouseId) return t('assemblies.warehouseRequired');
    const payloadLines = linesToPayload(lines);
    if (payloadLines.length === 0) return t('assemblies.linesRequired');
    if (normalizeStockQuantity(outputQuantity) <= 0) return t('assemblies.outputQtyRequired');
    return null;
  };

  const performSaveDraft = useCallback(async (): Promise<boolean> => {
    if (!token || readOnly) return true;
    const err = validate();
    if (err) {
      setError(err);
      return false;
    }
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload();
      if (isNew) {
        const created = await assembliesApi.create(token, payload);
        assemblyVersionRef.current = created.version;
        savedSnapshotRef.current = currentSnapshot;
        navigate(`/assemblies/${created.id}`, { replace: true });
      } else if (assembly) {
        const updated = await updateDraftWithRetry(assembly.id, payload);
        assemblyVersionRef.current = updated.version;
        setAssembly(updated);
        savedSnapshotRef.current = currentSnapshot;
      }
      return true;
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      return false;
    } finally {
      setSaving(false);
    }
  }, [token, readOnly, assembly, isNew, currentSnapshot, navigate, buildPayload, updateDraftWithRetry, t]);

  const {
    leaveOpen,
    leaveBusy,
    closeLeaveDialog,
    handleLeaveSave,
    handleLeaveDiscard,
  } = useUnsavedLeaveBlocker({
    when: isDirty && !readOnly && !saving,
    onSave: performSaveDraft,
    saveReplacesNavigation: true,
  });

  useEffect(() => {
    if (!token) return;
    catalogApi.products.list(token).then(setProducts).catch(() => {});
    productGroupsApi.list(token).then(setProductGroups).catch(() => {});
    warehouseApi.list(token).then(setWarehouses).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !routeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    assembliesApi
      .get(token, routeId)
      .then((a) => {
        assemblyVersionRef.current = a.version;
        setAssembly(a);
        setAssemblyDate(a.assemblyDate.slice(0, 10));
        setOutputProductId(a.outputProductId);
        setOutputWarehouseId(a.outputWarehouseId);
        setOutputQuantity(a.outputQuantity);
        setOutputQtyDraft(String(a.outputQuantity));
        setAdditionalCostIls(a.additionalCostIls > 0 ? String(a.additionalCostIls) : '');
        setNotes(a.notes ?? '');
        setLines(linesFromAssembly(a));
        savedSnapshotRef.current = snapshotKey(
          a.assemblyDate.slice(0, 10),
          a.outputProductId,
          a.outputWarehouseId,
          a.outputQuantity,
          a.additionalCostIls > 0 ? String(a.additionalCostIls) : '',
          a.notes ?? '',
          linesFromAssembly(a)
        );
        recipePrefillSkipRef.current = true;
        recipeOutputProductRef.current = a.outputProductId;
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, routeId]);

  useEffect(() => {
    if (assembly?.version != null && assembly.version > assemblyVersionRef.current) {
      assemblyVersionRef.current = assembly.version;
    }
  }, [assembly?.version]);

  useEffect(() => {
    if (isNew && !savedSnapshotRef.current) {
      savedSnapshotRef.current = currentSnapshot;
    }
  }, [isNew, currentSnapshot]);

  useEffect(() => {
    if (!outputProduct || outputWarehouseId) return;
    if (outputProduct.warehouseId) setOutputWarehouseId(outputProduct.warehouseId);
  }, [outputProduct, outputWarehouseId]);

  useEffect(() => {
    if (!token || !outputProductId || readOnly) return;
    if (recipePrefillSkipRef.current) {
      recipePrefillSkipRef.current = false;
      return;
    }
    const productChanged = recipeOutputProductRef.current !== outputProductId;
    recipeOutputProductRef.current = outputProductId;
    if (routeId && !productChanged) return;

    assembliesApi
      .recipeLines(token, outputProductId)
      .then((recipeLines) => {
        if (recipeLines.length === 0) return;
        setLines(
          recipeLines.map((l) => ({
            key: crypto.randomUUID(),
            productId: l.productId,
            quantity: l.quantity,
          }))
        );
      })
      .catch(() => {});
  }, [token, outputProductId, readOnly, routeId]);

  const applyOutputPick = (picks: PickedReceiptProduct[]) => {
    const pick = picks[0];
    if (!pick) return;
    recipePrefillSkipRef.current = false;
    recipeOutputProductRef.current = null;
    setOutputProductId(pick.product.id);
    if (pick.product.warehouseId) setOutputWarehouseId(pick.product.warehouseId);
    setOutputPickerOpen(false);
  };

  const applyLinePicks = (picks: PickedReceiptProduct[]) => {
    setLines((prev) => {
      const next = [...prev];
      for (const pick of picks) {
        const replaceIdx = lineReplaceKey
          ? next.findIndex((l) => l.key === lineReplaceKey)
          : -1;
        const qty = normalizeStockQuantity(pick.quantity);
        if (replaceIdx >= 0) {
          next[replaceIdx] = {
            ...next[replaceIdx],
            productId: pick.product.id,
            quantity: qty,
          };
        } else {
          const dupIdx = next.findIndex((l) => l.productId === pick.product.id);
          if (dupIdx >= 0) {
            next[dupIdx] = { ...next[dupIdx], quantity: qty };
          } else {
            const emptyIdx = next.findIndex((l) => !l.productId);
            if (emptyIdx >= 0) {
              next[emptyIdx] = {
                key: next[emptyIdx].key,
                productId: pick.product.id,
                quantity: qty,
              };
            } else {
              next.push({
                key: crypto.randomUUID(),
                productId: pick.product.id,
                quantity: qty,
              });
            }
          }
        }
      }
      return next;
    });
    setLinePickerOpen(false);
    setLineReplaceKey(null);
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    await performSaveDraft();
  };

  const performPost = async () => {
    if (!token || !assembly) return;
    const err = validate();
    if (err) {
      setError(err);
      setPostConfirmOpen(false);
      return;
    }
    setSaving(true);
    setError('');
    try {
      let doc = assembly;
      if (isDirty) {
        doc = await updateDraftWithRetry(assembly.id, buildPayload());
        assemblyVersionRef.current = doc.version;
        setAssembly(doc);
      }
      syncVersionForSave();
      const posted = await assembliesApi.post(token, doc.id, assemblyVersionRef.current);
      assemblyVersionRef.current = posted.version;
      setAssembly(posted);
      savedSnapshotRef.current = snapshotKey(
        posted.assemblyDate.slice(0, 10),
        posted.outputProductId,
        posted.outputWarehouseId,
        posted.outputQuantity,
        posted.additionalCostIls > 0 ? String(posted.additionalCostIls) : '',
        posted.notes ?? '',
        linesFromAssembly(posted)
      );
      setPostConfirmOpen(false);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
      setPostConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const performDelete = async () => {
    if (!token || !assembly) return;
    setSaving(true);
    try {
      await assembliesApi.delete(token, assembly.id);
      navigate('/assemblies');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
    }
  };

  const lineExistingPicks = useMemo(
    () =>
      lines
        .filter((l) => l.productId)
        .map((l) => ({ productId: l.productId, quantity: l.quantity })),
    [lines]
  );

  const title = isNew
    ? t('assemblies.newTitle')
    : t('assemblies.editTitle', { number: assembly?.assemblyNumber ?? '…' });

  const { panelRef, onResizeHandleMouseDown } = useResizablePanel(true, ASSEMBLY_DETAIL_PANEL_RESIZE);

  if (loading) {
    return (
      <div className="page assembly-detail-page">
        <p>{t('products.loading')}</p>
      </div>
    );
  }

  return (
    <div className="page assembly-detail-page purchase-receipt-detail-page">
      <div
        ref={panelRef}
        className="card dt-panel app-modal__panel--resizable assembly-detail-panel"
      >
        <div className="assembly-detail-panel__scroll">
          <header className="purchase-receipt-detail-header">
            <Link to="/assemblies" className="btn-link pr-back-link">
              ← {t('assemblies.back')}
            </Link>
            <h1>{title}</h1>
            {assembly && (
              <span className={`pr-status pr-status--${assembly.status.toLowerCase()}`}>
                {assembly.status === 'Posted'
                  ? t('assemblies.statusPosted')
                  : t('assemblies.statusDraft')}
              </span>
            )}
          </header>

          {error && <div className="error-banner">{error}</div>}

          <form className="purchase-receipt-main asm-detail-form" onSubmit={(e) => void handleSave(e)}>
        <section className="pr-section">
          <h2 className="pr-section-title">{t('assemblies.sectionHeader')}</h2>
          <div className="pr-header-grid asm-header-grid">
            {!isNew && assembly && (
              <label className="pr-field">
                <span>{t('assemblies.colNumber')}</span>
                <input type="text" value={assembly.assemblyNumber} readOnly />
              </label>
            )}
            <label className="pr-field">
              <span>{t('assemblies.colDate')}</span>
              <DateInput
                value={assemblyDate}
                onChange={setAssemblyDate}
                disabled={readOnly}
              />
            </label>
            <label className="pr-field pr-field--span-full">
              <span>{t('assemblies.outputProduct')}</span>
              <div className="asm-output-field">
                {outputProduct ? (
                  <span className="asm-output-label">
                    <code>{outputProduct.articleCode}</code>{' '}
                    <BidiText as="span">{outputProduct.name}</BidiText>
                  </span>
                ) : (
                  <span className="muted">{t('assemblies.selectOutput')}</span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setOutputPickerOpen(true)}
                  >
                    {outputProduct ? t('assemblies.changeOutput') : t('assemblies.selectOutput')}
                  </button>
                )}
              </div>
            </label>
            <label className="pr-field pr-field--asm-warehouse">
              <span>{t('assemblies.outputWarehouse')}</span>
              <select
                value={outputWarehouseId}
                onChange={(e) => setOutputWarehouseId(e.target.value)}
                disabled={readOnly}
              >
                <option value="">{t('assemblies.selectWarehouse')}</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="pr-field">
              <span>{t('assemblies.outputQty')}</span>
              <input
                type="text"
                inputMode="numeric"
                value={outputQtyDraft}
                disabled={readOnly}
                onChange={(e) => setOutputQtyDraft(sanitizeQuantityDraft(e.target.value))}
                onBlur={() => {
                  const q = normalizeStockQuantity(Number(outputQtyDraft));
                  setOutputQuantity(q > 0 ? q : 1);
                  setOutputQtyDraft(String(q > 0 ? q : 1));
                }}
              />
            </label>
            <label className="pr-field">
              <span>{t('assemblies.additionalCost')}</span>
              <input
                type="text"
                inputMode="decimal"
                value={additionalCostIls}
                disabled={readOnly}
                placeholder="0"
                onChange={(e) => setAdditionalCostIls(e.target.value)}
              />
            </label>
            <label className="pr-field pr-field--notes pr-field--span-full">
              <span>{t('assemblies.notes')}</span>
              <textarea
                rows={2}
                value={notes}
                disabled={readOnly}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>
          {isPosted && assembly?.outputUnitCostIls != null && (
            <p className="asm-posted-cost">
              {t('assemblies.outputUnitCost')}: {assembly.outputUnitCostIls.toFixed(2)} ₪
            </p>
          )}
        </section>

        <section className="pr-section">
          <div className="pr-section-head">
            <div>
              <h2 className="pr-section-title">{t('assemblies.sectionLines')}</h2>
              {!readOnly && (
                <p className="muted asm-lines-hint">{t('assemblies.linesBatchHint')}</p>
              )}
            </div>
            {!readOnly && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setLineReplaceKey(null);
                  setLinePickerOpen(true);
                }}
              >
                + {t('assemblies.addLine')}
              </button>
            )}
          </div>
          {lines.length === 0 && (
            <p className="muted pr-lines-empty">{t('assemblies.linesEmpty')}</p>
          )}
          {lines.length > 0 && (
            <div className="pr-lines-wrap">
              <table className="pr-lines-table asm-lines-table">
                <colgroup>
                  <col className="asm-col-article" />
                  <col className="asm-col-name" />
                  <col className="asm-col-qty" />
                  {!readOnly && <col className="asm-col-actions" />}
                </colgroup>
                <thead>
                  <tr>
                    <th className="asm-col-article">{t('assemblies.colArticle')}</th>
                    <th className="asm-col-name">{t('assemblies.colName')}</th>
                    <th className="asm-col-qty">{t('assemblies.colQty')}</th>
                    {!readOnly && (
                      <th className="pr-col-actions" aria-label={t('products.actions')} />
                    )}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const product = line.productId ? productById.get(line.productId) : null;
                    return (
                      <tr key={line.key}>
                        <td className="asm-col-article">
                          <code>{product?.articleCode ?? '—'}</code>
                        </td>
                        <td className="asm-col-name">
                          {product ? (
                            <BidiText as="span">{product.name}</BidiText>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="pr-col-qty asm-col-qty">
                          <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            disabled={readOnly || !line.productId}
                            value={line.quantity <= 0 ? '' : String(line.quantity)}
                            onChange={(e) => {
                              const draft = sanitizeQuantityDraft(e.target.value);
                              const parsed = normalizeStockQuantity(Number(draft));
                              setLines((prev) =>
                                prev.map((l) =>
                                  l.key === line.key ? { ...l, quantity: parsed > 0 ? parsed : 1 } : l
                                )
                              );
                            }}
                          />
                        </td>
                        {!readOnly && (
                          <td className="pr-col-actions">
                            <button
                              type="button"
                              className="pr-line-remove"
                              title={t('assemblies.removeLine')}
                              aria-label={t('assemblies.removeLine')}
                              onClick={() => setLineToRemove(line.key)}
                            >
                              ×
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="purchase-receipt-actions">
          {!readOnly && (
            <>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {t('assemblies.saveDraft')}
              </button>
              {!isNew && assembly && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={saving || validate() !== null}
                    onClick={() => setPostConfirmOpen(true)}
                  >
                    {t('assemblies.postAction')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost danger"
                    disabled={saving}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    {t('assemblies.deleteDraft')}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </form>
        </div>
        <ModalResizeHandles corner onMouseDown={onResizeHandleMouseDown} />
      </div>

      <ConfirmDialog
        open={postConfirmOpen}
        title={t('assemblies.postConfirmTitle')}
        message={t('assemblies.postConfirm')}
        confirmLabel={t('assemblies.postAction')}
        cancelLabel={t('settings.cancel')}
        busy={saving}
        onConfirm={() => void performPost()}
        onCancel={() => setPostConfirmOpen(false)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title={t('assemblies.deleteConfirmTitle')}
        message={t('assemblies.deleteConfirm')}
        confirmLabel={t('assemblies.deleteDraft')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={saving}
        onConfirm={() => void performDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <ConfirmDialog
        open={lineToRemove !== null}
        title={t('assemblies.removeLineConfirmTitle')}
        message={t('assemblies.removeLineConfirm')}
        confirmLabel={t('assemblies.removeLine')}
        cancelLabel={t('settings.cancel')}
        danger
        onConfirm={() => {
          if (lineToRemove) {
            setLines((prev) => {
              const next = prev.filter((l) => l.key !== lineToRemove);
              return next.length ? next : [emptyLine()];
            });
          }
          setLineToRemove(null);
        }}
        onCancel={() => setLineToRemove(null)}
      />

      <PurchaseReceiptProductPickerModal
        open={outputPickerOpen}
        token={token ?? ''}
        products={products}
        groups={productGroups}
        replaceMode
        titleKey="assemblies.outputPickerTitle"
        productFilter={stockProductFilter}
        excludeProductIds={[]}
        onClose={() => setOutputPickerOpen(false)}
        onSave={applyOutputPick}
        onProductCreated={(p) => setProducts((prev) => [...prev, p])}
      />

      <PurchaseReceiptProductPickerModal
        open={linePickerOpen}
        token={token ?? ''}
        products={products}
        groups={productGroups}
        replaceMode={lineReplaceKey !== null}
        titleKey="assemblies.linePickerTitle"
        productFilter={stockProductFilter}
        excludeProductIds={outputProductId ? [outputProductId] : []}
        existingPicks={lineExistingPicks}
        onClose={() => {
          setLinePickerOpen(false);
          setLineReplaceKey(null);
        }}
        onSave={applyLinePicks}
        onProductCreated={(p) => setProducts((prev) => [...prev, p])}
      />

      <UnsavedLeaveDialog
        open={leaveOpen}
        title={t('assemblies.unsavedTitle')}
        message={t('assemblies.unsavedMessage')}
        saveLabel={t('assemblies.saveDraft')}
        discardLabel={t('assemblies.leaveConfirm')}
        cancelLabel={t('settings.cancel')}
        busy={leaveBusy || saving}
        onSave={() => void handleLeaveSave()}
        onDiscard={handleLeaveDiscard}
        onCancel={closeLeaveDialog}
      />
    </div>
  );
}
