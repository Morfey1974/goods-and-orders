import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { catalogApi } from '../api/catalog';
import { documentsApi, type Document, type DocumentListResponse } from '../api/documents';
import { useAuth } from '../context/AuthContext';
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
  const [products, setProducts] = useState<{ id: string; articleCode: string; name: string }[]>([]);
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
      setProducts(p.filter((x) => x.isActive).map((x) => ({ id: x.id, articleCode: x.articleCode, name: x.name })))
    );
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const openCharges = useMemo(() => {
    if (!data) return [];
    return data.groups.flatMap((g) =>
      g.documents.filter((d) => d.documentType === 'ChargeInvoice' && d.status === 'Open')
    );
  }, [data]);

  const openCreate = (type: 'Quote' | 'ChargeInvoice' | 'Receipt') => {
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
    setMenuOpen(false);
    setCreateOpen(true);
    setError('');
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
              <button type="button" onClick={() => openCreate('Receipt')}>
                {t('documents.types.Receipt')}
              </button>
              <button type="button" onClick={() => openCreate('ChargeInvoice')}>
                {t('documents.types.ChargeInvoice')}
              </button>
              <button type="button" onClick={() => openCreate('Quote')}>
                {t('documents.types.Quote')}
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
      {error && !createOpen && <div className="error-banner">{error}</div>}

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
                        <code>{doc.documentNumber.replace(/^[A-Z]+-/, '')}</code>
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
                      {doc.documentType === 'ChargeInvoice' && doc.status === 'Open' && (
                        <button
                          type="button"
                          className="btn btn-ghost-inline"
                          onClick={() => onPayment(doc)}
                        >
                          {t('documents.recordPayment')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {createOpen && (
        <div className="modal-overlay" onClick={() => setCreateOpen(false)}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}
    </div>
  );
}
