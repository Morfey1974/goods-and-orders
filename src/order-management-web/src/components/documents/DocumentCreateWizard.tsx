import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { catalogApi, type Product } from '../../api/catalog';
import { documentsApi, type Document } from '../../api/documents';
import { normalizeStockQuantity } from '../../lib/stockQuantity';
import {
  DocumentProductPickerModal,
  type PickedProductLine,
} from './DocumentProductPickerModal';

export type WizardDocumentType = 'Quote' | 'ChargeInvoice';

const WIZARD_SIZE_STORAGE_KEY = 'ordermgmt.document-wizard-form-size';
const WIZARD_MIN_WIDTH = 520;
const WIZARD_MIN_HEIGHT = 420;

type SavedWizardSize = { width: number; height: number };

function clampWizardSize(width: number, height: number): SavedWizardSize {
  const maxW = window.innerWidth * 0.96;
  const maxH = window.innerHeight * 0.92;
  return {
    width: Math.round(Math.min(maxW, Math.max(WIZARD_MIN_WIDTH, width))),
    height: Math.round(Math.min(maxH, Math.max(WIZARD_MIN_HEIGHT, height))),
  };
}

function loadSavedWizardSize(): SavedWizardSize | null {
  try {
    const raw = localStorage.getItem(WIZARD_SIZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedWizardSize;
    if (
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      parsed.width < WIZARD_MIN_WIDTH ||
      parsed.height < WIZARD_MIN_HEIGHT
    ) {
      return null;
    }
    return clampWizardSize(parsed.width, parsed.height);
  } catch {
    return null;
  }
}

function saveWizardSize(width: number, height: number) {
  if (width < WIZARD_MIN_WIDTH || height < WIZARD_MIN_HEIGHT) return;
  localStorage.setItem(WIZARD_SIZE_STORAGE_KEY, JSON.stringify(clampWizardSize(width, height)));
}

function applySavedWizardSize(el: HTMLElement) {
  const saved = loadSavedWizardSize();
  if (saved) {
    el.style.width = `${saved.width}px`;
    el.style.height = `${saved.height}px`;
  } else {
    el.style.width = '';
    el.style.height = '';
  }
}

function persistWizardSizeFromElement(el: HTMLElement | null) {
  if (!el) return;
  saveWizardSize(el.offsetWidth, el.offsetHeight);
}

type CustomerOption = { id: string; name: string };

type DraftLine = {
  key: string;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Props = {
  open: boolean;
  documentType: WizardDocumentType;
  token: string;
  customers: CustomerOption[];
  products: Product[];
  /** When set, wizard opens in edit mode for an existing document. */
  editDocumentId?: string | null;
  /** When set, prefill form from this document and create on save (duplicate draft). */
  duplicateFromDocumentId?: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onCustomersUpdated: () => void;
};

type DiscountKind = 'percent' | 'amount';

function isoToDateInput(iso: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function loadDocumentIntoForm(doc: Document, options?: { forDuplicate?: boolean }) {
  const forDuplicate = options?.forDuplicate ?? false;
  const parts = (doc.description ?? '').split('\n\n');
  const mainDesc = parts[0] ?? '';
  const extraNotes = parts.slice(1).join('\n\n');
  const loadedLines: DraftLine[] = doc.lines.map((l) => ({
    key: forDuplicate ? crypto.randomUUID() : l.id,
    productId: l.productId ?? '',
    description: l.description,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  let showDiscount = false;
  let discountKind: DiscountKind = 'percent';
  let discountValue = 0;
  if (doc.discountPercent && doc.discountPercent > 0) {
    showDiscount = true;
    discountKind = 'percent';
    discountValue = doc.discountPercent;
  } else if (doc.discountAmount && doc.discountAmount > 0) {
    showDiscount = true;
    discountKind = 'amount';
    discountValue = doc.discountAmount;
  }
  return {
    customer: { id: doc.customerId, name: doc.customerName },
    issueDate: isoToDateInput(doc.issueDate),
    dueDate: doc.dueDate ? isoToDateInput(doc.dueDate) : '',
    description: mainDesc,
    notes: extraNotes,
    lines: loadedLines,
    showDiscount,
    discountKind,
    discountValue,
    version: doc.version,
    title: doc.documentNumber,
  };
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function draftFromPicked(p: PickedProductLine): DraftLine {
  return {
    key: crypto.randomUUID(),
    productId: p.productId,
    description: p.description,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
  };
}

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function DocumentCreateWizard({
  open,
  documentType,
  token,
  customers,
  products,
  editDocumentId = null,
  duplicateFromDocumentId = null,
  onClose,
  onSuccess,
  onCustomersUpdated,
}: Props) {
  const { t } = useTranslation();
  const formWizardRef = useRef<HTMLDivElement>(null);
  const ignoreResizeSaveRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [step, setStep] = useState<'customer' | 'form'>('customer');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerBusy, setNewCustomerBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountKind, setDiscountKind] = useState<DiscountKind>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [editVersion, setEditVersion] = useState(1);
  const [editTitle, setEditTitle] = useState('');
  const [loadingEdit, setLoadingEdit] = useState(false);

  const isEdit = Boolean(editDocumentId);
  const isDuplicateDraft = Boolean(duplicateFromDocumentId);

  const applyLoadedDocument = (
    loaded: ReturnType<typeof loadDocumentIntoForm>,
    options?: { issueDateToday?: boolean }
  ) => {
    setSelectedCustomer(loaded.customer);
    setIssueDate(options?.issueDateToday ? todayIso() : loaded.issueDate || todayIso());
    setDueDate(loaded.dueDate);
    setDescription(loaded.description);
    setNotes(loaded.notes);
    setLines(loaded.lines);
    setShowDiscount(loaded.showDiscount);
    setDiscountKind(loaded.discountKind);
    setDiscountValue(loaded.discountValue);
    setEditVersion(loaded.version);
    setEditTitle(loaded.title);
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editDocumentId && token) {
      setLoadingEdit(true);
      setStep('form');
      documentsApi
        .get(token, editDocumentId)
        .then((doc) => applyLoadedDocument(loadDocumentIntoForm(doc)))
        .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
        .finally(() => setLoadingEdit(false));
      return;
    }
    if (duplicateFromDocumentId && token) {
      setLoadingEdit(true);
      setStep('form');
      documentsApi
        .get(token, duplicateFromDocumentId)
        .then((doc) => applyLoadedDocument(loadDocumentIntoForm(doc, { forDuplicate: true }), { issueDateToday: true }))
        .catch((err) => setError(err instanceof Error ? err.message : 'Error'))
        .finally(() => setLoadingEdit(false));
      return;
    }
    setStep('customer');
    setCustomerSearch('');
    setSelectedCustomer(null);
    setNewCustomerOpen(false);
    setNewCustomerName('');
    setIssueDate(todayIso());
    setDueDate('');
    setDescription('');
    setNotes('');
    setLines([]);
    setShowDiscount(false);
    setDiscountKind('percent');
    setDiscountValue(0);
    setEditVersion(1);
    setEditTitle('');
  }, [open, documentType, editDocumentId, duplicateFromDocumentId, token]);

  const formVisible = open && step === 'form' && Boolean(selectedCustomer);

  useLayoutEffect(() => {
    if (!formVisible) return;
    const el = formWizardRef.current;
    if (!el) return;
    ignoreResizeSaveRef.current = true;
    applySavedWizardSize(el);
    requestAnimationFrame(() => {
      ignoreResizeSaveRef.current = false;
    });
  }, [formVisible, selectedCustomer?.id]);

  useEffect(() => {
    if (!formVisible) return;
    const el = formWizardRef.current;
    if (!el) return;
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      if (ignoreResizeSaveRef.current) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (!el.isConnected) return;
        saveWizardSize(el.offsetWidth, el.offsetHeight);
      }, 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(saveTimer);
      persistWizardSizeFromElement(el);
    };
  }, [formVisible, selectedCustomer?.id]);

  const handleClose = () => {
    persistWizardSizeFromElement(formWizardRef.current);
    onClose();
  };

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q));
  }, [customers, customerSearch]);

  const lineTotals = useMemo(
    () => lines.map((l) => l.quantity * l.unitPrice),
    [lines]
  );
  const subtotal = useMemo(() => lineTotals.reduce((a, b) => a + b, 0), [lineTotals]);

  const discountTotal = useMemo(() => {
    if (!showDiscount || discountValue <= 0) return 0;
    if (discountKind === 'percent') {
      return Math.min(subtotal, Math.round(subtotal * (discountValue / 100) * 100) / 100);
    }
    return Math.min(subtotal, discountValue);
  }, [showDiscount, discountKind, discountValue, subtotal]);

  const totalDue = useMemo(() => Math.max(0, subtotal - discountTotal), [subtotal, discountTotal]);

  const pickCustomer = (c: CustomerOption) => {
    setSelectedCustomer(c);
    setStep('form');
    setError('');
  };

  const onCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !newCustomerName.trim()) return;
    setNewCustomerBusy(true);
    setError('');
    try {
      const created = await catalogApi.customers.create(token, {
        name: newCustomerName.trim(),
        defaultDiscountPercent: 0,
      });
      onCustomersUpdated();
      pickCustomer({ id: created.id, name: created.name });
      setNewCustomerOpen(false);
      setNewCustomerName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setNewCustomerBusy(false);
    }
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const addPickedLines = (picked: PickedProductLine[]) => {
    setLines((prev) => [...prev, ...picked.map(draftFromPicked)]);
    setError('');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !selectedCustomer) return;
    const validLines = lines.filter((l) => l.productId && l.quantity > 0);
    if (!validLines.length) {
      setError(t('documents.needLines'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const bodyDescription = [description.trim(), notes.trim()].filter(Boolean).join('\n\n') || undefined;
      const linePayload = validLines.map((l) => ({
        productId: l.productId,
        description: l.description.trim() || products.find((p) => p.id === l.productId)?.name || '',
        quantity: normalizeStockQuantity(l.quantity),
        unitPrice: l.unitPrice,
      }));
      const discountPayload = {
        discountPercent:
          showDiscount && discountKind === 'percent' && discountValue > 0 ? discountValue : undefined,
        discountAmount:
          showDiscount && discountKind === 'amount' && discountValue > 0 ? discountValue : undefined,
      };
      if (isEdit && editDocumentId) {
        await documentsApi.update(token, editDocumentId, {
          description: bodyDescription,
          issueDate: issueDate ? `${issueDate}T12:00:00Z` : undefined,
          dueDate: dueDate ? `${dueDate}T12:00:00Z` : undefined,
          version: editVersion,
          ...discountPayload,
          lines: linePayload,
        });
        onSuccess(t('documents.updated'));
      } else {
        await documentsApi.create(token, {
          documentType,
          customerId: selectedCustomer.id,
          description: bodyDescription,
          issueDate: issueDate ? `${issueDate}T12:00:00Z` : undefined,
          dueDate: dueDate ? `${dueDate}T12:00:00Z` : undefined,
          ...discountPayload,
          lines: linePayload,
        });
        onSuccess(t('documents.created'));
      }
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const header = (
    <header className="doc-wizard-header">
      <button
        type="button"
        className="doc-wizard-back"
        onClick={() => {
          if (step === 'form' && !isEdit && !isDuplicateDraft) {
            persistWizardSizeFromElement(formWizardRef.current);
            setStep('customer');
            return;
          }
          handleClose();
        }}
        aria-label={t('documents.back')}
      >
        ‹
      </button>
      <h1 className="doc-wizard-title">
        {isEdit && editTitle
          ? `${t(`documents.types.${documentType}`)} ${editTitle.replace(/^[A-Z]+-/, '')}`
          : t(`documents.types.${documentType}`)}
      </h1>
      <button type="button" className="doc-wizard-close" onClick={handleClose} aria-label={t('products.close')}>
        ×
      </button>
    </header>
  );

  return createPortal(
    <div className={`doc-wizard-overlay${step === 'form' ? ' doc-wizard-overlay--form' : ''}`}>
      {step === 'customer' && !isEdit && !isDuplicateDraft && (
        <div className="doc-wizard doc-wizard--customer">
          {header}
          <div className="doc-wizard-customer-step">
            <div className="doc-customer-card">
              <div className="doc-customer-card-head">
                <h2>{t('documents.customerDetails')}</h2>
                <button
                  type="button"
                  className="doc-link-btn"
                  onClick={() => setNewCustomerOpen((v) => !v)}
                >
                  <span className="doc-radio-dot" aria-hidden />
                  {t('documents.createCustomer')}
                </button>
              </div>

              {newCustomerOpen && (
                <form className="doc-new-customer-form" onSubmit={onCreateCustomer}>
                  <input
                    type="text"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder={t('customers.name')}
                    required
                    autoFocus
                  />
                  <button type="submit" className="btn btn-primary" disabled={newCustomerBusy}>
                    {newCustomerBusy ? '…' : t('customers.add')}
                  </button>
                </form>
              )}

              <label className="doc-customer-search">
                <span className="doc-search-icon" aria-hidden>
                  🔍
                </span>
                <input
                  type="search"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder={t('documents.customerSearchPlaceholder')}
                  autoFocus={!newCustomerOpen}
                />
              </label>

              <ul className="doc-customer-list" role="listbox">
                {filteredCustomers.length === 0 && (
                  <li className="muted doc-customer-empty">{t('documents.noCustomersMatch')}</li>
                )}
                {filteredCustomers.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="doc-customer-item" onClick={() => pickCustomer(c)}>
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {error && <div className="error-banner doc-wizard-error">{error}</div>}
          </div>
        </div>
      )}

      {step === 'form' && selectedCustomer && (
        <div className="doc-wizard-form-shell">
          <div ref={formWizardRef} className="doc-wizard doc-wizard--form">
            {header}
            <div className="doc-wizard-body">
              <form id="doc-create-form" className="doc-wizard-form" onSubmit={onSubmit}>
                {loadingEdit && <p className="muted">{t('documents.loading')}</p>}
                {isDuplicateDraft && !loadingEdit && (
                  <p className="type-change-note type-change-note-info">{t('documents.duplicateDraftHint')}</p>
                )}
                {error && <div className="error-banner doc-wizard-error">{error}</div>}

            <section className="doc-panel doc-panel-customer">
              <div className="doc-panel-grid">
                <div className="doc-customer-selected">
                  <span className="doc-panel-label">{t('documents.customerDetails')}</span>
                  <strong>{selectedCustomer.name}</strong>
                  {!isEdit && !isDuplicateDraft && (
                    <button type="button" className="doc-link-btn" onClick={() => setStep('customer')}>
                      {t('documents.changeCustomer')}
                    </button>
                  )}
                </div>
                <label>
                  <span className="doc-panel-label">{t('documents.issueDate')}</span>
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
                </label>
                <label>
                  <span className="doc-panel-label">{t('documents.colDue')}</span>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <label>
                  <span className="doc-panel-label">{t('documents.currency')}</span>
                  <select disabled>
                    <option>₪ ILS</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="doc-panel">
              <label className="doc-field-block">
                <span className="doc-panel-label">{t('documents.contentDescription')}</span>
                <textarea
                  rows={2}
                  className="doc-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('documents.contentDescriptionHint')}
                />
              </label>
            </section>

            <section className="doc-panel doc-lines-panel">
              <div className="doc-lines-head">
                <h2>{t('documents.lineItems')}</h2>
                <button
                  type="button"
                  className="btn btn-secondary doc-btn-sm"
                  onClick={() => setPickerOpen(true)}
                  disabled={!products.length}
                >
                  + {t('documents.addProduct')}
                </button>
              </div>

              <div className="doc-lines-layout">
                <div className="doc-lines-table-wrap">
                  {lines.length === 0 && (
                    <p className="muted doc-lines-empty">{t('documents.emptyLines')}</p>
                  )}
                  {lines.length > 0 && (
                  <table className="doc-lines-table">
                    <thead>
                      <tr>
                        <th>{t('documents.colDescription')}</th>
                        <th>{t('warehouse.qty')}</th>
                        <th>{t('products.price')}</th>
                        <th>{t('documents.colAmount')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, idx) => (
                        <tr key={line.key}>
                          <td className="doc-line-product-cell">
                            <code className="doc-line-sku">
                              {products.find((p) => p.id === line.productId)?.articleCode}
                            </code>
                            <input
                              type="text"
                              className="doc-line-desc"
                              value={line.description}
                              onChange={(e) => updateLine(line.key, { description: e.target.value })}
                              placeholder={t('documents.colDescription')}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              inputMode="numeric"
                              value={line.quantity}
                              onChange={(e) =>
                                updateLine(line.key, {
                                  quantity: normalizeStockQuantity(Number(e.target.value)),
                                })
                              }
                              required
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={line.unitPrice}
                              onChange={(e) =>
                                updateLine(line.key, { unitPrice: Number(e.target.value) })
                              }
                              required
                            />
                          </td>
                          <td className="doc-line-total">{formatMoney(lineTotals[idx] ?? 0)}</td>
                          <td>
                            <button
                              type="button"
                              className="doc-line-remove"
                              onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                              aria-label={t('documents.removeLine')}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )}
                </div>
                <aside className="doc-summary-box">
                  <span className="doc-summary-label">{t('documents.summary')}</span>
                  {subtotal > 0 && subtotal !== totalDue && (
                    <span className="doc-summary-sub muted">{formatMoney(subtotal)}</span>
                  )}
                  <span className="doc-summary-total">{formatMoney(totalDue)}</span>
                  <span className="muted doc-summary-hint">{t('documents.totalDue')}</span>
                  {!showDiscount ? (
                    <button
                      type="button"
                      className="btn btn-secondary doc-btn-sm doc-add-discount"
                      onClick={() => setShowDiscount(true)}
                    >
                      + {t('documents.addDiscount')}
                    </button>
                  ) : (
                    <div className="doc-discount-block">
                      <span className="doc-panel-label">{t('documents.discount')}</span>
                      <div className="doc-discount-row">
                        <input
                          type="number"
                          min={0}
                          step={discountKind === 'percent' ? 0.01 : 0.01}
                          max={discountKind === 'percent' ? 100 : undefined}
                          value={discountValue || ''}
                          onChange={(e) => setDiscountValue(Number(e.target.value))}
                        />
                        <select
                          value={discountKind}
                          onChange={(e) => setDiscountKind(e.target.value as DiscountKind)}
                        >
                          <option value="percent">{t('documents.discountPercent')}</option>
                          <option value="amount">{t('documents.discountFixed')}</option>
                        </select>
                        <button
                          type="button"
                          className="doc-line-remove"
                          onClick={() => {
                            setShowDiscount(false);
                            setDiscountValue(0);
                          }}
                          aria-label={t('documents.removeDiscount')}
                        >
                          ×
                        </button>
                      </div>
                      {discountTotal > 0 && (
                        <span className="doc-discount-applied muted">
                          −{formatMoney(discountTotal)}
                        </span>
                      )}
                    </div>
                  )}
                </aside>
              </div>
            </section>

            <section className="doc-panel">
              <label className="doc-field-block">
                <span className="doc-panel-label">{t('documents.notes')}</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="doc-textarea"
                />
              </label>
            </section>
              </form>
            </div>
            <footer className="doc-wizard-footer">
              <button type="button" className="btn btn-ghost-inline" onClick={handleClose} disabled={busy}>
                {t('settings.cancel')}
              </button>
              <button type="submit" className="btn btn-primary" form="doc-create-form" disabled={busy || loadingEdit}>
                {busy ? '…' : isEdit ? t('documents.save') : t('documents.generate')}
              </button>
            </footer>
          </div>
        </div>
      )}

      <DocumentProductPickerModal
        open={pickerOpen}
        products={products}
        onClose={() => setPickerOpen(false)}
        onSave={addPickedLines}
      />
    </div>,
    document.body
  );
}
