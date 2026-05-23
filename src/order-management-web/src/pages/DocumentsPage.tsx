import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { catalogApi, type Product } from '../api/catalog';
import {
  DocumentCreateWizard,
  type WizardDocumentType,
} from '../components/documents/DocumentCreateWizard';
import { CatalogRowMenu } from '../components/products/CatalogRowMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AppModal } from '../components/ui/AppModal';
import { DocumentPdfPreviewModal } from '../components/documents/DocumentPdfPreviewModal';
import { documentsApi, type Document, type DocumentListResponse } from '../api/documents';
import { useAuth } from '../context/AuthContext';
import '../styles/products-catalog.css';
import '../styles/documents.css';

const STATUS_CLASS: Record<string, string> = {
  Draft: 'draft',
  Sent: 'sent',
  Open: 'open',
  Paid: 'paid',
  Closed: 'closed',
  Cancelled: 'cancelled',
};

const TYPE_CLASS: Record<string, string> = {
  Quote: 'quote',
  ChargeInvoice: 'charge',
  Receipt: 'receipt',
  Order: 'order',
};

function formatMoney(n: number) {
  return `₪${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

function isWizardDocument(doc: Document) {
  return doc.documentType === 'Quote' || doc.documentType === 'ChargeInvoice';
}

function canManageDocument(doc: Document) {
  return isWizardDocument(doc) && !doc.orderId;
}

function documentHasActions(doc: Document) {
  return (
    canManageDocument(doc) ||
    doc.documentType === 'Quote' ||
    (doc.documentType === 'ChargeInvoice' && doc.status === 'Open')
  );
}

function monthLabel(year: number, month: number) {
  const lang = i18n.language;
  const locale = lang === 'he' ? 'he-IL' : lang === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1)
  );
}

export function DocumentsPage() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [data, setData] = useState<DocumentListResponse | null>(null);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [wizardType, setWizardType] = useState<WizardDocumentType | null>(null);
  const [editDocumentId, setEditDocumentId] = useState<string | null>(null);
  const [duplicateFromDocumentId, setDuplicateFromDocumentId] = useState<string | null>(null);
  const [rowMenuDoc, setRowMenuDoc] = useState<Document | null>(null);
  const rowMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<'Quote' | 'ChargeInvoice' | 'Receipt'>('Quote');
  const [form, setForm] = useState({
    customerId: '',
    productId: '',
    quantity: 1,
    description: '',
    dueDate: '',
    parentDocumentId: '',
    paymentMethod: '',
  });
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState<Document | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (filterType) params.documentType = filterType;
    if (filterStatus) params.status = filterStatus;
    documentsApi
      .list(token, params)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token, search, filterType, filterStatus]);

  useEffect(() => {
    if (!token) return;
    catalogApi.customers.list(token, true).then((c) =>
      setCustomers(c.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name })))
    );
    catalogApi.products.list(token, undefined, true).then((p) =>
      setProducts(p.filter((x) => x.isActive))
    );
  }, [token]);

  const reloadCustomers = useCallback(() => {
    if (!token) return;
    catalogApi.customers.list(token, true).then((c) =>
      setCustomers(c.filter((x) => x.isActive).map((x) => ({ id: x.id, name: x.name })))
    );
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest('.row-menu-wrap') && !el.closest('.row-menu--portal')) {
        setRowMenuDoc(null);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const openCharges = useMemo(() => {
    if (!data) return [];
    return data.groups.flatMap((g) =>
      g.documents.filter((d) => d.documentType === 'ChargeInvoice' && d.status === 'Open')
    );
  }, [data]);

  const openCreate = (type: 'Quote' | 'ChargeInvoice' | 'Receipt') => {
    setMenuOpen(false);
    setError('');
    if (type === 'Quote' || type === 'ChargeInvoice') {
      setEditDocumentId(null);
      setDuplicateFromDocumentId(null);
      setWizardType(type);
      return;
    }
    setCreateType(type);
    setForm({
      customerId: '',
      productId: '',
      quantity: 1,
      description: '',
      dueDate: '',
      parentDocumentId: openCharges[0]?.id ?? '',
      paymentMethod: '',
    });
    setCreateOpen(true);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    try {
      if (createType === 'Receipt') {
        if (!form.parentDocumentId) {
          setError(t('documents.receiptNeedsParent'));
          return;
        }
        await documentsApi.recordPayment(token, form.parentDocumentId, {
          paymentMethod: form.paymentMethod || undefined,
        });
        setMessage(t('documents.receiptCreated'));
      } else {
        if (!form.customerId || !form.productId) return;
        const product = products.find((p) => p.id === form.productId);
        await documentsApi.create(token, {
          documentType: createType,
          customerId: form.customerId,
          description: form.description || product?.name,
          dueDate: form.dueDate || undefined,
          lines: [
            {
              productId: form.productId,
              description: form.description || product?.name || '',
              quantity: form.quantity,
              unitPrice: 0,
            },
          ],
        });
        setMessage(t('documents.created'));
      }
      setCreateOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const toggleRowMenu = (doc: Document, btn: HTMLButtonElement) => {
    if (rowMenuDoc?.id === doc.id) {
      setRowMenuDoc(null);
      return;
    }
    rowMenuAnchorRef.current = btn;
    setRowMenuDoc(doc);
  };

  const closeWizard = () => {
    setWizardType(null);
    setEditDocumentId(null);
    setDuplicateFromDocumentId(null);
  };

  const onEditDocument = (doc: Document) => {
    if (!canManageDocument(doc)) return;
    setRowMenuDoc(null);
    setDuplicateFromDocumentId(null);
    setEditDocumentId(doc.id);
    setWizardType(doc.documentType as WizardDocumentType);
    setError('');
  };

  const onDuplicateDocument = async (doc: Document) => {
    if (!token || !canManageDocument(doc)) return;
    setRowMenuDoc(null);
    setEditDocumentId(null);
    setError('');
    setWizardType(doc.documentType as WizardDocumentType);
    setDuplicateFromDocumentId(doc.id);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleteBusy(true);
    setError('');
    try {
      await documentsApi.delete(token, deleteTarget.id);
      setMessage(t('documents.deleted'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const quotePdfFileName = (doc: Document) => {
    const num = doc.documentNumber.replace(/^[A-Z]+-/, '');
    return `quote-${num}.pdf`;
  };

  const closePdfPreview = useCallback(() => {
    setPdfPreviewDoc(null);
    setPdfPreviewError(null);
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  useEffect(() => () => {
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  const openPdfPreview = async (doc: Document) => {
    if (!token || doc.documentType !== 'Quote') return;
    setRowMenuDoc(null);
    setError('');
    setPdfPreviewDoc(doc);
    setPdfPreviewLoading(true);
    setPdfPreviewError(null);
    setPdfPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    try {
      const blob = await documentsApi.fetchPdfBlob(token, doc.id);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch (err) {
      setPdfPreviewError(err instanceof Error ? err.message : 'Error');
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const onDownloadPdf = async (doc: Document) => {
    if (!token || doc.documentType !== 'Quote') return;
    setRowMenuDoc(null);
    setError('');
    try {
      await documentsApi.downloadPdf(token, doc.id, quotePdfFileName(doc));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const onPayment = async (doc: Document) => {
    if (!token) return;
    if (!window.confirm(t('documents.paymentConfirm', { number: doc.documentNumber }))) return;
    try {
      await documentsApi.recordPayment(token, doc.id, {
        paymentMethod: doc.paymentMethod || undefined,
      });
      setMessage(t('documents.receiptCreated'));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const summary = data?.summary;

  return (
    <div className="page documents-page">
      <div className="documents-header-row">
        <div>
          <h1>{t('nav.documents')}</h1>
          {summary && (
            <div className="documents-summary">
              <div className="documents-summary-item">
                <span className="label">{t('documents.totalReceipts')}</span>
                <span className="value">{formatMoney(summary.totalReceipts)}</span>
              </div>
              <div className="documents-summary-item">
                <span className="label">{t('documents.totalChargeInvoices')}</span>
                <span className="value">{formatMoney(summary.totalChargeInvoices)}</span>
              </div>
              <div className="documents-summary-item">
                <span className="label">{t('documents.totalQuotes')}</span>
                <span className="value">{formatMoney(summary.totalQuotes)}</span>
              </div>
              <div className="documents-summary-item receivable">
                <span className="label">{t('documents.totalReceivable')}</span>
                <span className="value">{formatMoney(summary.totalReceivable)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="documents-create-wrap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setMenuOpen((v) => !v)}
          >
            + {t('documents.create')}
          </button>
          {menuOpen && (
            <div className="documents-create-menu">
              <h3>{t('documents.createNew')}</h3>
              <button type="button" onClick={() => openCreate('Quote')}>
                {t('documents.types.Quote')}
              </button>
              <button type="button" onClick={() => openCreate('ChargeInvoice')}>
                {t('documents.types.ChargeInvoice')}
              </button>
              <button type="button" onClick={() => openCreate('Receipt')}>
                {t('documents.types.Receipt')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="documents-toolbar">
        <input
          type="search"
          placeholder={t('documents.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">{t('documents.allTypes')}</option>
          <option value="Quote">{t('documents.types.Quote')}</option>
          <option value="ChargeInvoice">{t('documents.types.ChargeInvoice')}</option>
          <option value="Receipt">{t('documents.types.Receipt')}</option>
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">{t('documents.allStatuses')}</option>
          <option value="Open">{t('documents.statuses.open')}</option>
          <option value="Sent">{t('documents.statuses.sent')}</option>
          <option value="Paid">{t('documents.statuses.paid')}</option>
          <option value="Closed">{t('documents.statuses.closed')}</option>
        </select>
        <button type="button" className="btn btn-ghost-inline" onClick={load}>
          {t('documents.refresh')}
        </button>
      </div>

      {message && <div className="success-banner">{message}</div>}
      {error && !createOpen && !wizardType && <div className="error-banner">{error}</div>}

      {!data?.groups.length && <p className="muted">{t('documents.empty')}</p>}

      {data?.groups.map((group) => (
        <section key={group.monthKey}>
          <h2 className="documents-month-title">{monthLabel(group.year, group.month)}</h2>
          <div className="card table-wrap documents-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('documents.colNumber')}</th>
                  <th>{t('documents.colType')}</th>
                  <th>{t('documents.colCustomer')}</th>
                  <th>{t('documents.colDescription')}</th>
                  <th>{t('documents.colPayment')}</th>
                  <th>{t('documents.colDate')}</th>
                  <th>{t('documents.colDue')}</th>
                  <th>{t('documents.colAmount')}</th>
                  <th>{t('products.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {group.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="doc-number-cell">
                        {doc.documentType === 'Quote' ? (
                          <button
                            type="button"
                            className="doc-number-link"
                            onClick={() => void openPdfPreview(doc)}
                            title={t('documents.previewPdf')}
                          >
                            <code>{doc.documentNumber.replace(/^[A-Z]+-/, '')}</code>
                          </button>
                        ) : (
                          <code>{doc.documentNumber.replace(/^[A-Z]+-/, '')}</code>
                        )}
                        <span className={`doc-badge doc-badge-${STATUS_CLASS[doc.status] ?? 'draft'}`}>
                          {t(`documents.statuses.${STATUS_CLASS[doc.status] ?? 'draft'}`)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`doc-type-${TYPE_CLASS[doc.documentType] ?? 'quote'}`}>
                        {t(`documents.types.${doc.documentType}`)}
                      </span>
                    </td>
                    <td>{doc.customerName}</td>
                    <td>{doc.description ?? '—'}</td>
                    <td>{doc.paymentMethod ?? '—'}</td>
                    <td>{formatDate(doc.issueDate)}</td>
                    <td>{doc.dueDate ? formatDate(doc.dueDate) : '—'}</td>
                    <td>{formatMoney(doc.totalAmount)}</td>
                    <td className="doc-actions">
                      {documentHasActions(doc) && (
                        <div className={`row-menu-wrap${rowMenuDoc?.id === doc.id ? ' is-open' : ''}`}>
                          <button
                            type="button"
                            className="row-menu-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRowMenu(doc, e.currentTarget);
                            }}
                            aria-label={t('products.actions')}
                            aria-expanded={rowMenuDoc?.id === doc.id}
                          >
                            ⋮
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <CatalogRowMenu open={rowMenuDoc !== null} anchorRef={rowMenuAnchorRef}>
        {rowMenuDoc && (
          <>
            {rowMenuDoc.documentType === 'Quote' && (
              <>
                <button type="button" onClick={() => void openPdfPreview(rowMenuDoc)}>
                  {t('documents.previewPdf')}
                </button>
                <button type="button" onClick={() => void onDownloadPdf(rowMenuDoc)}>
                  {t('documents.downloadPdf')}
                </button>
              </>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button
                type="button"
                onClick={() => onEditDocument(rowMenuDoc)}
              >
                {t('documents.actionEdit')}
              </button>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button type="button" onClick={() => void onDuplicateDocument(rowMenuDoc)}>
                {t('documents.actionDuplicate')}
              </button>
            )}
            {rowMenuDoc.documentType === 'ChargeInvoice' && rowMenuDoc.status === 'Open' && (
              <button
                type="button"
                onClick={() => {
                  setRowMenuDoc(null);
                  void onPayment(rowMenuDoc);
                }}
              >
                {t('documents.recordPayment')}
              </button>
            )}
            {canManageDocument(rowMenuDoc) && (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setRowMenuDoc(null);
                  setDeleteTarget(rowMenuDoc);
                }}
              >
                {t('documents.actionDelete')}
              </button>
            )}
          </>
        )}
      </CatalogRowMenu>

      <DocumentPdfPreviewModal
        open={pdfPreviewDoc !== null}
        title={
          pdfPreviewDoc
            ? `${t('documents.types.Quote')} ${pdfPreviewDoc.documentNumber.replace(/^[A-Z]+-/, '')}`
            : ''
        }
        pdfUrl={pdfPreviewUrl}
        loading={pdfPreviewLoading}
        error={pdfPreviewError}
        onClose={closePdfPreview}
        onDownload={
          pdfPreviewDoc && token
            ? () => void documentsApi.downloadPdf(token, pdfPreviewDoc.id, quotePdfFileName(pdfPreviewDoc))
            : undefined
        }
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('documents.deleteConfirmTitle')}
        message={t('documents.deleteConfirm', { number: deleteTarget?.documentNumber ?? '' })}
        confirmLabel={t('documents.actionDelete')}
        cancelLabel={t('settings.cancel')}
        danger
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !deleteBusy && setDeleteTarget(null)}
      />

      {wizardType && token && (
        <DocumentCreateWizard
          open
          documentType={wizardType}
          token={token}
          customers={customers}
          products={products}
          editDocumentId={editDocumentId}
          duplicateFromDocumentId={duplicateFromDocumentId}
          onClose={closeWizard}
          onSuccess={(msg) => {
            setMessage(msg);
            closeWizard();
            load();
          }}
          onCustomersUpdated={reloadCustomers}
        />
      )}

      <AppModal open={createOpen} onClose={() => setCreateOpen(false)} size="md">
            <h2>{t(`documents.types.${createType}`)}</h2>
            <form className="form-grid" onSubmit={onCreate}>
              {error && <div className="error-banner">{error}</div>}
              {createType === 'Receipt' ? (
                <label>
                  {t('documents.parentInvoice')}
                  <select
                    value={form.parentDocumentId}
                    onChange={(e) => setForm({ ...form, parentDocumentId: e.target.value })}
                    required
                  >
                    <option value="">—</option>
                    {openCharges.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.documentNumber} — {d.customerName} ({formatMoney(d.totalAmount)})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label>
                    {t('orders.customer')}
                    <select
                      value={form.customerId}
                      onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                      required
                    >
                      <option value="">—</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('products.name')}
                    <select
                      value={form.productId}
                      onChange={(e) => setForm({ ...form, productId: e.target.value })}
                      required
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.articleCode} — {p.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('warehouse.qty')}
                    <input
                      type="number"
                      min={0.0001}
                      step={1}
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                      required
                    />
                  </label>
                  {createType === 'Quote' && (
                    <label>
                      {t('documents.colDue')}
                      <input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                      />
                    </label>
                  )}
                  <label>
                    {t('documents.colDescription')}
                    <input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </label>
                </>
              )}
              {(createType === 'Receipt' || createType === 'ChargeInvoice') && (
                <label>
                  {t('documents.colPayment')}
                  <input
                    value={form.paymentMethod}
                    onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}
                    placeholder={t('documents.paymentPlaceholder')}
                  />
                </label>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost-inline" onClick={() => setCreateOpen(false)}>
                  {t('settings.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">{t('submit')}</button>
              </div>
            </form>
      </AppModal>
    </div>
  );
}
